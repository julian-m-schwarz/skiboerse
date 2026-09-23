from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('desk', 'Desk'),
        ('reporter', 'Reporter'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='desk')

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"

    class Meta:
        app_label = "skiboerse"


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    if hasattr(instance, 'profile'):
        instance.profile.save()


class Seller(models.Model):
    seller_number = models.IntegerField(unique=True, editable=False, null=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    street = models.CharField(max_length=200, blank=True, default='')
    street_number = models.CharField(max_length=20, blank=True, default='')
    postal_code = models.CharField(max_length=20, blank=True, default='')
    city = models.CharField(max_length=100, blank=True, default='')
    mobile_number = models.CharField(max_length=20)
    is_member = models.BooleanField(default=False)
    acceptance_fee_paid = models.BooleanField(default=False)
    is_major_seller = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    # Numbers 1-10 are reserved for Großverkäufer, everyone else starts above.
    MAJOR_SELLER_NUMBERS = range(1, 11)
    REGULAR_SELLER_START_NUMBER = 11

    @classmethod
    def next_major_seller_number(cls):
        """Lowest free number in the Großverkäufer range, or None if full.

        Checks every seller rather than only major ones so numbers handed out
        under the previous scheme cannot collide with a new assignment.
        """
        taken = set(
            cls.objects.filter(seller_number__in=cls.MAJOR_SELLER_NUMBERS)
            .values_list("seller_number", flat=True)
        )
        return next((n for n in cls.MAJOR_SELLER_NUMBERS if n not in taken), None)

    def save(self, *args, **kwargs):
        if not self.seller_number:
            with transaction.atomic():
                if self.is_major_seller:
                    number = self.next_major_seller_number()
                    if number is None:
                        raise ValidationError(
                            f"Alle Großverkäufer-Nummern "
                            f"({self.MAJOR_SELLER_NUMBERS.start}-{self.MAJOR_SELLER_NUMBERS.stop - 1}) "
                            f"sind bereits vergeben."
                        )
                    self.seller_number = number
                else:
                    latest_seller = (
                        Seller.objects.select_for_update()
                        .filter(
                            is_major_seller=False,
                            seller_number__gte=self.REGULAR_SELLER_START_NUMBER,
                        )
                        .order_by("-seller_number")
                        .first()
                    )
                    if latest_seller:
                        self.seller_number = latest_seller.seller_number + 1
                    else:
                        self.seller_number = self.REGULAR_SELLER_START_NUMBER
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)

    def accepted_items(self):
        """Handed-in items, filtered in Python to reuse the prefetch cache."""
        return [item for item in self.items.all() if item.accepted_at]

    def calculate_acceptance_fee(self):
        """
        Calculate acceptance fee based on item count and active status.
        - Major sellers: 0€
        - Active club members (is_member, shown as "Aktive"): 0€
        - Others with < 20 items: 5€
        - Others with >= 20 items: 10€
        Uses len() so a prefetched items cache is reused instead of issuing a COUNT query.
        """
        if self.is_major_seller or self.is_member:
            return 0

        item_count = len(self.accepted_items())
        if item_count < 20:
            return 5.00
        else:
            return 10.00

    def commission_rate(self):
        """Active club members (is_member, shown as "Aktive") pay no commission."""
        return 0 if self.is_member else 0.10

    def calculate_payout(self):
        """
        Calculate final payout for seller.
        Returns dict with breakdown of calculation.
        Uses len() / list comprehensions so prefetched items cache is reused.
        """
        all_items = self.accepted_items()
        sold_items = [item for item in all_items if item.is_sold]
        stolen_items = [item for item in all_items if item.is_stolen and not item.is_sold]

        total_sales = sum(float(item.price) for item in sold_items)
        stolen_revenue = sum(float(item.price) for item in stolen_items)
        total_revenue = total_sales + stolen_revenue

        # 10% commission on total (sold + stolen); active members pay none
        commission = self.commission_rate() * total_revenue

        # Calculate acceptance fee
        acceptance_fee = self.calculate_acceptance_fee()

        # Deduct acceptance fee only if not paid
        fee_to_deduct = 0 if self.acceptance_fee_paid else acceptance_fee

        # Final payout
        final_payout = total_revenue - commission - fee_to_deduct

        return {
            "total_sales": round(total_revenue, 2),
            "commission": round(commission, 2),
            "commission_waived": self.is_member,
            "acceptance_fee": round(acceptance_fee, 2),
            "acceptance_fee_paid": self.acceptance_fee_paid,
            "fee_deducted": round(fee_to_deduct, 2),
            "final_payout": round(final_payout, 2),
            "sold_items_count": len(sold_items),
            "stolen_items_count": len(stolen_items),
            "stolen_revenue": round(stolen_revenue, 2),
            "total_items_count": len(all_items),
        }

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    class Meta:
        app_label = "skiboerse"
        ordering = ["-created_at"]  # Newest first


class ItemQuerySet(models.QuerySet):
    def accepted(self):
        """Items that were actually handed in.

        Anything still pending was entered ahead of the event and never
        delivered, so it is not missing and cannot be returned or picked up -
        it must stay out of the return and payout process entirely.
        """
        return self.filter(accepted_at__isnull=False)


class Item(models.Model):
    CATEGORY_CHOICES = [
        ("Ski", "Ski"),
        ("Snowboard", "Snowboard"),
        ("Skischuhe", "Skischuhe"),
        ("Snowboardboots", "Snowboardboots"),
        ("Skibindung", "Skibindung"),
        ("Snowboardbindung", "Snowboardbindung"),
        ("Skistoecke", "Skistoecke"),
        ("Helm", "Helm"),
        ("Skibrille", "Skibrille"),
        ("Bekleidung", "Bekleidung"),
        ("Zubehoer", "Zubehoer"),
        ("Sonstiges", "Sonstiges"),
    ]

    CONDITION_CHOICES = [
        ("Excellent", "Excellent - Like New"),
        ("Good", "Good - Minor Wear"),
        ("Fair", "Fair - Some Wear"),
        ("Used", "Used - Significant Wear"),
    ]

    name = models.CharField(max_length=200, blank=True)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    brand = models.CharField(max_length=100, blank=True)
    color = models.CharField(max_length=50, blank=True)
    size = models.CharField(max_length=50, blank=True)
    condition = models.CharField(max_length=50, choices=CONDITION_CHOICES, blank=True, default='')
    price = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    seller = models.ForeignKey(Seller, on_delete=models.CASCADE, related_name="items")
    barcode = models.CharField(max_length=20, unique=True, editable=False, blank=True)
    is_sold = models.BooleanField(default=False, db_index=True)
    is_stolen = models.BooleanField(default=False, db_index=True)
    sold_at = models.DateTimeField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    picked_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    accepted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = ItemQuerySet.as_manager()

    def __str__(self):
        return f"{self.barcode} - {self.category} - ${self.price}"

    @property
    def is_accepted(self):
        return self.accepted_at is not None

    def save(self, *args, **kwargs):
        # Regular sellers hand their goods over at the desk, so those items
        # count as accepted the moment they are entered. A major seller's items
        # are entered ahead of the event and are only accepted once they
        # physically arrive.
        if self._state.adding and self.accepted_at is None and not self.seller.is_major_seller:
            self.accepted_at = timezone.now()

        if not self.barcode:
            with transaction.atomic():
                seller_num = self.seller.seller_number if self.seller.seller_number else 1

                # Lock rows for this seller's barcodes to prevent duplicates
                latest_item = (
                    Item.objects.select_for_update()
                    .filter(seller=self.seller, barcode__startswith=f"S{seller_num:03d}-")
                    .order_by("-barcode")
                    .first()
                )

                if latest_item:
                    try:
                        last_count = int(latest_item.barcode.split("-")[1])
                        next_count = last_count + 1
                    except (IndexError, ValueError):
                        next_count = 1
                else:
                    next_count = 1

                self.barcode = f"S{seller_num:03d}-{next_count:03d}"
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)

    class Meta:
        app_label = "skiboerse"
        ordering = ["-created_at"]  # Newest first


class Sale(models.Model):
    PAYMENT_CHOICES = [
        ('cash', 'Bar'),
        ('card', 'Karte'),
    ]

    items = models.ManyToManyField(Item, related_name="sales")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    sale_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    payment_method = models.CharField(max_length=10, choices=PAYMENT_CHOICES, default='cash')

    def __str__(self):
        return f"Sale #{self.id} - ${self.total_amount} ({self.sale_date.strftime('%Y-%m-%d')})"

    class Meta:
        app_label = "skiboerse"
        ordering = ["-sale_date"]

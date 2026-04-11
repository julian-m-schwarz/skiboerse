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
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.seller_number:
            with transaction.atomic():
                latest_seller = (
                    Seller.objects.select_for_update()
                    .order_by("-seller_number")
                    .first()
                )
                if latest_seller and latest_seller.seller_number:
                    self.seller_number = latest_seller.seller_number + 1
                else:
                    self.seller_number = 1
                super().save(*args, **kwargs)
        else:
            super().save(*args, **kwargs)

    def calculate_acceptance_fee(self):
        """
        Calculate acceptance fee based on item count and membership status.
        - Members: 0€
        - Non-members with < 20 items: 5€
        - Non-members with >= 20 items: 10€
        Uses len() so a prefetched items cache is reused instead of issuing a COUNT query.
        """
        if self.is_member:
            return 0

        item_count = len(self.items.all())
        if item_count < 20:
            return 5.00
        else:
            return 10.00

    def calculate_payout(self):
        """
        Calculate final payout for seller.
        Returns dict with breakdown of calculation.
        Uses len() / list comprehensions so prefetched items cache is reused.
        """
        all_items = list(self.items.all())
        sold_items = [item for item in all_items if item.is_sold]
        total_sales = sum(float(item.price) for item in sold_items)

        # Calculate 10% commission
        commission = total_sales * 0.10

        # Calculate acceptance fee
        acceptance_fee = self.calculate_acceptance_fee()

        # Deduct acceptance fee only if not paid
        fee_to_deduct = 0 if self.acceptance_fee_paid else acceptance_fee

        # Final payout
        final_payout = total_sales - commission - fee_to_deduct

        return {
            "total_sales": round(total_sales, 2),
            "commission": round(commission, 2),
            "acceptance_fee": round(acceptance_fee, 2),
            "acceptance_fee_paid": self.acceptance_fee_paid,
            "fee_deducted": round(fee_to_deduct, 2),
            "final_payout": round(final_payout, 2),
            "sold_items_count": len(sold_items),
            "total_items_count": len(all_items),
        }

    def __str__(self):
        return f"{self.first_name} {self.last_name}"

    class Meta:
        app_label = "skiboerse"
        ordering = ["-created_at"]  # Newest first


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
    sold_at = models.DateTimeField(null=True, blank=True)
    returned_at = models.DateTimeField(null=True, blank=True, db_index=True)
    picked_up_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.barcode} - {self.category} - ${self.price}"

    def save(self, *args, **kwargs):
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

from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Seller, Item, Sale, UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role']


class UserSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source='profile.role', read_only=True)
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'password', 'role']
        read_only_fields = ['id']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User.objects.create_user(
            username=validated_data['username'],
            password=password
        )
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        instance.username = validated_data.get('username', instance.username)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class UserWithRoleSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(
        choices=UserProfile.ROLE_CHOICES,
        source='profile.role'
    )
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'password', 'role']
        read_only_fields = ['id']

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        password = validated_data.pop('password', None)
        user = User.objects.create_user(
            username=validated_data['username'],
            password=password or 'changeme123'
        )
        if profile_data:
            user.profile.role = profile_data.get('role', 'desk')
            user.profile.save()
        return user

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', {})
        password = validated_data.pop('password', None)

        instance.username = validated_data.get('username', instance.username)
        if password:
            instance.set_password(password)
        instance.save()

        if profile_data:
            instance.profile.role = profile_data.get('role', instance.profile.role)
            instance.profile.save()

        return instance


class SellerSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    item_count = serializers.SerializerMethodField()
    acceptance_fee = serializers.SerializerMethodField()

    class Meta:
        model = Seller
        fields = [
            "id",
            "seller_number",
            "first_name",
            "last_name",
            "full_name",
            "street",
            "street_number",
            "postal_code",
            "city",
            "mobile_number",
            "is_member",
            "acceptance_fee_paid",
            "acceptance_fee",
            "item_count",
            "created_at",
        ]
        read_only_fields = ["created_at", "full_name", "seller_number", "item_count", "acceptance_fee"]

    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}"

    def get_item_count(self, obj):
        # Use len() to hit the prefetch_related cache instead of issuing a COUNT query
        return len(obj.items.all())

    def get_acceptance_fee(self, obj):
        return obj.calculate_acceptance_fee()


class ItemSerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()
    seller_mobile = serializers.SerializerMethodField()
    payment_method = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "category",
            "brand",
            "color",
            "size",
            "condition",
            "price",
            "description",
            "seller",
            "seller_name",
            "seller_mobile",
            "barcode",
            "is_sold",
            "sold_at",
            "returned_at",
            "picked_up_at",
            "payment_method",
            "created_at",
        ]
        read_only_fields = ["created_at", "seller_name", "seller_mobile", "barcode", "sold_at", "returned_at", "picked_up_at", "payment_method"]

    def get_seller_name(self, obj):
        return f"{obj.seller.first_name} {obj.seller.last_name}"

    def get_seller_mobile(self, obj):
        return obj.seller.mobile_number

    def get_payment_method(self, obj):
        sale = obj.sales.first()
        return sale.payment_method if sale else None


class ItemBarcodeSerializer(serializers.ModelSerializer):
    seller_name = serializers.SerializerMethodField()
    payment_method = serializers.SerializerMethodField()

    class Meta:
        model = Item
        fields = [
            "id",
            "name",
            "category",
            "brand",
            "color",
            "size",
            "price",
            "seller_name",
            "barcode",
            "is_sold",
            "returned_at",
            "picked_up_at",
            "payment_method",
        ]

    def get_seller_name(self, obj):
        return f"{obj.seller.first_name} {obj.seller.last_name}"

    def get_payment_method(self, obj):
        sale = obj.sales.first()
        return sale.payment_method if sale else None


class SaleSerializer(serializers.ModelSerializer):
    items_detail = ItemBarcodeSerializer(source="items", many=True, read_only=True)

    class Meta:
        model = Sale
        fields = ["id", "items", "items_detail", "total_amount", "sale_date", "notes", "payment_method"]
        read_only_fields = ["sale_date"]

    def validate(self, data):
        items = data.get('items', [])
        computed_total = sum(float(item.price) for item in items)
        data['total_amount'] = round(computed_total, 2)
        return data

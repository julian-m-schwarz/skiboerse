import subprocess
import platform
from rest_framework import viewsets, status
from django.db import transaction
from rest_framework.decorators import api_view, action, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth import authenticate, login, logout
from django.contrib.sessions.models import Session
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.views.generic import TemplateView
from django.utils import timezone
from django.contrib.auth.models import User
from .models import Seller, Item, Sale, UserProfile
from .serializers import SellerSerializer, ItemSerializer, ItemBarcodeSerializer, SaleSerializer, UserWithRoleSerializer


class SellerViewSet(viewsets.ModelViewSet):
    queryset = Seller.objects.prefetch_related('items').all()
    serializer_class = SellerSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        seller_number = self.request.query_params.get('seller_number')
        if seller_number is not None:
            qs = qs.filter(seller_number=seller_number)
        return qs

    @action(detail=True, methods=['get'])
    def payout(self, request, pk=None):
        """
        Calculate payout for a seller.
        GET /api/sellers/{id}/payout/
        Returns payout breakdown including sold items, commission, fees, and final amount.
        """
        seller = self.get_object()
        payout_data = seller.calculate_payout()

        # Add seller info
        payout_data['seller'] = {
            'id': seller.id,
            'seller_number': seller.seller_number,
            'full_name': f"{seller.first_name} {seller.last_name}",
            'mobile_number': seller.mobile_number,
            'is_member': seller.is_member,
            'acceptance_fee_paid': seller.acceptance_fee_paid
        }

        # Load all items once, filter in Python to avoid extra DB queries
        all_items = list(seller.items.select_related('seller').all())
        sold_items = [i for i in all_items if i.is_sold]
        unsold_returned = [i for i in all_items if not i.is_sold and i.returned_at]
        stolen_items = [i for i in all_items if i.is_stolen and not i.is_sold]
        unsold_not_returned = [i for i in all_items if not i.is_sold and not i.returned_at and not i.is_stolen]

        payout_data['sold_items'] = ItemBarcodeSerializer(sold_items, many=True).data
        payout_data['unsold_returned'] = ItemBarcodeSerializer(unsold_returned, many=True).data
        payout_data['stolen_items'] = ItemBarcodeSerializer(stolen_items, many=True).data
        payout_data['unsold_not_returned'] = ItemBarcodeSerializer(unsold_not_returned, many=True).data
        payout_data['seller_all_done'] = len(unsold_not_returned) == 0

        return Response(payout_data)

    @action(detail=True, methods=['post'])
    def bulk_return(self, request, pk=None):
        """
        Mark all unreturned unsold items as returned.
        POST /api/sellers/{id}/bulk_return/
        """
        seller = self.get_object()
        now = timezone.now()
        updated = seller.items.filter(is_sold=False, returned_at__isnull=True, is_stolen=False).update(returned_at=now)
        return Response({'success': True, 'returned_count': updated})

    @action(detail=True, methods=['post'])
    def pickup(self, request, pk=None):
        """
        Mark all seller's items as picked up.
        POST /api/sellers/{id}/pickup/
        Only allowed if all items are sold or returned.
        """
        seller = self.get_object()

        # Check if all items are sold, returned, or marked as stolen
        pending_items = seller.items.filter(is_sold=False, returned_at__isnull=True, is_stolen=False)
        if pending_items.count() > 0:
            return Response(
                {'error': 'Nicht alle Artikel wurden zurückgemeldet', 'pending_count': pending_items.count()},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Mark all items as picked up
        now = timezone.now()
        updated_count = seller.items.filter(picked_up_at__isnull=True).update(picked_up_at=now)

        return Response({'success': True, 'updated': updated_count})


class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.select_related('seller').prefetch_related('sales').all()
    serializer_class = ItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        seller_id = self.request.query_params.get('seller')
        if seller_id is not None:
            qs = qs.filter(seller_id=seller_id)
        return qs

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """List all items that are not sold and not returned."""
        items = Item.objects.filter(
            is_sold=False, returned_at__isnull=True
        ).select_related('seller').order_by('seller__seller_number', 'barcode')

        data = []
        for item in items:
            data.append({
                'id': item.id,
                'barcode': item.barcode,
                'category': item.category,
                'brand': item.brand,
                'color': item.color,
                'size': item.size,
                'price': str(item.price),
                'seller_number': item.seller.seller_number,
                'seller_name': f"{item.seller.first_name} {item.seller.last_name}",
            })

        return Response(data)

    @action(detail=False, methods=['get'])
    def by_barcode(self, request):
        """Lookup item by barcode: /api/items/by_barcode/?barcode=SKI-123"""
        barcode = request.query_params.get('barcode')
        if not barcode:
            return Response(
                {'error': 'Barcode parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            item = Item.objects.prefetch_related('sales').get(barcode=barcode)
            serializer = ItemBarcodeSerializer(item)
            data = serializer.data

            # Check if all seller's items are sold or returned
            pending = Item.objects.filter(
                seller=item.seller, is_sold=False, returned_at__isnull=True
            ).count()
            data['seller_all_done'] = pending == 0

            return Response(data)
        except Item.DoesNotExist:
            return Response(
                {'error': 'Item not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=['get'])
    def available(self, request):
        """Get unsold items: /api/items/available/"""
        items = Item.objects.filter(is_sold=False)
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def print_label(self, request, pk=None):
        """
        Generate a label for an item and return as base64 image.
        POST /api/items/{id}/print_label/
        Returns base64 encoded PNG image for client-side printing.
        """
        import base64
        from io import BytesIO

        item = self.get_object()

        try:
            import barcode
            from barcode.writer import ImageWriter
            from PIL import Image, ImageDraw, ImageFont

            label_width = 500
            label_height = 250

            # Generate barcode directly into BytesIO — no temp files needed
            code128 = barcode.get('code128', item.barcode, writer=ImageWriter())
            barcode_options = {
                'module_width': 0.3,
                'module_height': 8,
                'font_size': 8,
                'text_distance': 2,
                'quiet_zone': 2,
            }
            barcode_buffer = BytesIO()
            code128.write(barcode_buffer, options=barcode_options)
            barcode_buffer.seek(0)
            barcode_img = Image.open(barcode_buffer)

            # Create label image
            label = Image.new('RGB', (label_width, label_height), 'white')
            draw = ImageDraw.Draw(label)

            # Try to use a system font, fall back to default
            try:
                font_large = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 18)
                font_medium = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14)
                font_price = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
            except (OSError, IOError):
                try:
                    font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
                    font_medium = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
                    font_price = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 24)
                except (OSError, IOError):
                    font_large = ImageFont.load_default()
                    font_medium = ImageFont.load_default()
                    font_price = ImageFont.load_default()

            # Resize barcode to fit label width
            barcode_aspect = barcode_img.width / barcode_img.height
            barcode_new_width = label_width - 40
            barcode_new_height = int(barcode_new_width / barcode_aspect)
            if barcode_new_height > 100:
                barcode_new_height = 100
                barcode_new_width = int(barcode_new_height * barcode_aspect)
            barcode_img = barcode_img.resize((barcode_new_width, barcode_new_height), Image.LANCZOS)

            # Paste barcode centered at top
            barcode_x = (label_width - barcode_new_width) // 2
            label.paste(barcode_img, (barcode_x, 5))

            # Text area below barcode
            text_y = barcode_new_height + 10
            draw.text((10, text_y), item.category, fill='black', font=font_large)

            desc_parts = []
            if item.brand:
                desc_parts.append(item.brand)
            if item.color:
                desc_parts.append(item.color)
            if item.size:
                desc_parts.append(f"Gr. {item.size}")
            desc_text = "  |  ".join(desc_parts) if desc_parts else ""
            text_y += 24
            if desc_text:
                draw.text((10, text_y), desc_text, fill='black', font=font_medium)

            # Price - right aligned
            text_y += 24
            price_text = f"{item.price} EUR"
            price_bbox = draw.textbbox((0, 0), price_text, font=font_price)
            price_width = price_bbox[2] - price_bbox[0]
            draw.text((label_width - price_width - 10, text_y), price_text, fill='black', font=font_price)

            # Convert to base64
            buffer = BytesIO()
            label.save(buffer, format='PNG')
            image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

            return Response({
                'success': True,
                'image': image_base64,
                'barcode': item.barcode
            })

        except ImportError:
            return Response({
                'success': False,
                'error': 'Druckbibliotheken nicht installiert (python-barcode, Pillow)'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
            return Response({
                'success': False,
                'error': f'Fehler beim Erstellen des Labels: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['post'])
    def verify_return(self, request):
        """
        Mark an item as returned by barcode.
        POST /api/items/verify_return/
        Body: {"barcode": "S001-001"}
        Sets returned_at timestamp on the item.
        """
        barcode = request.data.get('barcode')
        if not barcode:
            return Response(
                {'error': 'Barcode erforderlich'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            item = Item.objects.get(barcode=barcode)

            if item.is_sold:
                return Response({
                    'error': 'Artikel wurde verkauft',
                    'item': ItemSerializer(item).data
                }, status=status.HTTP_400_BAD_REQUEST)

            was_already_returned = item.returned_at is not None
            item.returned_at = timezone.now()
            item.save()

            # Check if all seller's items are sold or returned
            pending = Item.objects.filter(
                seller=item.seller, is_sold=False, returned_at__isnull=True
            ).count()

            return Response({
                'success': True,
                'message': 'Artikel erneut rückgemeldet' if was_already_returned else 'Artikel rückgemeldet',
                'was_already_returned': was_already_returned,
                'seller_all_done': pending == 0,
                'item': ItemSerializer(item).data
            })
        except Item.DoesNotExist:
            return Response(
                {'error': 'Artikel nicht gefunden'},
                status=status.HTTP_404_NOT_FOUND
            )


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer

    def create(self, request, *args, **kwargs):
        item_ids = request.data.get('items', [])

        with transaction.atomic():
            # Lock the rows so no concurrent request can read is_sold=False for the same items
            items = Item.objects.select_for_update().filter(pk__in=item_ids)

            already_sold = [item.barcode for item in items if item.is_sold]
            if already_sold:
                return Response(
                    {'error': 'Artikel bereits verkauft', 'barcodes': already_sold},
                    status=status.HTTP_400_BAD_REQUEST
                )

            response = super().create(request, *args, **kwargs)

            if response.status_code == status.HTTP_201_CREATED:
                sale = Sale.objects.get(pk=response.data['id'])
                sale.items.update(is_sold=True, sold_at=timezone.now(), returned_at=None)

        return response


@api_view(['GET'])
def device_status(request):
    """
    Check connected USB devices for barcode scanner and label printer.
    GET /api/devices/status/
    Returns: {"scanner": true/false, "printer": true/false, "devices": [...]}
    Result is cached for 15 seconds to avoid repeated subprocess calls on the Pi.
    """
    from django.core.cache import cache

    cache_key = 'device_status_result'
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    scanner_connected = False
    printer_connected = False
    detected_devices = []

    scanner_keywords = ['scanner', 'barcode', 'symbol', 'honeywell', 'zebex',
                        'datalogic', 'opticon', 'metrologic', 'hid']
    printer_keywords = ['printer', 'label', 'zebra', 'dymo', 'brother',
                        'tsc', 'bixolon', 'citizen', 'epson']

    try:
        system = platform.system()
        if system == 'Darwin':
            result = subprocess.run(
                ['system_profiler', 'SPUSBDataType', '-detailLevel', 'mini'],
                capture_output=True, text=True, timeout=5
            )
            usb_output = result.stdout.lower()
            for line in result.stdout.split('\n'):
                line_stripped = line.strip()
                if line_stripped and ':' not in line_stripped and line_stripped not in ('', 'USB:'):
                    detected_devices.append(line_stripped)

            for keyword in scanner_keywords:
                if keyword in usb_output:
                    scanner_connected = True
                    break

            for keyword in printer_keywords:
                if keyword in usb_output:
                    printer_connected = True
                    break

        elif system == 'Linux':
            result = subprocess.run(
                ['lsusb'], capture_output=True, text=True, timeout=5
            )
            usb_output = result.stdout.lower()
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    detected_devices.append(line.strip())

            for keyword in scanner_keywords:
                if keyword in usb_output:
                    scanner_connected = True
                    break

            for keyword in printer_keywords:
                if keyword in usb_output:
                    printer_connected = True
                    break

    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        pass

    result_data = {
        'scanner': scanner_connected,
        'printer': printer_connected,
        'devices': detected_devices
    }
    cache.set(cache_key, result_data, 15)

    return Response(result_data)


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'Benutzername und Passwort erforderlich'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(request, username=username, password=password)
    if user is not None:
        # Block reporter login when return check is disabled
        try:
            role = user.profile.role
        except UserProfile.DoesNotExist:
            role = 'desk'

        if role == 'reporter':
            from django.core.cache import cache
            if not cache.get('return_check_open', False):
                return Response(
                    {'error': 'Artikelrückmeldung ist derzeit gesperrt. Bitte warten Sie auf die Freigabe.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # Delete any existing sessions for this user to allow re-login
        # without O(N) scan of all sessions
        user_id_str = str(user.id)
        for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
            try:
                if session.get_decoded().get('_auth_user_id') == user_id_str:
                    session.delete()
            except Exception:
                continue

        login(request, user)
        return Response({'username': user.username})
    else:
        return Response(
            {'error': 'Ungültiger Benutzername oder Passwort'},
            status=status.HTTP_401_UNAUTHORIZED
        )


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def logout_view(request):
    logout(request)
    return Response({'success': True})


@api_view(['GET'])
@permission_classes([AllowAny])
@ensure_csrf_cookie
def session_view(request):
    if request.user.is_authenticated:
        # Get or create user profile
        profile, created = UserProfile.objects.get_or_create(
            user=request.user,
            defaults={'role': 'admin' if request.user.is_superuser else 'desk'}
        )
        return Response({
            'isAuthenticated': True,
            'username': request.user.username,
            'role': profile.role,
        })
    return Response({'isAuthenticated': False})


def is_admin(user):
    """Check if user has admin role."""
    if not user.is_authenticated:
        return False
    try:
        return user.profile.role == 'admin' or user.is_superuser
    except UserProfile.DoesNotExist:
        return user.is_superuser


@api_view(['GET'])
def user_list(request):
    """List all users (admin only)."""
    if not is_admin(request.user):
        return Response(
            {'error': 'Keine Berechtigung'},
            status=status.HTTP_403_FORBIDDEN
        )
    users = User.objects.all().select_related('profile')
    serializer = UserWithRoleSerializer(users, many=True)
    return Response(serializer.data)


@api_view(['POST'])
def user_create(request):
    """Create a new user (admin only)."""
    if not is_admin(request.user):
        return Response(
            {'error': 'Keine Berechtigung'},
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = UserWithRoleSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        return Response(UserWithRoleSerializer(user).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT', 'DELETE'])
def user_detail(request, pk):
    """Get, update or delete a user (admin only)."""
    if not is_admin(request.user):
        return Response(
            {'error': 'Keine Berechtigung'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        user = User.objects.select_related('profile').get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {'error': 'Benutzer nicht gefunden'},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == 'GET':
        serializer = UserWithRoleSerializer(user)
        return Response(serializer.data)

    elif request.method == 'PUT':
        serializer = UserWithRoleSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        if user == request.user:
            return Response(
                {'error': 'Eigenen Benutzer nicht löschen'},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
def user_change_password(request, pk):
    """Change a user's password (admin only)."""
    if not is_admin(request.user):
        return Response(
            {'error': 'Keine Berechtigung'},
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response(
            {'error': 'Benutzer nicht gefunden'},
            status=status.HTTP_404_NOT_FOUND
        )

    new_password = request.data.get('password')
    if not new_password:
        return Response(
            {'error': 'Passwort erforderlich'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_password)
    user.save()
    return Response({'success': True, 'message': 'Passwort geändert'})


@api_view(['GET'])
@permission_classes([AllowAny])
def return_check_status(request):
    """GET /api/return-check/status/ — returns whether reporter login is open."""
    from django.core.cache import cache
    is_open = cache.get('return_check_open', False)
    return Response({'open': is_open})


@api_view(['POST'])
def return_check_toggle(request):
    """POST /api/return-check/toggle/ — admin toggles reporter access."""
    if not is_admin(request.user):
        return Response({'error': 'Keine Berechtigung'}, status=status.HTTP_403_FORBIDDEN)

    from django.core.cache import cache
    current = cache.get('return_check_open', False)
    new_state = not current
    cache.set('return_check_open', new_state, timeout=None)

    if not new_state:
        # Log out all reporter sessions
        for session in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
            try:
                data = session.get_decoded()
                user_id = data.get('_auth_user_id')
                if user_id:
                    u = User.objects.get(pk=user_id)
                    if u.profile.role == 'reporter':
                        session.delete()
            except Exception:
                continue

    return Response({'open': new_state})


@api_view(['GET'])
def analytics(request):
    """GET /api/analytics/ — aggregated stats for the admin dashboard."""
    if not is_admin(request.user):
        return Response({'error': 'Keine Berechtigung'}, status=status.HTTP_403_FORBIDDEN)

    items = list(Item.objects.select_related('seller').all())
    sold = [i for i in items if i.is_sold]
    unsold = [i for i in items if not i.is_sold]
    returned = [i for i in unsold if i.returned_at]
    pending = [i for i in unsold if not i.returned_at]

    total_revenue = sum(float(i.price) for i in sold)
    commission = round(total_revenue * 0.10, 2)

    # By category
    categories = {}
    for item in items:
        c = item.category
        if c not in categories:
            categories[c] = {'category': c, 'total': 0, 'sold': 0, 'revenue': 0.0}
        categories[c]['total'] += 1
        if item.is_sold:
            categories[c]['sold'] += 1
            categories[c]['revenue'] += float(item.price)
    by_category = sorted(categories.values(), key=lambda x: x['revenue'], reverse=True)

    # Top sellers by revenue
    sellers = {}
    for item in sold:
        sid = item.seller_id
        if sid not in sellers:
            sellers[sid] = {
                'name': f"{item.seller.first_name} {item.seller.last_name}",
                'number': item.seller.seller_number,
                'sold': 0,
                'revenue': 0.0,
            }
        sellers[sid]['sold'] += 1
        sellers[sid]['revenue'] += float(item.price)
    top_sellers = sorted(sellers.values(), key=lambda x: x['revenue'], reverse=True)[:10]

    # Price range distribution
    ranges = [
        {'label': '0-10 EUR', 'min': 0, 'max': 10},
        {'label': '10-25 EUR', 'min': 10, 'max': 25},
        {'label': '25-50 EUR', 'min': 25, 'max': 50},
        {'label': '50-100 EUR', 'min': 50, 'max': 100},
        {'label': '> 100 EUR', 'min': 100, 'max': None},
    ]
    for r in ranges:
        r['count'] = sum(
            1 for i in items
            if float(i.price) >= r['min'] and (r['max'] is None or float(i.price) < r['max'])
        )
        r['sold'] = sum(
            1 for i in sold
            if float(i.price) >= r['min'] and (r['max'] is None or float(i.price) < r['max'])
        )

    # Club profit: commission on sold items + acceptance fees already paid
    sellers_all = list(Seller.objects.prefetch_related('items').all())
    acceptance_fees_paid = sum(
        seller.calculate_acceptance_fee()
        for seller in sellers_all
        if seller.acceptance_fee_paid
    )
    club_profit = round(commission + acceptance_fees_paid, 2)

    # Payment method breakdown
    sales = Sale.objects.prefetch_related('items').all()
    cash_revenue = sum(float(s.total_amount) for s in sales if s.payment_method == 'cash')
    card_revenue = sum(float(s.total_amount) for s in sales if s.payment_method == 'card')
    cash_count = sum(s.items.count() for s in sales if s.payment_method == 'cash')
    card_count = sum(s.items.count() for s in sales if s.payment_method == 'card')

    return Response({
        'total_items': len(items),
        'sold_count': len(sold),
        'unsold_count': len(unsold),
        'returned_count': len(returned),
        'pending_count': len(pending),
        'total_revenue': round(total_revenue, 2),
        'commission': commission,
        'acceptance_fees_paid': round(acceptance_fees_paid, 2),
        'club_profit': club_profit,
        'net_payout': round(total_revenue - commission, 2),
        'by_category': by_category,
        'top_sellers': top_sellers,
        'price_ranges': ranges,
        'payment': {
            'cash_revenue': round(cash_revenue, 2),
            'card_revenue': round(card_revenue, 2),
            'cash_count': cash_count,
            'card_count': card_count,
        },
    })


@api_view(['GET'])
def price_histogram(request):
    """GET /api/analytics/price-histogram/?category=Ski — price distribution for a category."""
    if not is_admin(request.user):
        return Response({'error': 'Keine Berechtigung'}, status=status.HTTP_403_FORBIDDEN)

    category = request.query_params.get('category', '')
    qs = Item.objects.all()
    if category:
        qs = qs.filter(category=category)

    items = list(qs.values('price', 'is_sold'))
    if not items:
        return Response({'buckets': [], 'category': category})

    prices = [float(i['price']) for i in items]
    min_price = min(prices)
    max_price = max(prices)

    # Dynamic bucket width: aim for ~8 buckets, rounded to a nice number
    raw_width = (max_price - min_price) / 8 if max_price > min_price else 10
    for nice in [1, 2, 5, 10, 15, 20, 25, 50, 100]:
        if nice >= raw_width:
            bucket_width = nice
            break
    else:
        bucket_width = 100

    # Build buckets starting from floor of min_price
    import math
    start = math.floor(min_price / bucket_width) * bucket_width
    end = math.ceil(max_price / bucket_width) * bucket_width + bucket_width

    buckets = []
    b = start
    while b < end:
        bucket_items = [i for i in items if b <= float(i['price']) < b + bucket_width]
        buckets.append({
            'label': f'{int(b)}–{int(b + bucket_width)} €',
            'min': b,
            'max': b + bucket_width,
            'total': len(bucket_items),
            'sold': sum(1 for i in bucket_items if i['is_sold']),
        })
        b += bucket_width

    # Remove leading/trailing empty buckets
    while buckets and buckets[0]['total'] == 0:
        buckets.pop(0)
    while buckets and buckets[-1]['total'] == 0:
        buckets.pop()

    return Response({'buckets': buckets, 'category': category})


class FrontendView(TemplateView):
    template_name = "index.html"

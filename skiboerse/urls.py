from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SellerViewSet, ItemViewSet, SaleViewSet, device_status,
    login_view, logout_view, session_view,
    user_list, user_create, user_detail, user_change_password
)

# Create a router and register our viewsets
router = DefaultRouter()
router.register(r"sellers", SellerViewSet, basename="seller")
router.register(r"items", ItemViewSet, basename="item")
router.register(r"sales", SaleViewSet, basename="sale")

# The API URLs are determined automatically by the router
urlpatterns = [
    path("api/auth/login/", login_view, name="api-login"),
    path("api/auth/logout/", logout_view, name="api-logout"),
    path("api/auth/session/", session_view, name="api-session"),
    path("api/users/", user_list, name="user-list"),
    path("api/users/create/", user_create, name="user-create"),
    path("api/users/<int:pk>/", user_detail, name="user-detail"),
    path("api/users/<int:pk>/change-password/", user_change_password, name="user-change-password"),
    path("api/", include(router.urls)),
    path("api/devices/status/", device_status, name="device-status"),
]

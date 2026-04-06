from django.contrib import admin
from django.urls import path, include, re_path
from skiboerse.views import FrontendView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", include("skiboerse.urls")),
    re_path(r"^.*$", FrontendView.as_view(), name="frontend"),  # Catch-all for React Router
]

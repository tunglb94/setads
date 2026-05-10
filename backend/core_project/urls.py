from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.meta_ads.urls")),
    path("api/", include("apps.ai_analyzer.urls")),
    path("api/", include("apps.automations.urls")),
    path("api/auth/", include("apps.users.urls")),
    path("api/", include("apps.messenger.urls")),
]

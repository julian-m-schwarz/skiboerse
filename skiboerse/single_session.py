"""Only one active session per user.

Each user's profile records the session that logged in last. A second login
is refused while that session is still in use, and any other session that
shows up for the user is logged out.

A session that has gone quiet counts as abandoned after SESSION_IDLE_TIMEOUT,
so a laptop that went to sleep or a browser that crashed does not lock the
account for the full cookie lifetime. The frontend sends a heartbeat well
within that window while the app is open.
"""
from datetime import timedelta
from importlib import import_module

from django.conf import settings
from django.contrib.auth import logout
from django.utils import timezone

from .models import UserProfile

SESSION_IDLE_TIMEOUT = timedelta(minutes=3)
# Writing last_seen on every request would be wasted SD card writes on the Pi.
TOUCH_INTERVAL = timedelta(seconds=30)

# Login and logout manage the registration themselves.
EXEMPT_PATHS = ("/api/auth/login/", "/api/auth/logout/")

SESSION_ENDED_HEADER = "X-Session-Ended"
# Left in a taken-over session so that device can be told why it is out.
REPLACED_FLAG = "_replaced_by_other_device"


def get_profile(user, for_update=False):
    queryset = UserProfile.objects.select_for_update() if for_update else UserProfile.objects
    profile, _ = queryset.get_or_create(
        user=user,
        defaults={"role": "admin" if user.is_superuser else "desk"},
    )
    return profile


def session_store(session_key):
    return import_module(settings.SESSION_ENGINE).SessionStore(session_key=session_key)


def end_session(session_key):
    """Delete a session for good.

    Deleting only the Session row is not enough with the cached_db backend:
    the cached copy keeps the session alive.
    """
    if session_key:
        session_store(session_key).delete()


def replace_session(session_key):
    """Log out a device whose session was taken over, leaving it a note."""
    if not session_key:
        return
    store = session_store(session_key)
    if not store.exists(session_key):
        return
    store.clear()
    store[REPLACED_FLAG] = True
    store.save()


def has_active_session(profile, now=None):
    """Whether another device is still using this user's registered session."""
    if not profile.session_key or profile.last_seen is None:
        return False
    if (now or timezone.now()) - profile.last_seen > SESSION_IDLE_TIMEOUT:
        return False
    return session_store(profile.session_key).exists(profile.session_key)


def register_session(profile, session_key):
    profile.session_key = session_key
    profile.last_seen = timezone.now()
    profile.save(update_fields=["session_key", "last_seen"])


def clear_session(profile):
    profile.session_key = ""
    profile.last_seen = None
    profile.save(update_fields=["session_key", "last_seen"])


class SingleSessionMiddleware:
    """Log out any session that is not the user's registered one."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        replaced = False
        if request.path.startswith("/api/") and request.path not in EXEMPT_PATHS:
            if request.user.is_authenticated:
                replaced = self.check(request)
            elif request.session.get(REPLACED_FLAG):
                request.session.flush()
                replaced = True

        response = self.get_response(request)
        if replaced:
            response[SESSION_ENDED_HEADER] = "replaced"
        return response

    def check(self, request):
        profile = get_profile(request.user)
        session_key = request.session.session_key
        now = timezone.now()

        if not profile.session_key:
            # Logged in before this check existed: the first device to show
            # up keeps the account, any other one is logged out below.
            register_session(profile, session_key)
            return False

        if profile.session_key != session_key:
            logout(request)
            return True

        if profile.last_seen is None or now - profile.last_seen > TOUCH_INTERVAL:
            UserProfile.objects.filter(pk=profile.pk).update(last_seen=now)
        return False

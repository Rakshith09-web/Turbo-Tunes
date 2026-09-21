from urllib.parse import urlencode

from django.contrib.auth.views import LoginView
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.http import url_has_allowed_host_and_scheme

from accounts.forms import RegistrationForm, SiteAuthenticationForm
from accounts.models import Profile
from cars.models import Car


def showcase_car():
    """The car pictured beside the login and register forms."""
    return Car.objects.exclude(thumbnail="").exclude(thumbnail=None).first()


def safe_next(request):
    target = request.POST.get("next") or request.GET.get("next") or ""
    allowed = url_has_allowed_host_and_scheme(
        target, allowed_hosts={request.get_host()}, require_https=request.is_secure()
    )
    return target if allowed else ""


class SiteLoginView(LoginView):
    template_name = "accounts/login.html"
    authentication_form = SiteAuthenticationForm
    redirect_authenticated_user = True

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["showcase_car"] = showcase_car()
        return context


def register(request):
    next_url = safe_next(request)
    if request.method == "POST":
        form = RegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            Profile.objects.create(user=user)
            login_url = reverse("login")
            return redirect(f"{login_url}?{urlencode({'next': next_url})}" if next_url else login_url)
    else:
        form = RegistrationForm()
    return render(
        request,
        "accounts/register.html",
        {"form": form, "next": next_url, "showcase_car": showcase_car()},
    )

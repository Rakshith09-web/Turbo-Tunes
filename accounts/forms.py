from django.contrib.auth.forms import AuthenticationForm, UserCreationForm

from autocraft.formstyle import style_form


class RegistrationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        fields = ("username",)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "Username"
        self.fields["username"].help_text = "Letters, numbers and @ . + - _ only."
        self.fields["username"].widget.attrs.update({"autocomplete": "username", "autofocus": True})
        self.fields["password1"].label = "Password"
        self.fields["password1"].help_text = "At least 8 characters, and not something easy to guess."
        self.fields["password1"].widget.attrs["autocomplete"] = "new-password"
        self.fields["password2"].label = "Confirm password"
        self.fields["password2"].help_text = ""
        self.fields["password2"].widget.attrs["autocomplete"] = "new-password"
        style_form(self)


class SiteAuthenticationForm(AuthenticationForm):
    error_messages = {
        "invalid_login": "That username and password don't match. Check them and try again.",
        "inactive": "This account is inactive.",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["username"].label = "Username"
        self.fields["username"].widget.attrs.update({"autocomplete": "username", "autofocus": True})
        self.fields["password"].label = "Password"
        self.fields["password"].widget.attrs["autocomplete"] = "current-password"
        style_form(self)

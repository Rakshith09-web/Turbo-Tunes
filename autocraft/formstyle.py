from django import forms

TEXT_LIKE = (
    forms.TextInput,
    forms.Textarea,
    forms.DateInput,
    forms.PasswordInput,
    forms.EmailInput,
    forms.NumberInput,
    forms.Select,
)


def style_form(form):
    """Give every text-like input in `form` the site's `input` class."""
    for field in form.fields.values():
        widget = field.widget
        if isinstance(widget, TEXT_LIKE) and not isinstance(widget, forms.RadioSelect):
            existing = widget.attrs.get("class", "")
            widget.attrs["class"] = f"{existing} input".strip()
    return form

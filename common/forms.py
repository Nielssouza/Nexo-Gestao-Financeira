from django import forms

INPUT_CLASS = (
    "w-full min-w-0 rounded-2xl border border-slate-700 bg-slate-900/85 px-4 py-3 text-base sm:text-sm "
    "text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-slate-500 "
    "focus:outline-none focus:ring-2 focus:ring-slate-500/20"
)
CHECKBOX_CLASS = (
    "h-5 w-5 rounded border-slate-600 bg-slate-900 text-violet-500 "
    "focus:ring-violet-500"
)


def style_form_fields(form: forms.BaseForm) -> None:
    for field in form.fields.values():
        existing_classes = field.widget.attrs.get("class", "")
        if isinstance(field.widget, forms.CheckboxInput):
            field.widget.attrs["class"] = f"{existing_classes} {CHECKBOX_CLASS}".strip()
            continue

        field.widget.attrs["class"] = f"{existing_classes} {INPUT_CLASS}".strip()

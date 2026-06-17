from django.contrib import messages
from django.shortcuts import redirect
from django.urls import reverse_lazy
from django.views.generic import CreateView, DetailView, ListView, UpdateView

from common.mixins import UserAssignMixin, UserQuerySetMixin
from investments.forms import InvestmentEntryForm, InvestmentForm
from investments.models import Investment, InvestmentEntry


class InvestmentListView(UserQuerySetMixin, ListView):
    model = Investment
    template_name = "investments/investment_list.html"
    context_object_name = "investments"

    def get_queryset(self):
        return super().get_queryset().prefetch_related("entries")


class InvestmentCreateView(UserAssignMixin, CreateView):
    model = Investment
    form_class = InvestmentForm
    template_name = "investments/investment_form.html"
    success_url = reverse_lazy("investments:list")

    def form_valid(self, form):
        messages.success(self.request, "Investimento criado com sucesso.")
        return super().form_valid(form)


class InvestmentUpdateView(UserQuerySetMixin, UpdateView):
    model = Investment
    form_class = InvestmentForm
    template_name = "investments/investment_form.html"

    def get_success_url(self):
        messages.success(self.request, "Investimento atualizado com sucesso.")
        return reverse_lazy("investments:detail", kwargs={"pk": self.object.pk})


class InvestmentDetailView(UserQuerySetMixin, DetailView):
    model = Investment
    template_name = "investments/investment_detail.html"
    context_object_name = "investment"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["entries"] = self.object.entries.all()[:50]
        context["entry_form"] = kwargs.get("entry_form") or InvestmentEntryForm()
        return context

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        form = InvestmentEntryForm(request.POST)
        form.instance.investment = self.object
        form.instance.user = request.user

        if form.is_valid():
            form.instance.tenant = getattr(request, "tenant", None)
            form.save()
            messages.success(request, "Lancamento registrado.")
            return redirect("investments:detail", pk=self.object.pk)

        context = self.get_context_data(entry_form=form)
        return self.render_to_response(context, status=400)

from calendar import monthrange

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.generic import CreateView, DeleteView, DetailView, ListView, UpdateView, View

from common.mixins import UserAssignMixin, UserQuerySetMixin
from invoices.forms import ClientForm, InvoiceForm, InvoicePayForm
from invoices.models import Client, Invoice
from invoices.service_codes import SERVICE_CODES
from transactions.models import Transaction


def _invoice_transaction_amount(invoice):
    return invoice.gross_value - invoice.deductions


def _invoice_transaction_description(invoice):
    return f"Fatura {invoice.number_display} - {invoice.client_name}"


def _sync_invoice_transaction(invoice, *, user, tenant, launch_financial):
    if launch_financial:
        if invoice.transaction:
            txn = invoice.transaction
            txn.amount = _invoice_transaction_amount(invoice)
            txn.date = invoice.due_date or invoice.issue_date
            txn.account = invoice.expected_account
            txn.description = _invoice_transaction_description(invoice)
            txn.recurrence_type = invoice.recurrence_type
            txn.recurrence_interval = invoice.recurrence_interval
            txn.recurrence_interval_unit = invoice.recurrence_interval_unit
            txn.installment_count = invoice.installment_count
            txn.save(
                update_fields=[
                    "amount",
                    "date",
                    "account",
                    "description",
                    "recurrence_type",
                    "recurrence_interval",
                    "recurrence_interval_unit",
                    "installment_count",
                ]
            )
            txn.generate_future_occurrences()
            return txn

        txn = Transaction.objects.create(
            user=user,
            tenant=tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=_invoice_transaction_amount(invoice),
            date=invoice.due_date or invoice.issue_date,
            account=invoice.expected_account,
            description=_invoice_transaction_description(invoice),
            is_cleared=False,
            recurrence_type=invoice.recurrence_type,
            recurrence_interval=invoice.recurrence_interval,
            recurrence_interval_unit=invoice.recurrence_interval_unit,
            installment_count=invoice.installment_count,
        )
        invoice.transaction = txn
        invoice.save(update_fields=["transaction"])
        txn.generate_future_occurrences()
        return txn

    if invoice.transaction and not invoice.transaction.is_cleared:
        invoice.transaction.delete()
        invoice.transaction = None
        invoice.save(update_fields=["transaction"])
    return None


class InvoiceListView(UserQuerySetMixin, ListView):
    model = Invoice
    template_name = "invoices/invoice_list.html"
    context_object_name = "invoices"

    def _default_month_range(self):
        today = timezone.localdate()
        month_last_day = monthrange(today.year, today.month)[1]
        return today.replace(day=1), today.replace(day=month_last_day)

    def _get_date_filters(self):
        default_start, default_end = self._default_month_range()
        start_date = (
            parse_date(self.request.GET.get("start_date", ""))
            if "start_date" in self.request.GET
            else default_start
        )
        end_date = (
            parse_date(self.request.GET.get("end_date", ""))
            if "end_date" in self.request.GET
            else default_end
        )
        return start_date, end_date

    def get_queryset(self):
        qs = super().get_queryset()
        status = self.request.GET.get("status")
        start_date, end_date = self._get_date_filters()

        if status in (Invoice.DRAFT, Invoice.ISSUED, Invoice.PAID, Invoice.CANCELLED):
            qs = qs.filter(status=status)
        if start_date:
            qs = qs.filter(issue_date__gte=start_date)
        if end_date:
            qs = qs.filter(issue_date__lte=end_date)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        default_start, default_end = self._default_month_range()
        summary = ctx["invoices"].aggregate(
            total_gross=Sum("gross_value"),
            invoice_count=Count("id"),
        )
        ctx["active_status"] = self.request.GET.get("status", "")
        ctx["start_date"] = self.request.GET.get("start_date", default_start.isoformat())
        ctx["end_date"] = self.request.GET.get("end_date", default_end.isoformat())
        ctx["status_choices"] = Invoice.STATUS_CHOICES
        ctx["summary_total_gross"] = summary["total_gross"] or 0
        ctx["summary_invoice_count"] = summary["invoice_count"] or 0
        return ctx


class InvoiceCreateView(UserAssignMixin, CreateView):
    model = Invoice
    form_class = InvoiceForm
    template_name = "invoices/invoice_form.html"

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["tenant"] = self.request.tenant
        return kwargs

    def form_valid(self, form):
        form.instance.number = Invoice.next_number(self.request.tenant)
        form.instance.status = Invoice.ISSUED
        launch_financial = form.cleaned_data["launch_financial"]

        save_client = self.request.POST.get("save_client") == "1"
        if save_client and form.instance.client_document:
            Client.objects.get_or_create(
                user=self.request.user,
                tenant=self.request.tenant,
                document=form.instance.client_document,
                defaults={
                    "name": form.instance.client_name,
                    "email": form.instance.client_email,
                    "address": form.instance.client_address,
                    "city": form.instance.client_city,
                },
            )

        response = super().form_valid(form)
        _sync_invoice_transaction(
            form.instance,
            user=self.request.user,
            tenant=self.request.tenant,
            launch_financial=launch_financial,
        )
        return response

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["service_codes"] = SERVICE_CODES
        return ctx

    def get_success_url(self):
        return reverse("invoices:detail", kwargs={"pk": self.object.pk})


class InvoiceDetailView(UserQuerySetMixin, DetailView):
    model = Invoice
    template_name = "invoices/invoice_detail.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        if self.object.status == Invoice.ISSUED:
            ctx["pay_form"] = InvoicePayForm(tenant=self.request.tenant)
        code = self.object.service_code
        ctx["service_code_description"] = dict(SERVICE_CODES).get(code, "")
        return ctx


class InvoicePrintView(UserQuerySetMixin, DetailView):
    model = Invoice
    template_name = "invoices/invoice_print.html"
    context_object_name = "invoice"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["service_code_description"] = dict(SERVICE_CODES).get(self.object.service_code, "")
        return ctx


class InvoiceNfseGuideView(UserQuerySetMixin, DetailView):
    model = Invoice
    template_name = "invoices/invoice_nfse_guide.html"
    context_object_name = "invoice"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["service_code_description"] = dict(SERVICE_CODES).get(self.object.service_code, "")
        return ctx


class InvoiceNfseEmitView(UserQuerySetMixin, View):
    def post(self, request, pk):
        from django.utils import timezone as tz
        from invoices.tasks import emit_nfse_task

        invoice = get_object_or_404(Invoice, pk=pk, tenant=request.tenant)

        if not hasattr(request.tenant, "nfse_credential"):
            messages.error(request, "Configure suas credenciais gov.br antes de emitir.")
            return redirect(reverse("tenants:nfse-credential"))

        if invoice.nfse_status == Invoice.NFSE_PROCESSING:
            messages.info(request, "A emissão já está em andamento.")
            return redirect(reverse("invoices:nfse-status", args=[pk]))

        invoice.nfse_status = Invoice.NFSE_PENDING
        invoice.nfse_requested_at = tz.now()
        invoice.nfse_error = ""
        invoice.save(update_fields=["nfse_status", "nfse_requested_at", "nfse_error"])

        try:
            emit_nfse_task.delay(invoice.pk)
        except Exception:
            emit_nfse_task.apply(args=[invoice.pk])
        return redirect(reverse("invoices:nfse-status", args=[pk]))


class InvoiceNfseStatusView(UserQuerySetMixin, DetailView):
    model = Invoice
    template_name = "invoices/invoice_nfse_status.html"
    context_object_name = "invoice"

    _TIMEOUT_SECONDS = 300  # 5 minutos (maior que o soft_time_limit da task)

    def _check_timeout(self, invoice):
        if invoice.nfse_status not in (Invoice.NFSE_PENDING, Invoice.NFSE_PROCESSING):
            return
        if not invoice.nfse_requested_at:
            return
        elapsed = (timezone.now() - invoice.nfse_requested_at).total_seconds()
        if elapsed > self._TIMEOUT_SECONDS:
            invoice.nfse_status = Invoice.NFSE_FAILED
            invoice.nfse_error = (
                "Tempo limite excedido. O worker de processamento pode estar inativo "
                "ou o portal demorou demais para responder."
            )
            invoice.save(update_fields=["nfse_status", "nfse_error"])

    def get(self, request, *args, **kwargs):
        invoice = self.get_object()
        self._check_timeout(invoice)
        if request.headers.get("HX-Request"):
            from django.template.loader import render_to_string
            html = render_to_string(
                "invoices/partials/nfse_status_card.html",
                {"invoice": invoice},
                request=request,
            )
            from django.http import HttpResponse as HR
            return HR(html)
        return super().get(request, *args, **kwargs)


class InvoiceUpdateView(UserQuerySetMixin, UserAssignMixin, UpdateView):
    model = Invoice
    form_class = InvoiceForm
    template_name = "invoices/invoice_form.html"

    def get_queryset(self):
        return super().get_queryset().filter(status=Invoice.ISSUED)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["tenant"] = self.request.tenant
        return kwargs

    def form_valid(self, form):
        response = super().form_valid(form)
        launch_financial = form.cleaned_data["launch_financial"]
        _sync_invoice_transaction(
            form.instance,
            user=self.request.user,
            tenant=self.request.tenant,
            launch_financial=launch_financial,
        )
        return response

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["service_codes"] = SERVICE_CODES
        return ctx

    def get_success_url(self):
        return reverse("invoices:detail", kwargs={"pk": self.object.pk})


class InvoiceDeleteView(UserQuerySetMixin, DeleteView):
    model = Invoice
    template_name = "invoices/invoice_confirm_delete.html"
    success_url = reverse_lazy("invoices:list")

    def form_valid(self, form):
        if self.object.transaction and not self.object.transaction.is_cleared:
            self.object.transaction.delete()
        return super().form_valid(form)

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user, tenant=self.request.tenant)


class InvoicePayView(UserQuerySetMixin, View):
    def post(self, request, pk):
        invoice = get_object_or_404(self.get_queryset(), pk=pk, status=Invoice.ISSUED)
        form = InvoicePayForm(request.POST, tenant=request.tenant)
        if not form.is_valid():
            messages.error(request, "Revise os dados do recebimento.")
            return redirect("invoices:detail", pk=pk)

        if form.cleaned_data["launch_financial"]:
            if invoice.transaction:
                txn = invoice.transaction
                txn.is_cleared = True
                txn.date = form.cleaned_data["paid_at"]
                txn.account = form.cleaned_data["account"]
                txn.description = _invoice_transaction_description(invoice)
                txn.save(
                    update_fields=[
                        "is_cleared",
                        "date",
                        "account",
                        "description",
                        "updated_at",
                    ]
                )
            else:
                txn = Transaction.objects.create(
                    user=request.user,
                    tenant=request.tenant,
                    transaction_type=Transaction.TransactionType.INCOME,
                    amount=invoice.net_value,
                    date=form.cleaned_data["paid_at"],
                    account=form.cleaned_data["account"],
                    description=_invoice_transaction_description(invoice),
                    is_cleared=True,
                    recurrence_type=Transaction.RecurrenceType.ONCE,
                )
        else:
            if invoice.transaction and not invoice.transaction.is_cleared:
                invoice.transaction.delete()
            txn = None
        invoice.status = Invoice.PAID
        invoice.paid_at = form.cleaned_data["paid_at"]
        invoice.transaction = txn
        invoice.save(update_fields=["status", "paid_at", "transaction", "updated_at"])
        if txn:
            messages.success(
                request,
                f"Nota {invoice.number_display} marcada como paga. Receita lancada.",
            )
        else:
            messages.success(
                request,
                f"Nota {invoice.number_display} marcada como paga sem lancamento financeiro.",
            )
        return redirect("invoices:detail", pk=pk)

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user, tenant=self.request.tenant)


class InvoiceCancelView(UserQuerySetMixin, View):
    def post(self, request, pk):
        invoice = get_object_or_404(self.get_queryset(), pk=pk)
        if invoice.status == Invoice.PAID:
            messages.error(request, "Nota paga nao pode ser cancelada.")
            return redirect("invoices:detail", pk=pk)
        invoice.status = Invoice.CANCELLED
        if invoice.transaction and not invoice.transaction.is_cleared:
            invoice.transaction.delete()
        invoice.save(update_fields=["status", "updated_at"])
        messages.success(request, f"Nota {invoice.number_display} cancelada.")
        return redirect("invoices:list")

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user, tenant=self.request.tenant)


class ClientCheckView(View):
    def get(self, request):
        if not request.user.is_authenticated:
            from django.http import JsonResponse

            return JsonResponse({"exists": False})

        doc = request.GET.get("doc", "").strip()
        name = request.GET.get("name", "").strip()

        if not doc and not name:
            from django.http import JsonResponse

            return JsonResponse({"exists": True})

        qs = Client.objects.filter(user=request.user, tenant=request.tenant)

        if doc:
            import re

            digits = re.sub(r"\D", "", doc)
            exists = qs.filter(document__icontains=digits).exists()
        else:
            exists = qs.filter(name__iexact=name).exists()

        from django.http import JsonResponse

        return JsonResponse({"exists": exists})


class ClientSearchView(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponse("", content_type="text/html")
        q = request.GET.get("q", "").strip()
        clients = Client.objects.filter(user=request.user, tenant=request.tenant).order_by("name")
        if q:
            clients = clients.filter(name__icontains=q)
        clients = clients[:10]
        from django.template.loader import render_to_string

        html = render_to_string(
            "invoices/partials/client_search_results.html",
            {"clients": clients, "q": q},
            request=request,
        )
        return HttpResponse(html, content_type="text/html")


class ClientPrefillView(View):
    def get(self, request, pk):
        client = get_object_or_404(Client, pk=pk, user=request.user, tenant=request.tenant)
        from django.template.loader import render_to_string

        html = render_to_string(
            "invoices/partials/client_fields.html",
            {"client": client},
            request=request,
        )
        return HttpResponse(html, content_type="text/html")


class ClientCreateView(UserAssignMixin, CreateView):
    model = Client
    form_class = ClientForm
    template_name = "invoices/client_form.html"
    success_url = reverse_lazy("invoices:create")

    def form_valid(self, form):
        messages.success(self.request, "Cliente salvo com sucesso.")
        return super().form_valid(form)


class ClientUpdateView(LoginRequiredMixin, UpdateView):
    model = Client
    form_class = ClientForm
    template_name = "invoices/client_form.html"
    success_url = reverse_lazy("invoices:client-list")

    def get_queryset(self):
        return Client.objects.filter(user=self.request.user, tenant=self.request.tenant)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["is_edit"] = True
        return ctx

    def form_valid(self, form):
        messages.success(self.request, "Cliente atualizado com sucesso.")
        return super().form_valid(form)


class ClientListView(UserQuerySetMixin, ListView):
    model = Client
    template_name = "invoices/client_list.html"
    context_object_name = "clients"


class CnpjLookupView(LoginRequiredMixin, View):
    def get(self, request, cnpj):
        import re

        import requests as req
        from django.http import JsonResponse

        digits = re.sub(r"\D", "", cnpj)
        if len(digits) != 14:
            return JsonResponse({"error": "CNPJ invalido."}, status=400)

        try:
            resp = req.get(
                f"https://brasilapi.com.br/api/cnpj/v1/{digits}",
                timeout=8,
                headers={"User-Agent": "Nexo-Gestao/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return JsonResponse({"error": "Nao foi possivel consultar o CNPJ."}, status=502)

        address_parts = filter(
            None,
            [
                data.get("logradouro"),
                data.get("numero"),
                data.get("complemento"),
                data.get("bairro"),
            ],
        )
        city_parts = filter(None, [data.get("municipio"), data.get("uf")])

        return JsonResponse(
            {
                "name": data.get("razao_social") or data.get("nome_fantasia") or "",
                "email": data.get("email") or "",
                "phone": data.get("ddd_telefone_1") or data.get("telefone") or "",
                "address": ", ".join(address_parts),
                "city": " / ".join(city_parts),
            }
        )

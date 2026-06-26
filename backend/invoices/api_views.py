import re

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Account
from common.api_mixins import TenantQuerySetMixin
from invoices.models import Client, Invoice
from invoices.serializers import ClientSerializer, InvoicePaySerializer, InvoiceSerializer
from invoices.views import _invoice_transaction_description, _sync_invoice_transaction


class InvoiceViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("expected_account").all()
    serializer_class = InvoiceSerializer
    search_fields = ("client_name", "client_document", "service_description")
    filterset_fields = {
        "status": ["exact"],
        "issue_date": ["exact", "gte", "lte"],
        "due_date": ["exact", "gte", "lte"],
    }
    ordering_fields = ("number", "issue_date", "gross_value")
    ordering = ("-number",)

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        launch_financial = serializer.validated_data.pop("launch_financial", False)
        save_client = serializer.validated_data.pop("save_client", False)

        invoice = serializer.save(
            user=self.request.user,
            tenant=tenant,
            number=Invoice.next_number(tenant),
        )

        if save_client and invoice.client_document:
            Client.objects.get_or_create(
                user=self.request.user,
                tenant=tenant,
                document=invoice.client_document,
                defaults={
                    "name": invoice.client_name,
                    "email": invoice.client_email,
                    "address": invoice.client_address,
                    "city": invoice.client_city,
                },
            )

        _sync_invoice_transaction(
            invoice,
            user=self.request.user,
            tenant=tenant,
            launch_financial=launch_financial,
        )

    def perform_update(self, serializer):
        # SSR InvoiceUpdateView only allows editing ISSUED invoices
        if serializer.instance.status != Invoice.ISSUED:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Apenas faturas emitidas podem ser editadas."})

        launch_financial = serializer.validated_data.pop("launch_financial", False)
        serializer.validated_data.pop("save_client", None)
        invoice = serializer.save()

        _sync_invoice_transaction(
            invoice,
            user=self.request.user,
            tenant=self.get_tenant(),
            launch_financial=launch_financial,
        )

    def perform_destroy(self, instance):
        # SSR InvoiceDeleteView deletes the uncleared transaction before deleting the invoice
        if instance.transaction and not instance.transaction.is_cleared:
            instance.transaction.delete()
        instance.delete()

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """Mark invoice as paid and create the income transaction (mirrors InvoicePayView)."""
        invoice = self.get_object()
        if invoice.status != Invoice.ISSUED:
            return Response(
                {"detail": "Apenas faturas emitidas podem ser pagas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pay_serializer = InvoicePaySerializer(data=request.data)
        pay_serializer.is_valid(raise_exception=True)

        tenant = self.get_tenant()
        account = Account.objects.filter(
            tenant=tenant,
            pk=pay_serializer.validated_data["account"],
        ).first()
        if not account:
            return Response(
                {"detail": "Conta não encontrada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if pay_serializer.validated_data.get("launch_financial", False):
            if invoice.transaction:
                txn = invoice.transaction
                txn.is_cleared = True
                txn.date = pay_serializer.validated_data["paid_at"]
                txn.account = account
                txn.description = _invoice_transaction_description(invoice)
                txn.save(update_fields=["is_cleared", "date", "account", "description", "updated_at"])
            else:
                from transactions.models import Transaction
                txn = Transaction.objects.create(
                    user=request.user,
                    tenant=tenant,
                    transaction_type=Transaction.TransactionType.INCOME,
                    amount=invoice.net_value,
                    date=pay_serializer.validated_data["paid_at"],
                    account=account,
                    description=_invoice_transaction_description(invoice),
                    is_cleared=True,
                    recurrence_type=Transaction.RecurrenceType.ONCE,
                )
                invoice.transaction = txn
                invoice.save(update_fields=["transaction"])
        else:
            if invoice.transaction and not invoice.transaction.is_cleared:
                invoice.transaction.delete()
            txn = None

        invoice.status = Invoice.PAID
        invoice.paid_at = pay_serializer.validated_data["paid_at"]
        invoice.transaction = txn
        invoice.save(update_fields=["status", "paid_at", "transaction", "updated_at"])

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel an invoice (mirrors InvoiceCancelView — rejects PAID invoices)."""
        invoice = self.get_object()

        if invoice.status == Invoice.PAID:
            return Response(
                {"detail": "Nota paga não pode ser cancelada."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if invoice.status == Invoice.CANCELLED:
            return Response(
                {"detail": "Fatura já cancelada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice.status = Invoice.CANCELLED
        if invoice.transaction and not invoice.transaction.is_cleared:
            invoice.transaction.delete()
        invoice.save(update_fields=["status", "updated_at"])

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"])
    def nfse_emit(self, request, pk=None):
        """Trigger NFSe emission (mirrors InvoiceNfseEmitView)."""
        from django.utils import timezone as tz

        invoice = self.get_object()
        tenant = self.get_tenant()

        if not hasattr(tenant, "nfse_credential"):
            return Response(
                {"detail": "Configure suas credenciais gov.br antes de emitir."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if invoice.nfse_status == Invoice.NFSE_PROCESSING:
            return Response(
                {"detail": "A emissão já está em andamento.", "nfse_status": invoice.nfse_status},
                status=status.HTTP_200_OK,
            )

        invoice.nfse_status = Invoice.NFSE_PENDING
        invoice.nfse_requested_at = tz.now()
        invoice.nfse_error = ""
        invoice.save(update_fields=["nfse_status", "nfse_requested_at", "nfse_error"])

        try:
            from invoices.tasks import emit_nfse_task
            emit_nfse_task.delay(invoice.pk)
        except Exception:
            from invoices.tasks import emit_nfse_task
            emit_nfse_task.apply(args=[invoice.pk])

        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["get"])
    def nfse_status(self, request, pk=None):
        """Return NFSe status with timeout check (mirrors InvoiceNfseStatusView)."""
        from django.utils import timezone as tz

        _TIMEOUT_SECONDS = 300
        invoice = self.get_object()

        if invoice.nfse_status in (Invoice.NFSE_PENDING, Invoice.NFSE_PROCESSING):
            if invoice.nfse_requested_at:
                elapsed = (tz.now() - invoice.nfse_requested_at).total_seconds()
                if elapsed > _TIMEOUT_SECONDS:
                    invoice.nfse_status = Invoice.NFSE_FAILED
                    invoice.nfse_error = (
                        "Tempo limite excedido. O worker de processamento pode estar inativo "
                        "ou o portal demorou demais para responder."
                    )
                    invoice.save(update_fields=["nfse_status", "nfse_error"])

        return Response({
            "nfse_status": invoice.nfse_status,
            "nfse_error": invoice.nfse_error,
            "nfse_requested_at": invoice.nfse_requested_at,
        })


class ClientViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    search_fields = ("name", "document", "email")
    ordering_fields = ("name", "created_at")
    ordering = ("name",)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())

    @action(detail=False, methods=["get"])
    def check(self, request):
        """Check if a client exists by doc or name (mirrors ClientCheckView)."""
        doc = request.query_params.get("doc", "").strip()
        name = request.query_params.get("name", "").strip()

        if not doc and not name:
            return Response({"exists": True})

        qs = Client.objects.filter(tenant=self.get_tenant())

        if doc:
            digits = re.sub(r"\D", "", doc)
            exists = qs.filter(document__icontains=digits).exists()
        else:
            exists = qs.filter(name__iexact=name).exists()

        return Response({"exists": exists})

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search clients by name, returns JSON (mirrors ClientSearchView)."""
        q = request.query_params.get("q", "").strip()
        qs = Client.objects.filter(tenant=self.get_tenant()).order_by("name")
        if q:
            qs = qs.filter(name__icontains=q)
        serializer = ClientSerializer(qs[:10], many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def prefill(self, request, pk=None):
        """Return client data for form prefill (mirrors ClientPrefillView)."""
        client = self.get_object()
        return Response(ClientSerializer(client).data)

    @action(detail=False, methods=["get"])
    def cnpj_lookup(self, request):
        """Consult BrasilAPI for CNPJ data (mirrors CnpjLookupView)."""
        import requests as req

        cnpj = request.query_params.get("cnpj", "").strip()
        digits = re.sub(r"\D", "", cnpj)

        if len(digits) != 14:
            return Response({"error": "CNPJ inválido."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            resp = req.get(
                f"https://brasilapi.com.br/api/cnpj/v1/{digits}",
                timeout=8,
                headers={"User-Agent": "Nexo-Gestao/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return Response(
                {"error": "Não foi possível consultar o CNPJ."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        address_parts = list(filter(
            None,
            [data.get("logradouro"), data.get("numero"), data.get("complemento"), data.get("bairro")],
        ))
        city_parts = list(filter(None, [data.get("municipio"), data.get("uf")]))

        return Response({
            "name": data.get("razao_social") or data.get("nome_fantasia") or "",
            "email": data.get("email") or "",
            "phone": data.get("ddd_telefone_1") or data.get("telefone") or "",
            "address": ", ".join(address_parts),
            "city": " / ".join(city_parts),
        })

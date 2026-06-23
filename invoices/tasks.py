import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0, name="invoices.emit_nfse")
def emit_nfse_task(self, invoice_id: int) -> dict:
    from invoices.models import Invoice
    from invoices.nfse_automation import emit_nfse
    from invoices.nfse_crypto import decrypt_password

    try:
        invoice = Invoice.objects.select_related("tenant__nfse_credential").get(pk=invoice_id)
    except Invoice.DoesNotExist:
        return {"ok": False, "error": "Fatura não encontrada."}

    credential = getattr(invoice.tenant, "nfse_credential", None)
    if not credential:
        invoice.nfse_status = Invoice.NFSE_FAILED
        invoice.nfse_error = "Credenciais gov.br não cadastradas."
        invoice.save(update_fields=["nfse_status", "nfse_error"])
        return {"ok": False, "error": invoice.nfse_error}

    invoice.nfse_status = Invoice.NFSE_PROCESSING
    invoice.save(update_fields=["nfse_status"])

    invoice_data = {
        "client_name": invoice.client_name,
        "client_document": invoice.client_document,
        "client_email": invoice.client_email,
        "client_address": invoice.client_address,
        "client_city": invoice.client_city,
        "service_code": invoice.service_code,
        "service_description": invoice.service_description,
        "competencia": invoice.issue_date.strftime("%m/%Y"),
        "gross_value": str(invoice.gross_value),
        "deductions": str(invoice.deductions),
        "iss_rate": str(invoice.iss_rate),
        "iss_withheld": invoice.iss_withheld,
    }

    try:
        nfse_number = emit_nfse(
            cpf=credential.gov_br_cpf,
            password=decrypt_password(credential.gov_br_password_enc),
            invoice_data=invoice_data,
        )
        invoice.nfse_status = Invoice.NFSE_ISSUED
        invoice.nfse_number = nfse_number
        invoice.nfse_error = ""
        invoice.save(update_fields=["nfse_status", "nfse_number", "nfse_error"])
        return {"ok": True, "nfse_number": nfse_number}

    except Exception as exc:
        logger.exception("Falha ao emitir NFS-e para fatura %s", invoice_id)
        invoice.nfse_status = Invoice.NFSE_FAILED
        invoice.nfse_error = str(exc)
        invoice.save(update_fields=["nfse_status", "nfse_error"])
        return {"ok": False, "error": str(exc)}

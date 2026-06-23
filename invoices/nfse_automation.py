"""
Automação do portal NFS-e Nacional (nfse.gov.br) via Playwright.
Reproduz o fluxo manual: login gov.br → preencher formulário → emitir nota.
"""
import logging
import re

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

logger = logging.getLogger(__name__)

PORTAL_URL = "https://www.nfse.gov.br/EmissorNacional/Login"
TIMEOUT = 30_000  # 30s por operação


def _limpa_cpf(cpf: str) -> str:
    return re.sub(r"\D", "", cpf)


def emit_nfse(*, cpf: str, password: str, invoice_data: dict) -> str:
    """
    Executa a emissão e retorna o número da NFS-e emitida.
    Lança exceção com mensagem descritiva em caso de falha.
    """
    cpf = _limpa_cpf(cpf)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(locale="pt-BR", timezone_id="America/Sao_Paulo")
        page = ctx.new_page()

        try:
            # ── 1. Abrir portal NFS-e e fazer login direto (usuário/senha) ───
            logger.info("Abrindo portal NFS-e...")
            page.goto(PORTAL_URL, timeout=TIMEOUT)
            page.wait_for_load_state("networkidle", timeout=TIMEOUT)

            # Preenche CPF/CNPJ — campo de texto na seção "Acesso com Usuário/Senha"
            cpf_input = page.locator("input[type='text'], input[type='tel'], input[id*='cpf' i], input[id*='cnpj' i], input[name*='cpf' i], input[name*='login' i], input[name*='usuario' i]").first
            cpf_input.fill(cpf, timeout=TIMEOUT)

            # Preenche senha
            page.fill("input[type='password']", password, timeout=TIMEOUT)

            # Clica em Entrar
            enter_btn = page.locator("button[type='submit'], input[type='submit'], button:has-text('Entrar'), input[value='Entrar']").first
            enter_btn.click(timeout=TIMEOUT)

            # Aguarda redirecionar para área autenticada
            page.wait_for_load_state("networkidle", timeout=TIMEOUT)

            # Verifica se login falhou (mensagem de erro na mesma página)
            if page.url.endswith("/Login") or "/Login" in page.url:
                error_msg = page.locator(".alert, .erro, .error, [class*='alert'], [class*='error']").first
                msg = error_msg.inner_text(timeout=3_000) if error_msg.count() else "Login inválido. Verifique seu CPF/CNPJ e senha do portal NFS-e."
                raise RuntimeError(msg)

            logger.info("Login realizado com sucesso.")

            # ── 3. Navegar para emissão ───────────────────────────────────────
            page.wait_for_load_state("networkidle", timeout=TIMEOUT)

            emit_link = page.locator("a:has-text('Emitir'), button:has-text('Emitir'), a:has-text('Nova NFS-e')").first
            emit_link.click(timeout=TIMEOUT)
            page.wait_for_load_state("networkidle", timeout=TIMEOUT)

            # ── 4. Preencher tomador ──────────────────────────────────────────
            logger.info("Preenchendo dados do tomador...")
            _fill_if_exists(page, "[name*='cnpj'], [name*='cpf'], [id*='tomador'][id*='doc']", invoice_data.get("client_document", ""))
            page.keyboard.press("Tab")
            page.wait_for_timeout(1500)  # Aguarda auto-preenchimento por CNPJ

            _fill_if_exists(page, "[name*='razao'], [name*='nome'], [id*='tomador'][id*='nome']", invoice_data.get("client_name", ""))
            _fill_if_exists(page, "[name*='email'][id*='tomador'], [id*='email']", invoice_data.get("client_email", ""))
            _fill_if_exists(page, "[name*='municipio'], [id*='municipio']", invoice_data.get("client_city", ""))
            _fill_if_exists(page, "[name*='endereco'], [id*='logradouro']", invoice_data.get("client_address", ""))

            # ── 5. Preencher serviço ──────────────────────────────────────────
            logger.info("Preenchendo dados do serviço...")
            competencia = invoice_data.get("competencia", "")  # MM/YYYY
            _fill_if_exists(page, "[name*='competencia'], [id*='competencia']", competencia)
            _fill_if_exists(page, "[name*='codigo'][name*='servico'], [id*='codigoServico'], [name*='itemLista']", invoice_data.get("service_code", ""))
            page.keyboard.press("Tab")
            page.wait_for_timeout(1000)

            _fill_if_exists(page, "[name*='discriminacao'], [id*='discriminacao'], textarea[name*='descricao']", invoice_data.get("service_description", ""))

            # ── 6. Preencher valores ──────────────────────────────────────────
            logger.info("Preenchendo valores...")
            _fill_if_exists(page, "[name*='valorServico'], [id*='valorServico'], [name*='valor'][name*='servico']", str(invoice_data.get("gross_value", "")))
            _fill_if_exists(page, "[name*='deducao'], [id*='deducao']", str(invoice_data.get("deductions", "0")))
            _fill_if_exists(page, "[name*='aliquota'][name*='iss'], [id*='aliquotaIss']", str(invoice_data.get("iss_rate", "0")))

            if invoice_data.get("iss_withheld"):
                _click_if_exists(page, "[name*='issRetido'], input[type='checkbox'][id*='iss']")

            # ── 7. Submeter ───────────────────────────────────────────────────
            logger.info("Submetendo nota...")
            submit = page.locator("button[type='submit']:has-text('Emitir'), button:has-text('Confirmar'), button:has-text('Salvar e Emitir')").first
            submit.click(timeout=TIMEOUT)
            page.wait_for_load_state("networkidle", timeout=TIMEOUT)

            # ── 8. Capturar número ────────────────────────────────────────────
            page.wait_for_timeout(2000)
            nfse_number = _extract_nfse_number(page)
            if not nfse_number:
                raise RuntimeError("Nota enviada mas número não encontrado na página.")

            logger.info(f"NFS-e emitida: {nfse_number}")
            return nfse_number

        except PWTimeout as e:
            raise RuntimeError(f"Timeout aguardando o portal responder: {e}") from e
        finally:
            browser.close()


def _fill_if_exists(page, selector: str, value: str) -> None:
    try:
        el = page.locator(selector).first
        if el.count() and value:
            el.fill(value, timeout=5_000)
    except Exception:
        pass


def _click_if_exists(page, selector: str) -> None:
    try:
        el = page.locator(selector).first
        if el.count():
            el.click(timeout=5_000)
    except Exception:
        pass


def _extract_nfse_number(page) -> str:
    patterns = [
        r"NFS-e\s*n[°º\.]\s*(\d+)",
        r"N[úu]mero\s*(\d+)",
        r"(\d{6,})",
    ]
    content = page.content()
    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            return match.group(1)
    return ""

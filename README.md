# Sistema de Financas Pessoais (Django + HTMX + Tailwind)

Aplicacao full stack de financas pessoais com foco mobile-first, autenticacao nativa Django, PostgreSQL e estrutura PWA.

## Stack
- Django Templates + Views + Models
- Tailwind CSS (via CDN)
- HTMX para interacoes sem recarregar a pagina
- PostgreSQL (opcional em desenvolvimento)
- Django Auth
- PWA: `manifest.json` + `service-worker.js`

## Apps
- `users`: cadastro, login e logout
- `accounts`: contas/carteiras
- `categories`: categorias de receitas e despesas
- `transactions`: transacoes, extrato com filtros e modal HTMX
- `dashboard`: resumo financeiro e ultimas transacoes

## Instalacao
1. Criar e ativar ambiente virtual:
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Instalar dependencias:
```powershell
python -m pip install -r requirements.txt
```

3. Rodar migracoes:
```powershell
python manage.py makemigrations
python manage.py migrate
```

4. Criar superusuario (opcional):
```powershell
python manage.py createsuperuser
```

5. Executar projeto:
```powershell
python manage.py runserver --noreload
```

## Banco de dados
- Desenvolvimento local (padrao): SQLite, sem configuracao extra.
- Para usar PostgreSQL, habilite explicitamente:
```powershell
$env:USE_POSTGRES="1"
$env:POSTGRES_DB="financas"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="postgres"
$env:POSTGRES_HOST="localhost"
$env:POSTGRES_PORT="5432"
python manage.py migrate
python manage.py runserver --noreload
```

## Observacoes
- Se quiser forcar SQLite mesmo com variaveis de Postgres no ambiente:
```powershell
$env:USE_SQLITE="1"
```
- O botao `+` abre modal HTMX para inclusao rapida de transacoes sem reload.
- O layout usa bottom navigation: Dashboard, Transacoes, Contas e Categorias.

## Testes automatizados
- Rodar a suite local:
```powershell
python manage.py test
```
- Validar configuracao Django antes dos testes:
```powershell
python manage.py check
```
- CI:
  O workflow [`.github/workflows/tests.yml`](.github/workflows/tests.yml) executa `check` e `test` automaticamente em `push` e `pull request`, usando SQLite.

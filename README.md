# Nexo Gestao Financeira

Aplicacao de gestao financeira com frontend React e backend Django REST.

## Arquitetura

- `frontend/`: React + TypeScript + Vite. Consome a API por `VITE_API_URL` ou `/api/v1` por padrao.
- `backend/`: Django + Django REST Framework. Serve API, admin, jobs Celery e arquivos de media/static.
- Autenticacao da API: JWT via `/api/v1/auth/token/` e `/api/v1/auth/token/refresh/`.

O backend fica sem SSR: a UI classica Django/HTMX foi removida. Em deploy de dyno unico, o Django entrega apenas o build estatico do React em `frontend/dist`.

## Desenvolvimento Local

Comando unico pela raiz:

```powershell
npm run dev
```

Esse comando sobe o Django primeiro em `http://127.0.0.1:8003`, espera a API responder e depois sobe o Vite em `http://localhost:5173`.

Backend manual:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py migrate
python manage.py runserver 8003 --noreload
```

Frontend:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Para desenvolvimento local, `frontend/.env` deve apontar para:

```env
VITE_API_URL=http://127.0.0.1:8003/api/v1
```

E o backend deve permitir a origem do Vite:

```env
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

## Docker (opcional)

Alternativa local/self-hosted que nao interfere no deploy Heroku (que usa buildpacks lendo o `Procfile` da raiz, nao os arquivos Docker abaixo).

```powershell
Copy-Item .env.example .env
# edite .env com uma DJANGO_SECRET_KEY propria
docker compose up --build
```

Sobe 4 servicos:

- `db`: PostgreSQL 16
- `redis`: Redis 7
- `backend`: build multi-stage (React + Django), roda `migrate` e depois Gunicorn em `http://localhost:8000` (porta ajustavel via `WEB_PORT`)
- `worker`: Celery, mesma imagem do backend

O `Dockerfile` (raiz) compila o frontend e serve o build via Django/WhiteNoise no mesmo container, no mesmo padrao do dyno unico do Heroku. Dados de Postgres, Redis e uploads (`media/`) persistem em volumes nomeados.

## Deploy em um dyno Heroku

Para rodar React + Django no mesmo dyno do app `nexo-django-drf`, use o repositório pela raiz e configure os buildpacks nesta ordem:

```powershell
heroku buildpacks:clear -a nexo-django-drf
heroku buildpacks:add heroku/nodejs -a nexo-django-drf
heroku buildpacks:add heroku/python -a nexo-django-drf
```

O build do Heroku executa:

- `npm --prefix frontend ci`
- `npm --prefix frontend run build`
- `python manage.py collectstatic`

Nos logs de deploy deve aparecer:

```text
[build] React build ready at /app/frontend/dist/index.html
```

O `Procfile` da raiz valida `frontend/dist/index.html` no release e depois sobe o Gunicorn apontando para `backend/nexo.wsgi`. Se aparecer `React build not found`, o buildpack Node.js nao rodou, rodou depois do Python, ou o deploy foi feito a partir da pasta `backend/` em vez da raiz do repositorio.

Como fallback operacional para Heroku, `frontend/dist` pode ficar versionado. Rode `npm run build` antes do deploy quando quiser garantir que o slug contenha o React mesmo se o buildpack Node nao executar o build.

Se o erro mostrar um caminho como `/frontend/dist/index.html`, remova a config var customizada para o Django usar o caminho correto do slug:

```powershell
heroku config:unset FRONTEND_DIST_DIR -a nexo-django-drf
```

Config minima:

```powershell
heroku config:set DJANGO_DEBUG=false -a nexo-django-drf
heroku config:set SERVE_REACT_APP=true -a nexo-django-drf
heroku config:set DJANGO_ALLOWED_HOSTS=nexo-django-drf.herokuapp.com,nexo.dscorp.top -a nexo-django-drf
heroku config:set DJANGO_CSRF_TRUSTED_ORIGINS=https://nexo-django-drf.herokuapp.com,https://nexo.dscorp.top -a nexo-django-drf
heroku config:set VITE_API_URL=/api/v1 -a nexo-django-drf
```

Como o frontend e a API ficam no mesmo dominio, CORS nao e necessario para o app em producao.

## Deploy separado

Frontend:

```env
VITE_API_URL=https://api.seu-dominio.com/api/v1
```

Backend:

```env
DJANGO_ALLOWED_HOSTS=api.seu-dominio.com
CORS_ALLOWED_ORIGINS=https://app.seu-dominio.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.seu-dominio.com
```

Como a API usa JWT no header `Authorization: Bearer`, `CORS_ALLOW_CREDENTIALS=false` e cookies de sessao nao sao necessarios para o frontend.

## Comandos Uteis

Backend:

```powershell
python manage.py check
python manage.py test
```

Frontend:

```powershell
npm run build
npm run test
```

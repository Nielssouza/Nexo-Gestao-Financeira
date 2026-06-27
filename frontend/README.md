# Nexo Frontend

React + TypeScript + Vite. Este app pode ser deployado separado ou compilado junto do Django no mesmo dyno Heroku.

## Configuracao

Crie `frontend/.env` a partir de `.env.example`:

```powershell
Copy-Item .env.example .env
```

Desenvolvimento local:

```env
VITE_API_URL=http://127.0.0.1:8003/api/v1
```

Producao em deploy separado:

```env
VITE_API_URL=https://api.seu-dominio.com/api/v1
```

Producao no mesmo dyno do Django:

```env
VITE_API_URL=/api/v1
```

## Desenvolvimento

```powershell
npm install
npm run dev
```

O dev server roda em `http://localhost:5173`.

## Build

```powershell
npm run build
```

O resultado fica em `frontend/dist`. No deploy de dyno unico, o Django serve esse diretório como arquivos estaticos e usa `index.html` como fallback das rotas React.

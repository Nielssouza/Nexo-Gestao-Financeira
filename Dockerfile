# syntax=docker/dockerfile:1

# ---- Frontend build ----
FROM node:24-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---- Backend runtime ----
FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Necessario apenas para o collectstatic durante o build; e sobrescrito em runtime.
RUN DJANGO_SECRET_KEY=docker-build-only python manage.py collectstatic --noinput

EXPOSE 8000

CMD ["gunicorn", "core.wsgi", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "2", "--worker-class", "gthread", "--log-file", "-"]

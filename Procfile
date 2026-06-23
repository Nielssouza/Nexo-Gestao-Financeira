release: python manage.py migrate --noinput
web: gunicorn nexo.wsgi --workers 3 --threads 2 --worker-class gthread --log-file -
worker: celery -A nexo worker --loglevel=info --concurrency=2

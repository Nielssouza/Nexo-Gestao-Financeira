release: python manage.py migrate --noinput
web: gunicorn --pythonpath backend nexo.wsgi --workers 3 --threads 2 --worker-class gthread --log-file -
worker: celery --workdir backend -A nexo worker --loglevel=info --concurrency=2

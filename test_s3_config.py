import os
import boto3
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

print('--- BUCKETEER CONFIG ---')
print('BUCKET_NAME:', os.getenv('BUCKETEER_BUCKET_NAME'))
print('REGION:', os.getenv('BUCKETEER_AWS_REGION'))

try:
    print('\n--- TESTING UPLOAD ---')
    path = default_storage.save('test_config.txt', ContentFile(b'config test'))
    print('SUCCESS! File uploaded to:', path)
    print('URL:', default_storage.url(path))
except Exception as e:
    print('ERROR:', str(e))
    import traceback
    traceback.print_exc()


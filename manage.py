#!/usr/bin/env python
"""Root entrypoint for Heroku monorepo commands."""

import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"

sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

env_file = BACKEND_DIR / ".env"
if env_file.exists():
    from dotenv import load_dotenv

    load_dotenv(env_file)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

from django.core.management import execute_from_command_line


if __name__ == "__main__":
    execute_from_command_line(sys.argv)

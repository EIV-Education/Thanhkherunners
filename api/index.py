"""Entry point cho Vercel Serverless Function (Python).

Vercel tự động nhận diện các file .py trong thư mục api/ có expose biến WSGI `app`.
File này chỉ re-export app Flask định nghĩa ở app.py (đặt tại thư mục gốc project)
để Flask vẫn resolve đúng thư mục templates/ và static/ ở gốc project.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app  # noqa: E402

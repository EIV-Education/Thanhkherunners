"""Entry point cho Vercel Serverless Function (Python).

File này re-export app Flask định nghĩa ở app.py (đặt tại thư mục gốc project) để Flask
vẫn resolve đúng thư mục templates/ và static/ ở gốc project.

Vercel's Python WSGI auto-detection (nhận diện biến `app`) đôi khi không forward đúng path
gốc của request tới hàm WSGI - dẫn tới mọi request (dù gõ "/" hay "/thu-vien") đều bị xử lý
như thể path luôn là "/api/index", làm toàn bộ trang báo "404 Not Found". Để tránh phụ thuộc
vào việc Vercel tự dựng WSGI environ, file này tự bắc cầu bằng interface Python gốc của Vercel
(class `handler` kế thừa BaseHTTPRequestHandler, dùng `self.path` - luôn đúng path thật của
request) rồi tự dựng WSGI environ chuẩn để gọi thẳng vào app Flask.
"""

import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app as flask_app  # noqa: E402

from http.server import BaseHTTPRequestHandler  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _run_wsgi(self):
        parsed = urlsplit(self.path)
        content_length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(content_length) if content_length else b""

        environ = {
            "REQUEST_METHOD": self.command,
            "SCRIPT_NAME": "",
            "PATH_INFO": parsed.path,
            "QUERY_STRING": parsed.query,
            "CONTENT_TYPE": self.headers.get("Content-Type", ""),
            "CONTENT_LENGTH": str(len(body)),
            "SERVER_NAME": self.headers.get("Host", "localhost").split(":")[0],
            "SERVER_PORT": "443",
            "SERVER_PROTOCOL": self.request_version,
            "wsgi.version": (1, 0),
            "wsgi.url_scheme": "https",
            "wsgi.input": BytesIO(body),
            "wsgi.errors": sys.stderr,
            "wsgi.multithread": False,
            "wsgi.multiprocess": True,
            "wsgi.run_once": False,
        }
        for key, value in self.headers.items():
            key_upper = key.upper().replace("-", "_")
            if key_upper in ("CONTENT_TYPE", "CONTENT_LENGTH"):
                continue
            environ[f"HTTP_{key_upper}"] = value

        response_status = {}
        response_headers = {}

        def start_response(status, headers, exc_info=None):
            response_status["value"] = status
            response_headers["value"] = headers

        result = flask_app(environ, start_response)
        response_body = b"".join(result)

        status_code = int(response_status["value"].split(" ", 1)[0])
        self.send_response(status_code)
        for header_name, header_value in response_headers["value"]:
            self.send_header(header_name, header_value)
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)

    def do_GET(self):
        self._run_wsgi()

    def do_POST(self):
        self._run_wsgi()

    def do_PUT(self):
        self._run_wsgi()

    def do_DELETE(self):
        self._run_wsgi()

    def do_HEAD(self):
        self._run_wsgi()

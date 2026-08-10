"""Entry point cho Vercel Serverless Function (Python).

File này re-export app Flask định nghĩa ở app.py (đặt tại thư mục gốc project) để Flask
vẫn resolve đúng thư mục templates/ và static/ ở gốc project.

Vercel rewrite "/(.*)" → "/api/index" chỉ đưa request tới ĐÚNG FILE này, nhưng bản thân
request mà hàm Python nhận được (dù đọc qua biến WSGI `app` hay qua self.path của
BaseHTTPRequestHandler) lại luôn là path đích "/api/index", KHÔNG PHẢI path gốc người dùng
gõ (vd "/", "/thu-vien") - route rewrite không tự "mang" path gốc theo, phải tự truyền tay.
Vì vậy destination trong vercel.json được viết thành "/api/index?vercelPath=$1", dùng cú
pháp capture group ($1) của Vercel để nhét path gốc vào query string - rồi file này tự đọc
lại query "vercelPath" đó để dựng đúng PATH_INFO thật trước khi gọi vào Flask.
"""

import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import app as flask_app  # noqa: E402

from http.server import BaseHTTPRequestHandler  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _run_wsgi(self):
        parsed = urlsplit(self.path)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)

        real_path = parsed.path
        remaining_query = []
        for key, value in query_pairs:
            if key == "vercelPath":
                real_path = "/" + value
            else:
                remaining_query.append((key, value))

        content_length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(content_length) if content_length else b""

        environ = {
            "REQUEST_METHOD": self.command,
            "SCRIPT_NAME": "",
            "PATH_INFO": real_path,
            "QUERY_STRING": urlencode(remaining_query),
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

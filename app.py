import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from google import genai
from google.genai import types
from pydantic import BaseModel

load_dotenv()

app = Flask(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
GOOGLE_SCRIPT_URL = os.environ.get("GOOGLE_SCRIPT_URL", "")
GOOGLE_SCRIPT_SECRET = os.environ.get("GOOGLE_SCRIPT_SECRET", "")
GOOGLE_SHEET_TAB = os.environ.get("GOOGLE_SHEET_TAB", "")

MAX_IMAGE_BYTES = 20 * 1024 * 1024  # 20MB/ảnh
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}

_gemini_client = None


def get_gemini_client() -> genai.Client:
    """Tạo Gemini client khi thực sự cần dùng (lazy), tránh crash lúc import module
    nếu thiếu GEMINI_API_KEY - quan trọng khi chạy trên serverless (Vercel)."""
    global _gemini_client
    if _gemini_client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "Thiếu biến môi trường GEMINI_API_KEY. Trên Vercel: vào Project Settings "
                "→ Environment Variables để thêm; khi chạy local: điền vào file .env."
            )
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


class CertificateData(BaseModel):
    full_name: str
    distance: str
    finish_time: str
    race_name: str


EXTRACTION_PROMPT = (
    "Đây là ảnh chụp finisher certificate (chứng nhận hoàn thành) của một giải chạy bộ. "
    "Hãy đọc kỹ ảnh và trích xuất chính xác 4 thông tin sau:\n"
    "1. full_name: Họ và tên đầy đủ của người chạy\n"
    "2. distance: Cự ly (ví dụ 5K, 10K, 21K, 42K, Half Marathon, Full Marathon...)\n"
    "3. finish_time: Thành tích / chip time (định dạng giờ:phút:giây, ví dụ 01:52:33)\n"
    "4. race_name: Tên giải chạy\n"
    "Nếu ảnh mờ hoặc không đọc được một trường nào đó, để giá trị là chuỗi rỗng \"\" cho "
    "trường đó. Không được bịa thông tin."
)


def extract_from_image(filename: str, image_bytes: bytes, media_type: str) -> dict:
    response = get_gemini_client().models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=media_type),
            EXTRACTION_PROMPT,
        ],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=CertificateData,
        ),
    )
    parsed = response.parsed
    data = parsed.model_dump() if parsed is not None else json.loads(response.text)
    data["filename"] = filename
    return data


def _friendly_gemini_error(exc: Exception) -> str:
    text = str(exc)
    if "NOT_FOUND" in text and "model" in text.lower():
        return (
            f"Model '{GEMINI_MODEL}' không còn được hỗ trợ hoặc không tồn tại. Đặt biến môi "
            "trường GEMINI_MODEL sang model đang hoạt động (ví dụ 'gemini-flash-latest' hoặc "
            "'gemini-pro-latest') - xem danh sách model hiện có tại "
            f"https://ai.google.dev/gemini-api/docs/models. Chi tiết lỗi gốc: {text}"
        )
    return text


CORE_TEAM = [
    {"name": "Phạm Đình Tuấn", "initials": "PT", "gradient": ("var(--orange)", "var(--teal-bright)")},
    {"name": "Nguyễn Văn Anh", "initials": "NA", "gradient": ("var(--teal-bright)", "var(--flag-gold)")},
    {"name": "Đàm Tường Quang", "initials": "ĐQ", "gradient": ("var(--flag-gold)", "var(--orange)")},
    {"name": "Huỳnh Trung Phúc", "initials": "HP", "gradient": ("var(--orange)", "var(--flag-gold)")},
    {"name": "Cao Văn Tâm", "initials": "CT", "gradient": ("var(--teal-bright)", "var(--orange)")},
    {"name": "Nguyễn Dương Hiếu", "initials": "NH", "gradient": ("var(--flag-gold)", "var(--teal-bright)")},
    {"name": "Đỗ Hoàng Nhật", "initials": "ĐN", "gradient": ("var(--orange)", "var(--teal-bright)")},
    {"name": "Lê Công Sanh", "initials": "LS", "gradient": ("var(--teal-bright)", "var(--flag-gold)")},
    {"name": "Hoàng Nguyễn Lê Sinh", "initials": "HS", "gradient": ("var(--flag-gold)", "var(--orange)")},
    {"name": "Phan Quốc Việt", "initials": "PV", "gradient": ("var(--orange)", "var(--flag-gold)")},
]


def normalize_distance(raw: str):
    """Gộp chuỗi cự ly thô (do người dùng nhập hoặc Gemini đọc được) về 1 nhóm cự ly
    chuẩn để xếp bảng vinh danh. Trả về (key, label, km) hoặc None nếu bỏ trống."""
    text = (raw or "").strip()
    if not text:
        return None
    low = text.lower()
    if "full" in low or "42" in low:
        return ("full_marathon", "Full Marathon", 42.195)
    if "half" in low or "21" in low:
        return ("half_marathon", "Half Marathon", 21.1)
    if "10" in low:
        return ("10k", "10K", 10.0)
    if "5" in low:
        return ("5k", "5K", 5.0)
    match = re.search(r"(\d+(?:[.,]\d+)?)", low)
    if match:
        km = float(match.group(1).replace(",", "."))
        return (f"other_{km}", text, km)
    return (f"other_{low}", text, 0.0)


def time_to_seconds(raw: str):
    """Chuyển chuỗi thời gian dạng HH:MM:SS hoặc MM:SS thành số giây để so sánh, xếp hạng."""
    text = (raw or "").strip()
    if not text:
        return None
    parts = text.split(":")
    try:
        parts = [int(p) for p in parts]
    except ValueError:
        return None
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h = 0
        m, s = parts
    else:
        return None
    return h * 3600 + m * 60 + s


def fetch_sheet_rows() -> list:
    """Đọc toàn bộ dữ liệu đã nộp từ Google Sheet (qua Apps Script doGet). Trả về [] nếu
    chưa cấu hình GOOGLE_SCRIPT_URL hoặc gọi lỗi - không làm crash trang chủ."""
    if not GOOGLE_SCRIPT_URL:
        return []
    params = {}
    if GOOGLE_SHEET_TAB:
        params["sheet_tab"] = GOOGLE_SHEET_TAB
    if GOOGLE_SCRIPT_SECRET:
        params["secret"] = GOOGLE_SCRIPT_SECRET
    try:
        resp = requests.get(GOOGLE_SCRIPT_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except (requests.exceptions.RequestException, ValueError):
        return []
    if not isinstance(data, dict) or data.get("error"):
        return []
    return data.get("rows", []) or []


def build_leaderboard(rows: list) -> list:
    """Gộp các dòng thành tích theo cự ly, xếp hạng nhanh → chậm trong từng cự ly,
    rồi sắp các bảng cự ly theo thứ tự xa → gần (full marathon trước, 5K sau)."""
    groups = {}
    for row in rows:
        normalized = normalize_distance(row.get("distance"))
        if not normalized:
            continue
        key, label, km = normalized
        group = groups.setdefault(key, {"key": key, "label": label, "km": km, "entries": []})
        group["entries"].append(
            {
                "full_name": row.get("full_name", ""),
                "finish_time": row.get("finish_time", ""),
                "race_name": row.get("race_name", ""),
                "_seconds": time_to_seconds(row.get("finish_time")),
            }
        )

    categories = []
    for group in groups.values():
        group["entries"].sort(key=lambda e: (e["_seconds"] is None, e["_seconds"]))
        for idx, entry in enumerate(group["entries"], start=1):
            entry["rank"] = idx
            del entry["_seconds"]
        group["count"] = len(group["entries"])
        categories.append(group)

    categories.sort(key=lambda g: g["km"], reverse=True)
    return categories


@app.route("/")
def home():
    rows = fetch_sheet_rows()
    leaderboard = build_leaderboard(rows)

    full_marathon = next((g for g in leaderboard if g["key"] == "full_marathon"), None)
    stats = {
        "runners": len({(r.get("full_name") or "").strip() for r in rows if r.get("full_name")}),
        "submissions": len(rows),
        "races": len({(r.get("race_name") or "").strip() for r in rows if r.get("race_name")}),
        "best_full_marathon": (
            full_marathon["entries"][0]["finish_time"] if full_marathon and full_marathon["entries"] else "—"
        ),
    }

    return render_template(
        "home.html",
        leaderboard=leaderboard,
        core_team=CORE_TEAM,
        stats=stats,
    )


@app.route("/trich-xuat")
def index():
    return render_template(
        "index.html",
        default_script_url=GOOGLE_SCRIPT_URL,
        default_sheet_tab=GOOGLE_SHEET_TAB,
    )


@app.route("/api/extract", methods=["POST"])
def api_extract():
    files = request.files.getlist("images")
    if not files:
        return jsonify({"error": "Không có ảnh nào được tải lên."}), 400

    jobs = []
    skipped = []
    for f in files:
        media_type = f.mimetype
        data = f.read()
        if media_type not in ALLOWED_MIME_TYPES:
            skipped.append({"filename": f.filename, "error": "Định dạng ảnh không hỗ trợ."})
            continue
        if len(data) > MAX_IMAGE_BYTES:
            skipped.append({"filename": f.filename, "error": "Ảnh vượt quá 20MB."})
            continue
        jobs.append((f.filename, data, media_type))

    if not jobs:
        return (
            jsonify(
                {
                    "error": "Không có ảnh hợp lệ (chỉ hỗ trợ PNG/JPEG/WEBP/GIF, tối đa 20MB/ảnh).",
                    "errors": skipped,
                }
            ),
            400,
        )

    results = []
    errors = list(skipped)
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_name = {
            executor.submit(extract_from_image, name, data, mt): name
            for name, data, mt in jobs
        }
        for future in as_completed(future_to_name):
            name = future_to_name[future]
            try:
                results.append(future.result())
            except Exception as exc:  # noqa: BLE001 - surface any extraction failure to the UI
                errors.append({"filename": name, "error": _friendly_gemini_error(exc)})

    return jsonify({"results": results, "errors": errors})


@app.route("/api/export", methods=["POST"])
def api_export():
    payload = request.get_json(force=True) or {}
    rows = payload.get("rows", [])
    script_url = (payload.get("script_url") or GOOGLE_SCRIPT_URL).strip()
    sheet_tab = (payload.get("sheet_tab") or GOOGLE_SHEET_TAB).strip()

    if not script_url:
        return jsonify({"error": "Thiếu link Google Apps Script Web App."}), 400
    if not rows:
        return jsonify({"error": "Không có dữ liệu để xuất."}), 400

    clean_rows = []
    for row in rows:
        item = {
            "full_name": row.get("full_name", ""),
            "distance": row.get("distance", ""),
            "finish_time": row.get("finish_time", ""),
            "race_name": row.get("race_name", ""),
        }
        # Ảnh certificate gốc (base64) - Apps Script sẽ lưu lên Drive và điền link vào Sheet.
        if row.get("image_base64"):
            item["image_base64"] = row["image_base64"]
            item["image_mime_type"] = row.get("image_mime_type", "image/jpeg")
            item["filename"] = row.get("filename", "certificate.jpg")
        clean_rows.append(item)

    body = {"rows": clean_rows}
    if sheet_tab:
        body["sheet_tab"] = sheet_tab
    if GOOGLE_SCRIPT_SECRET:
        body["secret"] = GOOGLE_SCRIPT_SECRET

    try:
        # Timeout dài hơn bình thường vì Apps Script cần thời gian upload ảnh lên Drive.
        resp = requests.post(script_url, json=body, timeout=120)
        resp.raise_for_status()
        result = resp.json()
    except requests.exceptions.RequestException as exc:
        return jsonify({"error": f"Không gọi được Google Apps Script: {exc}"}), 500
    except ValueError:
        return (
            jsonify(
                {
                    "error": (
                        "Google Apps Script trả về dữ liệu không hợp lệ (không phải JSON). "
                        "Kiểm tra lại đã Deploy đúng loại 'Web app' và link còn hoạt động chưa."
                    )
                }
            ),
            500,
        )

    if isinstance(result, dict) and result.get("error"):
        return jsonify({"error": result["error"]}), 500

    return jsonify({"status": "ok", "rows_written": len(clean_rows)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)

import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from google.oauth2 import service_account
from googleapiclient.discovery import build

load_dotenv()

app = Flask(__name__)

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")
GOOGLE_CREDENTIALS_FILE = os.environ.get(
    "GOOGLE_CREDENTIALS_FILE", "credentials/service_account.json"
)
GOOGLE_SHEET_ID = os.environ.get("GOOGLE_SHEET_ID", "")
GOOGLE_SHEET_TAB = os.environ.get("GOOGLE_SHEET_TAB", "Sheet1")

MAX_IMAGE_BYTES = 20 * 1024 * 1024  # 20MB/ảnh
ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}

HEADER_ROW = ["Họ tên", "Cự ly", "Thành tích", "Giải chạy"]

anthropic_client = anthropic.Anthropic()

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "full_name": {
            "type": "string",
            "description": "Họ và tên đầy đủ của người chạy in trên certificate. Chuỗi rỗng nếu không đọc được.",
        },
        "distance": {
            "type": "string",
            "description": "Cự ly thi đấu, ví dụ '5K', '10K', '21K', '42K', 'Half Marathon'. Chuỗi rỗng nếu không đọc được.",
        },
        "finish_time": {
            "type": "string",
            "description": "Thành tích / chip time / gun time, định dạng HH:MM:SS. Chuỗi rỗng nếu không đọc được.",
        },
        "race_name": {
            "type": "string",
            "description": "Tên giải chạy in trên certificate. Chuỗi rỗng nếu không đọc được.",
        },
    },
    "required": ["full_name", "distance", "finish_time", "race_name"],
    "additionalProperties": False,
}

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
    b64_data = base64.standard_b64encode(image_bytes).decode("utf-8")
    response = anthropic_client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1024,
        output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_data,
                        },
                    },
                    {"type": "text", "text": EXTRACTION_PROMPT},
                ],
            }
        ],
    )
    text_block = next(block for block in response.content if block.type == "text")
    data = json.loads(text_block.text)
    data["filename"] = filename
    return data


@app.route("/")
def index():
    return render_template(
        "index.html",
        default_sheet_id=GOOGLE_SHEET_ID,
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
                errors.append({"filename": name, "error": str(exc)})

    return jsonify({"results": results, "errors": errors})


def _sheet_has_header(service, sheet_id: str, sheet_tab: str) -> bool:
    result = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=sheet_id, range=f"{sheet_tab}!A1:D1")
        .execute()
    )
    return bool(result.get("values"))


@app.route("/api/export", methods=["POST"])
def api_export():
    payload = request.get_json(force=True) or {}
    rows = payload.get("rows", [])
    sheet_id = (payload.get("sheet_id") or GOOGLE_SHEET_ID).strip()
    sheet_tab = (payload.get("sheet_tab") or GOOGLE_SHEET_TAB).strip() or "Sheet1"

    if not sheet_id:
        return jsonify({"error": "Thiếu Google Sheet ID."}), 400
    if not rows:
        return jsonify({"error": "Không có dữ liệu để xuất."}), 400
    if not os.path.exists(GOOGLE_CREDENTIALS_FILE):
        return (
            jsonify(
                {
                    "error": (
                        f"Không tìm thấy file credentials tại '{GOOGLE_CREDENTIALS_FILE}'. "
                        "Xem README.md để thiết lập Google Service Account."
                    )
                }
            ),
            500,
        )

    try:
        creds = service_account.Credentials.from_service_account_file(
            GOOGLE_CREDENTIALS_FILE,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        service = build("sheets", "v4", credentials=creds)

        if not _sheet_has_header(service, sheet_id, sheet_tab):
            service.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range=f"{sheet_tab}!A1:D1",
                valueInputOption="USER_ENTERED",
                body={"values": [HEADER_ROW]},
            ).execute()

        values = [
            [
                row.get("full_name", ""),
                row.get("distance", ""),
                row.get("finish_time", ""),
                row.get("race_name", ""),
            ]
            for row in rows
        ]

        service.spreadsheets().values().append(
            spreadsheetId=sheet_id,
            range=f"{sheet_tab}!A:D",
            valueInputOption="USER_ENTERED",
            insertDataOption="INSERT_ROWS",
            body={"values": values},
        ).execute()
    except Exception as exc:  # noqa: BLE001 - surface Google API errors to the UI
        return jsonify({"error": f"Lỗi khi ghi vào Google Sheet: {exc}"}), 500

    return jsonify({"status": "ok", "rows_written": len(values)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)

# Finisher Certificate Extractor

Web app trích xuất thông tin từ ảnh **finisher certificate** (chứng nhận hoàn thành giải chạy):
họ tên, cự ly, thành tích (chip time), tên giải chạy — sau đó xuất ra Google Sheet.

- Đọc ảnh bằng Gemini Vision (Google AI API), không cần layout cố định.
- Kéo-thả nhiều ảnh cùng lúc, xem trước và sửa tay kết quả trước khi xuất.
- Xuất trực tiếp vào Google Sheet qua Google Sheets API.

## 1. Cài đặt

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

## 2. Lấy Gemini API key

1. Vào https://aistudio.google.com/apikey và tạo API key (miễn phí, dùng tài khoản Google).
2. Mở `.env`, điền vào `GEMINI_API_KEY=...`.

## 3. Thiết lập Google Sheets API (Service Account)

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo một Project mới (hoặc dùng project có sẵn).
2. Vào **APIs & Services → Library**, tìm **Google Sheets API** → bấm **Enable**.
3. Vào **APIs & Services → Credentials → Create Credentials → Service Account**.
   - Đặt tên bất kỳ, ví dụ `finisher-cert-bot`.
   - Bỏ qua phần gán role (không bắt buộc).
4. Sau khi tạo xong, mở Service Account vừa tạo → tab **Keys → Add Key → Create new key → JSON**.
   - File JSON sẽ tự động tải về máy.
5. Đổi tên file đó thành `service_account.json` và đặt vào thư mục `credentials/` trong project này
   (đường dẫn: `credentials/service_account.json`).
6. Mở file JSON, copy giá trị `client_email` (dạng `xxx@xxx.iam.gserviceaccount.com`).
7. Mở Google Sheet bạn muốn ghi dữ liệu vào → bấm **Share** → dán email ở bước 6 vào,
   chọn quyền **Editor** → **Send/Share**.
8. Lấy Sheet ID từ URL của Google Sheet:
   `https://docs.google.com/spreadsheets/d/`**`<SHEET_ID>`**`/edit`
9. Mở `.env`, điền `GOOGLE_SHEET_ID=<SHEET_ID>` (có thể để trống và nhập trực tiếp trên giao diện web).

> Lưu ý: file `credentials/service_account.json` và `.env` chứa thông tin nhạy cảm,
> đã được đưa vào `.gitignore` — không commit lên GitHub.

## 4. Chạy ứng dụng

```bash
python app.py
```

Mở trình duyệt tại http://localhost:5000

## 5. Sử dụng

1. Kéo-thả (hoặc chọn) nhiều ảnh finisher certificate vào ô upload.
2. Bấm **Trích xuất dữ liệu** — Gemini sẽ đọc từng ảnh và điền vào bảng kết quả
   (Họ tên / Cự ly / Thành tích / Giải chạy).
3. Kiểm tra, sửa lại trực tiếp trong bảng nếu Gemini đọc sai hoặc thiếu thông tin
   (ảnh mờ sẽ để trống thay vì bịa số liệu).
4. Nhập/kiểm tra **Google Sheet ID** và **tên tab**, bấm **Xuất ra Google Sheet**.
   Dữ liệu sẽ được nối thêm (append) vào cuối sheet; nếu sheet đang trống, dòng tiêu đề
   sẽ tự động được thêm vào.

## Cấu trúc project

```
app.py              # Flask backend: trích xuất ảnh (Gemini) + ghi Google Sheet
templates/index.html
static/style.css
static/script.js
static/images/       # Đặt file logo/ảnh bìa (cover.jpg) vào đây
credentials/         # Đặt service_account.json vào đây (gitignored)
.env                  # Biến môi trường (gitignored)
```

## Ghi chú

- Model mặc định là `gemini-2.5-flash`. Có thể đổi sang `gemini-2.5-pro` để chính xác hơn
  (nhưng chậm/đắt hơn) bằng biến `GEMINI_MODEL` trong `.env`.
- Giới hạn 20MB/ảnh, hỗ trợ định dạng PNG/JPEG/WEBP/GIF.
- Mỗi lần trích xuất chạy tối đa 5 ảnh song song để tăng tốc độ.
- Ảnh bìa (logo/banner) ở đầu trang: đặt file ảnh vào `static/images/cover.jpg`
  (đè lên file placeholder nếu có) — giao diện sẽ tự hiển thị.

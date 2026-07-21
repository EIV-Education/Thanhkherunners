# Finisher Certificate Extractor

Web app trích xuất thông tin từ ảnh **finisher certificate** (chứng nhận hoàn thành giải chạy):
họ tên, cự ly, thành tích (chip time), tên giải chạy — sau đó xuất ra Google Sheet.

- Đọc ảnh bằng Gemini Vision (Google AI API), không cần layout cố định.
- Kéo-thả nhiều ảnh cùng lúc, xem trước và sửa tay kết quả trước khi xuất.
- Xuất ra Google Sheet qua **Google Apps Script Web App** — chỉ cần dán 1 đoạn script vào
  chính Google Sheet, không cần Google Cloud Console, không cần service account hay JSON key.

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

## 3. Nối app với Google Sheet (Google Apps Script — cách đơn giản)

Không cần Google Cloud Console. Chỉ cần dán 1 đoạn script thẳng vào chính Google Sheet bạn muốn
ghi dữ liệu, rồi lấy 1 đường link duy nhất.

1. Mở Google Sheet bạn muốn ghi dữ liệu vào (hoặc tạo sheet mới).
2. Vào menu **Extensions (Tiện ích mở rộng) → Apps Script**.
3. Xoá hết code mẫu có sẵn trong ô soạn thảo, mở file
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs) trong project này, copy toàn bộ nội
   dung, dán vào.
4. *(Tuỳ chọn, nên làm nếu Sheet chứa dữ liệu quan trọng)* Sửa dòng `var SECRET = "";` thành một
   chuỗi bí mật tuỳ ý, ví dụ `var SECRET = "tkr-2026-bimat";` — để chặn người khác có link Web App
   ghi rác vào Sheet của bạn.
5. Bấm **Save** (biểu tượng đĩa mềm, hoặc Ctrl/Cmd+S).
6. Bấm nút **Deploy** (góc trên bên phải) → **New deployment**.
7. Ở mục **Select type**, bấm biểu tượng bánh răng ⚙️ → chọn **Web app**.
8. Điền:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
9. Bấm **Deploy**. Lần đầu Google sẽ hỏi cấp quyền:
   - Bấm **Authorize access** → chọn tài khoản Google của bạn.
   - Nếu hiện cảnh báo **"Google hasn't verified this app"**: bấm **Advanced** →
     **Go to <tên project> (unsafe)** → **Allow**. Đây là bình thường, vì đây là script do
     chính bạn viết và deploy, chỉ chạy trên Sheet của bạn.
10. Copy đường link **"Web app URL"** hiện ra (dạng
    `https://script.google.com/macros/s/xxxxxxxxxxxxx/exec`).
11. Dán link đó vào ô **"Link Google Apps Script Web App"** ngay trên giao diện web của app
    (hoặc điền vào `.env`: `GOOGLE_SCRIPT_URL=...`).
12. Nếu bước 4 có đặt `SECRET`, điền đúng chuỗi đó vào `.env`: `GOOGLE_SCRIPT_SECRET=...`.

> Nếu sau này bạn sửa lại nội dung `Code.gs`, phải vào **Deploy → Manage deployments** → bấm biểu
> tượng bút chì ✏️ → chọn **New version** → **Deploy** thì thay đổi mới có hiệu lực (link URL cũ
> vẫn giữ nguyên, không cần đổi lại trên app).

## 4. Chạy ứng dụng (local)

```bash
python app.py
```

Mở trình duyệt tại http://localhost:5000

## 5. Deploy lên Vercel

Project đã có sẵn `vercel.json` + `api/index.py` để chạy dưới dạng Serverless Function.

1. Đẩy repo này lên GitHub (đã có), vào https://vercel.com → **Add New → Project** → import repo.
2. Vercel tự nhận diện Python từ `requirements.txt`, không cần chỉnh Build/Output settings.
3. Vào **Project → Settings → Environment Variables**, thêm các biến sau (bắt buộc phải khai báo
   ở đây — file `.env` trên máy của bạn **không** được Vercel đọc):

   | Tên biến | Giá trị |
   |---|---|
   | `GEMINI_API_KEY` | API key lấy ở bước 2 |
   | `GEMINI_MODEL` | (tùy chọn) `gemini-2.5-flash` hoặc `gemini-2.5-pro` |
   | `GOOGLE_SCRIPT_URL` | Link Web App lấy ở bước 3.10 |
   | `GOOGLE_SCRIPT_SECRET` | (tùy chọn) trùng với `SECRET` đặt trong `Code.gs` nếu có |
   | `GOOGLE_SHEET_TAB` | (tùy chọn) tên tab mặc định, để trống = tab đang mở |

4. Bấm **Deploy** (hoặc **Redeploy** nếu project đã tồn tại — cần redeploy sau khi thêm biến môi
   trường để chúng có hiệu lực: **Deployments** → bấm **⋯** ở bản mới nhất → **Redeploy**).

> ⚠️ Vercel giới hạn dung lượng body request (mặc định khoảng 4.5MB/request trên gói Hobby/Pro).
> Nếu tải lên nhiều ảnh hoặc ảnh chụp gốc quá nặng cùng lúc có thể bị lỗi 413 — nên nén/resize ảnh
> hoặc tải lên từng đợt ít ảnh hơn khi dùng bản deploy trên Vercel.

## 6. Sử dụng

1. Kéo-thả (hoặc chọn) nhiều ảnh finisher certificate vào ô upload.
2. Bấm **Trích xuất dữ liệu** — Gemini sẽ đọc từng ảnh và điền vào bảng kết quả
   (Họ tên / Cự ly / Thành tích / Giải chạy).
3. Kiểm tra, sửa lại trực tiếp trong bảng nếu Gemini đọc sai hoặc thiếu thông tin
   (ảnh mờ sẽ để trống thay vì bịa số liệu).
4. Nhập/kiểm tra **link Google Apps Script Web App** và **tên tab** (nếu cần), bấm
   **Xuất ra Google Sheet**. Dữ liệu sẽ được nối thêm (append) vào cuối sheet; nếu sheet đang
   trống, dòng tiêu đề sẽ tự động được thêm vào.

## Cấu trúc project

```
app.py                    # Flask backend: trích xuất ảnh (Gemini) + gọi Apps Script để ghi Sheet
api/index.py               # Entry point cho Vercel Serverless Function (re-export app từ app.py)
vercel.json                 # Cấu hình routing cho Vercel
google-apps-script/Code.gs  # Script dán vào Google Sheet để nhận dữ liệu (xem mục 3)
templates/index.html
static/style.css
static/script.js
static/images/             # Đặt file logo/ảnh bìa (cover.jpg) vào đây
.env                        # Biến môi trường khi chạy local (gitignored)
```

## Ghi chú

- Model mặc định là `gemini-2.5-flash`. Có thể đổi sang `gemini-2.5-pro` để chính xác hơn
  (nhưng chậm/đắt hơn) bằng biến `GEMINI_MODEL` trong `.env`.
- Giới hạn 20MB/ảnh, hỗ trợ định dạng PNG/JPEG/WEBP/GIF.
- Mỗi lần trích xuất chạy tối đa 5 ảnh song song để tăng tốc độ.
- Ảnh bìa (logo/banner) ở đầu trang: đặt file ảnh vào `static/images/cover.jpg`
  (đè lên file placeholder nếu có) — giao diện sẽ tự hiển thị.
- Google Apps Script Web App gắn với đúng 1 Google Sheet mà bạn mở khi tạo script — muốn ghi vào
  sheet khác thì lặp lại mục 3 trên sheet đó để lấy link riêng.

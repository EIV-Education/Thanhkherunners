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
   | `GOOGLE_CREDENTIALS_JSON` | Dán **nguyên nội dung** file `service_account.json` (cả file, không phải đường dẫn) — Vercel không cho ghi file lên đĩa nên không dùng `GOOGLE_CREDENTIALS_FILE` được |
   | `GOOGLE_SHEET_ID` | (tùy chọn) ID Google Sheet mặc định |
   | `GOOGLE_SHEET_TAB` | (tùy chọn) mặc định `Sheet1` |

4. Bấm **Deploy** (hoặc **Redeploy** nếu project đã tồn tại — cần redeploy sau khi thêm biến môi trường
   để chúng có hiệu lực).

### Hướng dẫn chi tiết cho `GOOGLE_CREDENTIALS_JSON`

Đây là biến hay bị làm sai nhất vì phải copy nguyên một file JSON vào 1 ô trên web, nên làm theo
từng bước sau:

1. **Lấy file `service_account.json`** — nếu chưa có, làm mục 3 ở trên trước để tải file này về máy.
   File có dạng:
   ```json
   {
     "type": "service_account",
     "project_id": "ten-project-cua-ban",
     "private_key_id": "abc123...",
     "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n",
     "client_email": "finisher-cert-bot@ten-project.iam.gserviceaccount.com",
     "client_id": "1234567890",
     ...
   }
   ```
2. **Mở file đó bằng trình soạn thảo văn bản thuần** (Notepad, VS Code, TextEdit — **không** dùng
   Word/Google Docs vì có thể tự đổi dấu ngoặc kép cong `“ ”` làm hỏng JSON).
3. **Chọn toàn bộ nội dung** (Ctrl+A hoặc Cmd+A) rồi **copy** (Ctrl+C / Cmd+C).
   - Copy **y nguyên**, từ dấu `{` đầu tiên đến dấu `}` cuối cùng.
   - **Không** xóa hay sửa các ký tự `\n` bên trong `private_key` — đó là một phần bắt buộc của khóa.
   - **Không** cần nén thành 1 dòng, không cần thêm dấu nháy bao ngoài — dán y hệt nội dung file.
4. Vào **Vercel Dashboard → chọn đúng project → Settings → Environment Variables**.
5. Ô **Key**: gõ chính xác `GOOGLE_CREDENTIALS_JSON` (viết hoa, đúng dấu gạch dưới).
6. Ô **Value**: dán (Ctrl+V / Cmd+V) toàn bộ nội dung vừa copy vào — ô này chấp nhận nhiều dòng,
   kể cả xuống dòng, dán thoải mái.
7. Ở phần **Environment**: tick chọn **Production** (và **Preview**, **Development** nếu bạn cũng
   test ở các môi trường đó).
8. Bấm **Save**.
9. **Bắt buộc phải Redeploy lại** sau khi lưu biến môi trường (thêm biến không tự áp dụng cho bản
   deploy đang chạy): vào tab **Deployments** → bấm nút **⋯** ở bản deploy mới nhất → **Redeploy**.

**Cách kiểm tra file JSON hợp lệ trước khi dán** (nếu không chắc file có bị lỗi định dạng không),
chạy lệnh sau trên máy (đã cài Python):
```bash
python3 -c "import json; json.load(open('service_account.json')); print('File JSON hợp lệ')"
```
Nếu lệnh báo lỗi (`json.decoder.JSONDecodeError`), tức là file gốc đã bị hỏng — tải lại file JSON mới
từ Google Cloud Console (mục 3, bước 4) rồi làm lại từ đầu, đừng sửa tay file cũ.

**Lỗi thường gặp:**
- Dán thiếu dấu `{` hoặc `}` ở đầu/cuối do bôi đen sót → xuất ra Google Sheet báo lỗi parse JSON.
- Dán nội dung đã qua Word/Google Docs làm đổi `"` thành `“`/`”` → cũng lỗi parse JSON.
- Quên bấm Redeploy sau khi lưu biến → app vẫn dùng bản cũ, lỗi y như trước.
- Quên **Share Google Sheet** cho email trong `client_email` (mục 3, bước 6-7) → báo lỗi quyền
  truy cập (403 permission denied) dù JSON đã đúng.

> ⚠️ Vercel giới hạn dung lượng body request (mặc định khoảng 4.5MB/request trên gói Hobby/Pro).
> Nếu tải lên nhiều ảnh hoặc ảnh chụp gốc quá nặng cùng lúc có thể bị lỗi 413 — nên nén/resize ảnh
> hoặc tải lên từng đợt ít ảnh hơn khi dùng bản deploy trên Vercel.

## 6. Sử dụng

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
api/index.py          # Entry point cho Vercel Serverless Function (re-export app từ app.py)
vercel.json           # Cấu hình routing cho Vercel
templates/index.html
static/style.css
static/script.js
static/images/       # Đặt file logo/ảnh bìa (cover.jpg) vào đây
credentials/         # Đặt service_account.json vào đây khi chạy local (gitignored)
.env                  # Biến môi trường khi chạy local (gitignored)
```

## Ghi chú

- Model mặc định là `gemini-2.5-flash`. Có thể đổi sang `gemini-2.5-pro` để chính xác hơn
  (nhưng chậm/đắt hơn) bằng biến `GEMINI_MODEL` trong `.env`.
- Giới hạn 20MB/ảnh, hỗ trợ định dạng PNG/JPEG/WEBP/GIF.
- Mỗi lần trích xuất chạy tối đa 5 ảnh song song để tăng tốc độ.
- Ảnh bìa (logo/banner) ở đầu trang: đặt file ảnh vào `static/images/cover.jpg`
  (đè lên file placeholder nếu có) — giao diện sẽ tự hiển thị.

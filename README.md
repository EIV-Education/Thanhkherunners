# Thanh Khê Runners — website CLB + Finisher Certificate Extractor

Website của CLB Thanh Khê Runners: trang chủ giới thiệu CLB, đội ngũ Core Team, và **bảng vinh
danh** tự động xếp hạng runner theo cự ly (Full Marathon / Half Marathon / 10K / 5K...) từ nhanh
đến chậm — cộng với công cụ trích xuất thông tin từ ảnh **finisher certificate** (chứng nhận
hoàn thành giải chạy): họ tên, cự ly, thành tích (chip time), tên giải chạy — sau đó xuất ra
Google Sheet.

- Trang chủ (`/`) tự đọc dữ liệu từ Google Sheet và dựng bảng vinh danh theo từng cự ly —
  không cần thao tác gì thêm, chỉ cần có người nộp thành tích qua công cụ trích xuất.
- Công cụ trích xuất chuyển sang route `/trich-xuat` (có link "← Trang chủ" quay lại trang chủ).
- Đọc ảnh bằng Gemini Vision (Google AI API), không cần layout cố định.
- Kéo-thả nhiều ảnh cùng lúc, xem trước và sửa tay kết quả trước khi xuất.
- Xuất ra Google Sheet qua **Google Apps Script Web App** — chỉ cần dán 1 đoạn script vào
  chính Google Sheet, không cần Google Cloud Console, không cần service account hay JSON key.
  Script này cũng là nơi trang chủ đọc dữ liệu về để dựng bảng vinh danh.
- Tự động điền thời gian xuất (cột "Dấu thời gian") và tự động upload ảnh certificate gốc lên
  một folder Google Drive của bạn, điền link vào cột "Ảnh Runners".

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
4. Kiểm tra biến `HEADER_ROW` ở đầu file khớp với thứ tự cột trong Sheet của bạn (mặc định:
   Dấu thời gian / Họ Tên Runners / Cự ly / Thời gian hoàn thành / Giải Chạy / Ảnh Runners) —
   sửa lại nếu Sheet của bạn có cột khác thứ tự này. **Chỉ áp dụng khi Sheet đang trống** (nếu
   Sheet đã có dữ liệu/tiêu đề sẵn, script sẽ không tự thêm tiêu đề mới, chỉ nối dữ liệu vào các
   cột theo đúng thứ tự trong `HEADER_ROW` — nên thứ tự này phải khớp với cột thật trên Sheet).
5. *(Tuỳ chọn, nên làm nếu Sheet chứa dữ liệu quan trọng)* Sửa dòng `var SECRET = "";` thành một
   chuỗi bí mật tuỳ ý, ví dụ `var SECRET = "tkr-2026-bimat";` — để chặn người khác có link Web App
   ghi rác vào Sheet của bạn.
6. Bấm **Save** (biểu tượng đĩa mềm, hoặc Ctrl/Cmd+S).
7. Bấm nút **Deploy** (góc trên bên phải) → **New deployment**.
8. Ở mục **Select type**, bấm biểu tượng bánh răng ⚙️ → chọn **Web app**.
9. Điền:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (không phải "Only myself" hay "Anyone with Google account" —
     chọn sai mục này sẽ gây lỗi `401 Unauthorized` khi app gọi vào)
10. Bấm **Deploy**. Lần đầu Google sẽ hỏi cấp quyền (script cần quyền Sheets + Drive để lưu ảnh):
    - Bấm **Authorize access** → chọn tài khoản Google của bạn.
    - Nếu hiện cảnh báo **"Google hasn't verified this app"**: bấm **Advanced** →
      **Go to <tên project> (unsafe)** → **Allow**. Đây là bình thường, vì đây là script do
      chính bạn viết và deploy, chỉ chạy trên Sheet/Drive của bạn.
11. Copy đường link **"Web app URL"** hiện ra (dạng
    `https://script.google.com/macros/s/xxxxxxxxxxxxx/exec`).
12. Dán link đó vào ô **"Link Google Apps Script Web App"** ngay trên giao diện web của app
    (hoặc điền vào `.env`: `GOOGLE_SCRIPT_URL=...`).
13. Nếu bước 5 có đặt `SECRET`, điền đúng chuỗi đó vào `.env`: `GOOGLE_SCRIPT_SECRET=...`.

> Nếu sau này bạn sửa lại nội dung `Code.gs`, phải vào **Deploy → Manage deployments** → bấm biểu
> tượng bút chì ✏️ → chọn **New version** → **Deploy** thì thay đổi mới có hiệu lực (link URL cũ
> vẫn giữ nguyên, không cần đổi lại trên app). Nếu code vừa thêm quyền mới (ví dụ mới thêm phần
> lưu ảnh lên Drive), lần deploy tiếp theo có thể hỏi cấp quyền lại — cứ Authorize/Allow như bước 10.

> ⚠️ **Nếu bạn đã deploy `Code.gs` từ trước** (trước khi có bảng vinh danh): bản `Code.gs` hiện
> tại có thêm hàm `doGet` để trang chủ đọc dữ liệu về dựng bảng vinh danh. Bắt buộc phải dán lại
> toàn bộ nội dung file mới vào Apps Script editor của bạn rồi **Deploy → Manage deployments →
> ✏️ → New version → Deploy** thì trang chủ mới đọc được dữ liệu (link Web App không đổi). Nếu bỏ
> qua bước này, trang chủ vẫn chạy bình thường nhưng bảng vinh danh sẽ luôn trống.

### Ảnh certificate lưu ở đâu trên Drive?

Script tự tạo (hoặc dùng lại nếu đã có) 1 folder tên **"Finisher Certificates"** trong Google
Drive của tài khoản bạn dùng để deploy script, lưu từng ảnh certificate vào đó, đặt quyền xem
"Anyone with the link", rồi điền link dạng `https://drive.google.com/open?id=...` vào cột
"Ảnh Runners". Muốn đổi tên folder, sửa biến `DRIVE_FOLDER_NAME` trong `Code.gs` (nhớ Deploy
lại — New version — sau khi sửa).

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
   | `GEMINI_MODEL` | (tùy chọn) mặc định `gemini-flash-latest`, đổi sang `gemini-pro-latest` để chính xác hơn |
   | `GOOGLE_SCRIPT_URL` | Link Web App lấy ở bước 3.10 |
   | `GOOGLE_SCRIPT_SECRET` | (tùy chọn) trùng với `SECRET` đặt trong `Code.gs` nếu có |
   | `GOOGLE_SHEET_TAB` | (tùy chọn) tên tab mặc định, để trống = tab đang mở |

4. Bấm **Deploy** (hoặc **Redeploy** nếu project đã tồn tại — cần redeploy sau khi thêm biến môi
   trường để chúng có hiệu lực: **Deployments** → bấm **⋯** ở bản mới nhất → **Redeploy**).

> ⚠️ Vercel giới hạn dung lượng body request (mặc định khoảng 4.5MB/request trên gói Hobby/Pro).
> App có gửi kèm ảnh gốc (dạng base64, nặng hơn ảnh gốc ~33%) cả lúc trích xuất lẫn lúc xuất ra
> Google Sheet (để lưu lên Drive), nên nếu tải lên nhiều ảnh hoặc ảnh chụp gốc quá nặng cùng lúc
> có thể bị lỗi 413 — nên nén/resize ảnh hoặc xuất theo từng đợt ít ảnh hơn khi dùng bản deploy
> trên Vercel.
> `vercel.json` đã đặt `maxDuration: 60` giây cho function (do bước upload ảnh lên Drive cần thêm
> thời gian) — gói Hobby có thể giới hạn thấp hơn mức này tuỳ chính sách hiện tại của Vercel.

## 6. Sử dụng

1. Trang chủ (`/`) hiển thị giới thiệu CLB, Core Team và bảng vinh danh — tự động đọc lại từ
   Google Sheet mỗi lần tải trang, không cần thao tác gì thêm.
2. Bấm **Nộp thành tích** (hoặc vào `/trich-xuat`) để mở công cụ trích xuất.
3. Kéo-thả (hoặc chọn) nhiều ảnh finisher certificate vào ô upload.
4. Bấm **Trích xuất dữ liệu** — Gemini sẽ đọc từng ảnh và điền vào bảng kết quả
   (Họ tên / Cự ly / Thành tích / Giải chạy).
5. Kiểm tra, sửa lại trực tiếp trong bảng nếu Gemini đọc sai hoặc thiếu thông tin
   (ảnh mờ sẽ để trống thay vì bịa số liệu).
6. Bấm **Xác Nhận Lưu**. Dữ liệu sẽ được nối thêm (append) vào cuối sheet theo đúng thứ tự
   cột đã cấu hình trong `HEADER_ROW` (mặc định: Dấu thời gian, Họ Tên Runners, Cự ly, Thời gian
   hoàn thành, Giải Chạy, Ảnh Runners); nếu sheet đang trống, dòng tiêu đề sẽ tự động được thêm
   vào. Ảnh certificate gốc cũng được tải lên cùng lúc để lưu vào Drive và điền link vào cột
   Ảnh Runners — bước này có thể mất vài giây tuỳ số lượng/kích thước ảnh.
7. Quay lại trang chủ (hoặc tải lại trang) để thấy thành tích vừa nộp xuất hiện ngay trong bảng
   vinh danh đúng cự ly.

## Cách bảng vinh danh xếp hạng

- Trang chủ gọi `doGet` trong `Code.gs` để lấy toàn bộ dữ liệu hiện có trên Sheet.
- Cột **Cự ly** được gom nhóm theo từ khoá: chứa "full"/"42" → Full Marathon, "half"/"21" →
  Half Marathon, "10" → 10K, "5" → 5K; cự ly khác giữ nguyên tên gốc thành 1 bảng riêng.
- Nếu cùng 1 người (trùng họ tên, không phân biệt hoa/thường) nộp nhiều dòng trong cùng 1 bảng
  cự ly (vd nộp nhầm nhiều lần, hoặc chạy nhiều giải cùng cự ly đó), chỉ dòng có **thành tích
  nhanh nhất** được giữ lại trong bảng vinh danh — các dòng chậm hơn bị ẩn khỏi bảng (vẫn còn
  nguyên trên Sheet, không bị xoá).
- Trong mỗi bảng, runner được xếp theo **Thời gian hoàn thành** từ nhanh đến chậm (dòng không đọc
  được thời gian hợp lệ sẽ xếp cuối bảng thay vì bị loại bỏ).
- Các bảng cự ly được sắp theo cự ly xa → gần (Full Marathon trước, 5K sau).
- Chỉ số trên trang chủ (số runner, số thành tích, số giải, PR Full Marathon của CLB) đều tính
  trực tiếp từ dữ liệu thật trên Sheet — sheet trống thì các chỉ số này hiển thị 0.

## Cấu trúc project

```
app.py                    # Flask backend: trích xuất ảnh (Gemini), đọc/xếp bảng vinh danh, gọi Apps Script để ghi Sheet
api/index.py               # Entry point cho Vercel Serverless Function (re-export app từ app.py)
vercel.json                 # Cấu hình routing cho Vercel
google-apps-script/Code.gs  # Script dán vào Google Sheet: ghi dữ liệu (doPost) + đọc dữ liệu (doGet) (xem mục 3)
templates/home.html         # Trang chủ CLB: hero, Core Team, bảng vinh danh, giới thiệu
templates/index.html        # Công cụ trích xuất (route /trich-xuat)
static/home.css / home.js   # Style + hiệu ứng dải cờ (bunting) cho trang chủ
static/style.css
static/script.js
static/images/             # Đặt file logo/ảnh bìa (cover.jpg) và logo nav (nav-mark.png) vào đây
.env                        # Biến môi trường khi chạy local (gitignored)
```

## Ghi chú

- Model mặc định là `gemini-flash-latest` (alias luôn trỏ tới bản flash mới nhất của Google,
  tránh lỗi 404 khi Google ngừng hỗ trợ 1 phiên bản cụ thể). Có thể đổi sang `gemini-pro-latest`
  để chính xác hơn (nhưng chậm/đắt hơn) bằng biến `GEMINI_MODEL` trong `.env`.
- Nếu gặp lỗi dạng `404 NOT_FOUND ... is no longer available`: model đang dùng đã bị Google
  ngừng hỗ trợ, đổi giá trị `GEMINI_MODEL` sang model còn hoạt động — xem danh sách tại
  https://ai.google.dev/gemini-api/docs/models.
- Giới hạn 20MB/ảnh, hỗ trợ định dạng PNG/JPEG/WEBP/GIF.
- Mỗi lần trích xuất chạy tối đa 5 ảnh song song để tăng tốc độ.
- Ảnh bìa (logo/banner) ở đầu trang: đặt file ảnh vào `static/images/cover.jpg`
  (đè lên file placeholder nếu có) — giao diện sẽ tự hiển thị.
- Google Apps Script Web App gắn với đúng 1 Google Sheet mà bạn mở khi tạo script — muốn ghi vào
  sheet khác thì lặp lại mục 3 trên sheet đó để lấy link riêng.

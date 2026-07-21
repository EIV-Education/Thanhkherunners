/**
 * Finisher Certificate Extractor — Google Apps Script Web App
 *
 * Cách dùng:
 * 1. Mở Google Sheet muốn ghi dữ liệu vào.
 * 2. Vào menu Extensions (Tiện ích mở rộng) → Apps Script.
 * 3. Xoá hết code mẫu có sẵn (myFunction...), dán toàn bộ nội dung file này vào.
 * 4. (Tuỳ chọn nhưng nên làm) Đổi biến SECRET bên dưới thành một chuỗi bí mật tuỳ ý,
 *    để tránh người khác có link Web App gọi vào ghi rác dữ liệu.
 * 5. Bấm biểu tượng Save (đĩa mềm) hoặc Ctrl/Cmd+S.
 * 6. Bấm nút "Deploy" (góc trên bên phải) → "New deployment".
 * 7. Ở ô "Select type", bấm biểu tượng bánh răng → chọn "Web app".
 * 8. Cấu hình:
 *      - Description: đặt tên tuỳ ý (vd "finisher-cert-export")
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 9. Bấm "Deploy". Lần đầu Google sẽ yêu cầu cấp quyền — bấm "Authorize access",
 *    chọn tài khoản Google của bạn → nếu hiện cảnh báo "Google hasn't verified this app",
 *    bấm "Advanced" → "Go to <tên project> (unsafe)" → "Allow". Đây là bình thường vì
 *    đây là script do chính bạn viết/deploy, chỉ chạy trên sheet của bạn.
 * 10. Copy đường link "Web app URL" hiện ra (dạng
 *     https://script.google.com/macros/s/xxxxx/exec) — dán vào ứng dụng
 *     Finisher Certificate Extractor (ô "Link Google Apps Script Web App").
 *
 * Nếu sau này bạn sửa lại code này, phải vào Deploy → Manage deployments → bấm biểu tượng
 * bút chì → chọn "New version" → Deploy thì thay đổi mới có hiệu lực (link URL không đổi).
 */

// Để trống nếu không cần bảo mật thêm, hoặc đặt 1 chuỗi bí mật tuỳ ý (vd "tkr-2026-bimat").
// Nếu đặt SECRET ở đây, nhớ điền đúng chuỗi đó vào biến GOOGLE_SCRIPT_SECRET của app.
var SECRET = "";

var HEADER_ROW = ["Họ tên", "Cự ly", "Thành tích", "Giải chạy"];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (SECRET && payload.secret !== SECRET) {
      return jsonOutput({ error: "Sai secret, kiểm tra lại GOOGLE_SCRIPT_SECRET." });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    if (payload.sheet_tab) {
      sheet = ss.getSheetByName(payload.sheet_tab) || ss.insertSheet(payload.sheet_tab);
    }

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADER_ROW);
    }

    var rows = payload.rows || [];
    rows.forEach(function (r) {
      sheet.appendRow([r.full_name || "", r.distance || "", r.finish_time || "", r.race_name || ""]);
    });

    return jsonOutput({ status: "ok", rows_written: rows.length });
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

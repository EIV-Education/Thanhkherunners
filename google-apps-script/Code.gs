/**
 * Finisher Certificate Extractor — Google Apps Script Web App
 *
 * File này xử lý cả 2 chiều:
 * - doPost: nhận dữ liệu từ app, ghi vào Sheet + lưu ảnh certificate lên Drive.
 * - doGet: trả toàn bộ dữ liệu trong Sheet dạng JSON, để app tự tính bảng vinh danh
 *   (xếp hạng theo cự ly) trên trang chủ.
 *
 * Cách dùng:
 * 1. Mở Google Sheet muốn ghi dữ liệu vào.
 * 2. Vào menu Extensions (Tiện ích mở rộng) → Apps Script.
 * 3. Xoá hết code mẫu có sẵn (myFunction...), dán toàn bộ nội dung file này vào.
 * 4. (Tuỳ chọn nhưng nên làm) Đổi biến SECRET bên dưới thành một chuỗi bí mật tuỳ ý,
 *    để tránh người khác có link Web App gọi vào ghi rác dữ liệu.
 * 5. (Tuỳ chọn) Đổi DRIVE_FOLDER_NAME nếu muốn ảnh certificate lưu vào 1 folder Drive tên khác.
 * 6. Bấm biểu tượng Save (đĩa mềm) hoặc Ctrl/Cmd+S.
 * 7. Bấm nút "Deploy" (góc trên bên phải) → "New deployment".
 * 8. Ở ô "Select type", bấm biểu tượng bánh răng → chọn "Web app".
 * 9. Cấu hình:
 *      - Description: đặt tên tuỳ ý (vd "finisher-cert-export")
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 10. Bấm "Deploy". Lần đầu Google sẽ yêu cầu cấp quyền (script cần quyền Sheets + Drive để
 *     lưu ảnh) — bấm "Authorize access", chọn tài khoản Google của bạn → nếu hiện cảnh báo
 *     "Google hasn't verified this app", bấm "Advanced" → "Go to <tên project> (unsafe)" →
 *     "Allow". Đây là bình thường vì đây là script do chính bạn viết/deploy, chỉ chạy trên
 *     Sheet/Drive của bạn.
 * 11. Copy đường link "Web app URL" hiện ra (dạng
 *     https://script.google.com/macros/s/xxxxx/exec) — dán vào ứng dụng
 *     Finisher Certificate Extractor (ô "Link Google Apps Script Web App").
 *
 * Nếu sau này bạn sửa lại code này, phải vào Deploy → Manage deployments → bấm biểu tượng
 * bút chì → chọn "New version" → Deploy thì thay đổi mới có hiệu lực (link URL không đổi).
 * Nếu script vừa được thêm quyền mới (vd mới thêm phần lưu Drive), lần deploy tiếp theo có thể
 * yêu cầu cấp quyền lại — cứ Authorize/Allow như bước 10.
 */

// Để trống nếu không cần bảo mật thêm, hoặc đặt 1 chuỗi bí mật tuỳ ý (vd "tkr-2026-bimat").
// Nếu đặt SECRET ở đây, nhớ điền đúng chuỗi đó vào biến GOOGLE_SCRIPT_SECRET của app.
var SECRET = "";

// Cột trong Sheet theo đúng thứ tự sẽ ghi vào (đổi lại nếu Sheet của bạn có cột khác).
var HEADER_ROW = ["Dấu thời gian", "Họ Tên Runners", "Cự ly", "Thời gian hoàn thành", "Giải Chạy", "Ảnh Runners"];

// Tên folder trên Google Drive của bạn để lưu ảnh certificate. Nếu chưa có, script tự tạo mới.
var DRIVE_FOLDER_NAME = "Finisher Certificates";

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
      var imageLink = "";
      if (r.image_base64) {
        try {
          imageLink = saveImageToDrive(r.image_base64, r.image_mime_type || "image/jpeg", r.filename || "certificate.jpg");
        } catch (imgErr) {
          imageLink = "Lỗi lưu ảnh: " + String(imgErr);
        }
      }
      sheet.appendRow([
        new Date(),
        r.full_name || "",
        r.distance || "",
        r.finish_time || "",
        r.race_name || "",
        imageLink,
      ]);
    });

    return jsonOutput({ status: "ok", rows_written: rows.length });
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    if (SECRET && params.secret !== SECRET) {
      return jsonOutput({ error: "Sai secret, kiểm tra lại GOOGLE_SCRIPT_SECRET." });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = params.sheet_tab
      ? (ss.getSheetByName(params.sheet_tab) || ss.getActiveSheet())
      : ss.getActiveSheet();

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonOutput({ rows: [] });
    }

    var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    var rows = values
      .map(function (r) {
        return {
          timestamp: r[0] ? String(r[0]) : "",
          full_name: r[1] || "",
          distance: r[2] || "",
          finish_time: formatFinishTime(r[3]),
          race_name: r[4] || "",
          image_url: r[5] || "",
        };
      })
      .filter(function (r) {
        return r.full_name;
      });

    return jsonOutput({ rows: rows });
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

// Cột "Thời gian hoàn thành" (chip time) đôi khi bị Google Sheets tự nhận diện là 1 giá trị
// Time và lưu thành object Date (ngày epoch giả 1899-12-30) thay vì giữ nguyên chuỗi "HH:MM:SS".
// Ngày epoch giả này rơi vào trước năm 1906 nên timezone Việt Nam (Asia/Ho_Chi_Minh) áp dụng quy
// tắc lịch sử "Local Mean Time" (lệch +07:06:xx thay vì +07:00 chẵn) - nếu format theo timezone
// đó sẽ ra giờ SAI lệch vài phút so với chip time gốc. Giá trị Date mà Apps Script tạo ra từ ô
// Time luôn được tính theo UTC (không phụ thuộc timezone của Sheet/script), nên phải đọc theo
// UTC (Etc/GMT, không áp quy tắc lịch sử/DST nào) mới ra đúng đúng "HH:mm:ss" đã nhập ban đầu.
function formatFinishTime(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, "Etc/GMT", "HH:mm:ss");
  }
  return value || "";
}

function saveImageToDrive(base64Data, mimeType, filename) {
  var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType, filename);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/open?id=" + file.getId();
}

function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(name);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

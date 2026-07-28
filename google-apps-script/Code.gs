/**
 * Finisher Certificate Extractor — Google Apps Script Web App
 *
 * File này xử lý cả 2 chiều:
 * - doPost: nhận dữ liệu từ app, ghi vào Sheet + lưu ảnh certificate lên Drive; hoặc (nếu
 *   action = "gallery_upload") nhận 1 ảnh/video cho Thư viện CLB, lưu vào Drive + tab "Gallery".
 * - doGet: trả toàn bộ dữ liệu trong Sheet dạng JSON, để app tự tính bảng vinh danh
 *   (xếp hạng theo cự ly) trên trang chủ; hoặc (nếu action=gallery) trả danh sách ảnh/video
 *   trong Thư viện CLB.
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

// Thư viện ảnh/video CLB: tên tab riêng trên Sheet (tự tạo nếu chưa có) và tên folder Drive
// riêng để lưu file (tách biệt khỏi ảnh certificate).
var GALLERY_SHEET_TAB = "Gallery";
var GALLERY_FOLDER_NAME = "TKR Gallery";
var GALLERY_HEADER_ROW = ["Dấu thời gian", "Người đăng", "Chú thích", "Loại", "Link xem"];

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    if (SECRET && payload.secret !== SECRET) {
      return jsonOutput({ error: "Sai secret, kiểm tra lại GOOGLE_SCRIPT_SECRET." });
    }

    if (payload.action === "gallery_upload") {
      return handleGalleryUpload(payload);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = getDefaultDataSheet(ss);
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

    if (params.action === "gallery") {
      return handleGalleryList();
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = params.sheet_tab
      ? (ss.getSheetByName(params.sheet_tab) || getDefaultDataSheet(ss))
      : getDefaultDataSheet(ss);

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

// Nhận 1 ảnh/video từ trang Thư viện, lưu lên Drive (folder GALLERY_FOLDER_NAME) và ghi 1 dòng
// metadata vào tab GALLERY_SHEET_TAB (tự tạo tab + dòng tiêu đề nếu chưa có).
function handleGalleryUpload(payload) {
  if (!payload.media_base64) {
    return jsonOutput({ error: "Thiếu dữ liệu ảnh/video." });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GALLERY_SHEET_TAB) || ss.insertSheet(GALLERY_SHEET_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(GALLERY_HEADER_ROW);
  }

  var mimeType = payload.media_mime_type || "image/jpeg";
  var isVideo = mimeType.indexOf("video") === 0;

  var viewUrl;
  try {
    viewUrl = saveGalleryFileToDrive(payload.media_base64, mimeType, payload.filename || "media", isVideo);
  } catch (fileErr) {
    return jsonOutput({ error: "Lỗi lưu ảnh/video lên Drive: " + String(fileErr) });
  }

  sheet.appendRow([
    new Date(),
    payload.uploader_name || "",
    payload.caption || "",
    isVideo ? "video" : "image",
    viewUrl,
  ]);

  return jsonOutput({ status: "ok" });
}

// Trả về toàn bộ ảnh/video trong tab Gallery, mới nhất trước.
function handleGalleryList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(GALLERY_SHEET_TAB);
  if (!sheet) {
    return jsonOutput({ items: [] });
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonOutput({ items: [] });
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var items = values
    .map(function (r) {
      return {
        timestamp: r[0] ? String(r[0]) : "",
        uploader_name: r[1] || "",
        caption: r[2] || "",
        media_type: r[3] || "image",
        media_url: r[4] || "",
      };
    })
    .filter(function (item) {
      return item.media_url;
    })
    .reverse();

  return jsonOutput({ items: items });
}

// Cột "Thời gian hoàn thành" (chip time) đôi khi bị Google Sheets tự nhận diện là 1 giá trị
// Time và lưu thành object Date (ngày epoch giả 1899-12-30) thay vì giữ nguyên chuỗi "HH:MM:SS".
// Giá trị Date đó lưu đúng giờ đã nhập nhưng theo UTC+0 (vd nhập "03:29:27" thì Date lưu UTC
// "20:29:27" hôm trước - lệch đúng 7 tiếng, tức giờ Việt Nam UTC+7). Format theo tên timezone
// "Asia/Ho_Chi_Minh" bị SAI vì ngày epoch giả 1899 rơi trước năm 1906, khi đó Google áp quy tắc
// lịch sử "Local Mean Time" (lệch +07:06:xx lẻ, không phải +07:00 chẵn) thay vì offset hiện tại,
// làm giờ bị lệch vài phút không cố định. Format theo UTC thuần (Etc/GMT) thì lại thiếu mất 7
// tiếng cộng thêm. Dùng "Etc/GMT-7" (lưu ý ký hiệu Etc/GMT bị đảo dấu theo chuẩn POSIX, nên
// "GMT-7" ở đây thực chất là UTC+7) để có offset Việt Nam cố định, không dính bất kỳ quy tắc
// lịch sử/DST nào, mới ra đúng "HH:mm:ss" đã nhập ban đầu.
function formatFinishTime(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, "Etc/GMT-7", "HH:mm:ss");
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

// Lưu ảnh/video thư viện lên Drive, trả về link nhúng được thẳng vào trang web (khác với link
// "open?id=" ở trên - link đó chỉ để mở trang xem của Drive, không nhúng trực tiếp được).
// Ảnh dùng endpoint "thumbnail" chính thức của Drive để nhúng vào thẻ <img> - link kiểu
// "uc?export=view" ngày càng hay bị Google chặn/không hiển thị được (403, ảnh vỡ) nên không
// dùng nữa. Video dùng link "preview" để nhúng vào <iframe> (Drive không cho phát trực tiếp
// qua thẻ <video> thông thường).
function saveGalleryFileToDrive(base64Data, mimeType, filename, isVideo) {
  var folder = getOrCreateFolder(GALLERY_FOLDER_NAME);
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType, filename);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var id = file.getId();
  return isVideo
    ? "https://drive.google.com/file/d/" + id + "/preview"
    : "https://drive.google.com/thumbnail?id=" + id + "&sz=w1600";
}

// Khi không chỉ định sheet_tab, trước đây script dùng ss.getActiveSheet() - nhưng hàm đó trả về
// bất kỳ tab nào 1 người vừa bấm vào xem trên giao diện Google Sheets (không liên quan gì tới
// app), CHỨ KHÔNG PHẢI tab chứa dữ liệu thành tích. Từ khi có thêm tab "Gallery", chỉ cần ai đó
// mở Sheet lên xem tab Gallery là mọi request tiếp theo (kể cả lúc app ghi thành tích mới!) sẽ bị
// lệch sang tab Gallery, làm bảng vinh danh hiện trống dù dữ liệu vẫn còn nguyên trên tab cũ. Hàm
// này thay thế bằng cách luôn lấy tab ĐẦU TIÊN không phải tab Gallery - cố định, không phụ thuộc
// ai đang xem tab nào.
function getDefaultDataSheet(ss) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName() !== GALLERY_SHEET_TAB) {
      return sheets[i];
    }
  }
  return sheets[0];
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

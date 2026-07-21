const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const pendingList = document.getElementById("pending-list");
const extractBtn = document.getElementById("extract-btn");
const extractStatus = document.getElementById("extract-status");
const resultsSection = document.getElementById("results-section");
const resultsBody = document.getElementById("results-body");
const exportBtn = document.getElementById("export-btn");
const exportStatus = document.getElementById("export-status");
const sheetIdInput = document.getElementById("sheet-id");
const sheetTabInput = document.getElementById("sheet-tab");

let pendingFiles = [];

function renderPendingList() {
  pendingList.innerHTML = "";
  pendingFiles.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "pending-item";
    item.innerHTML = `<span>${file.name}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.title = "Bỏ ảnh này";
    removeBtn.addEventListener("click", () => {
      pendingFiles.splice(index, 1);
      renderPendingList();
    });
    item.appendChild(removeBtn);
    pendingList.appendChild(item);
  });
  extractBtn.disabled = pendingFiles.length === 0;
}

function addFiles(fileList) {
  const validTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  for (const file of fileList) {
    if (validTypes.has(file.type)) {
      pendingFiles.push(file);
    }
  }
  renderPendingList();
}

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (e) => {
  addFiles(e.dataTransfer.files);
});

fileInput.addEventListener("change", (e) => {
  addFiles(e.target.files);
  fileInput.value = "";
});

function addResultRow(row) {
  const tr = document.createElement("tr");

  const filenameCell = document.createElement("td");
  filenameCell.textContent = row.filename || "";
  tr.appendChild(filenameCell);

  const fields = ["full_name", "distance", "finish_time", "race_name"];
  const cells = {};
  fields.forEach((field) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = row[field] || "";
    input.dataset.field = field;
    td.appendChild(input);
    tr.appendChild(td);
    cells[field] = input;
  });

  const actionCell = document.createElement("td");
  const removeBtn = document.createElement("button");
  removeBtn.className = "row-remove";
  removeBtn.textContent = "🗑";
  removeBtn.title = "Xoá dòng này";
  removeBtn.addEventListener("click", () => tr.remove());
  actionCell.appendChild(removeBtn);
  tr.appendChild(actionCell);

  resultsBody.appendChild(tr);
}

extractBtn.addEventListener("click", async () => {
  if (pendingFiles.length === 0) return;

  extractBtn.disabled = true;
  extractStatus.textContent = `Đang trích xuất ${pendingFiles.length} ảnh...`;
  extractStatus.className = "status";

  const formData = new FormData();
  pendingFiles.forEach((file) => formData.append("images", file));

  try {
    const res = await fetch("/api/extract", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      extractStatus.textContent = data.error || "Có lỗi xảy ra khi trích xuất.";
      extractStatus.className = "status error";
      extractBtn.disabled = false;
      return;
    }

    (data.results || []).forEach(addResultRow);

    if (data.results && data.results.length > 0) {
      resultsSection.hidden = false;
    }

    const errorCount = (data.errors || []).length;
    if (errorCount > 0) {
      const names = data.errors.map((e) => e.filename).join(", ");
      extractStatus.textContent = `Xong. ${data.results.length} ảnh thành công, ${errorCount} ảnh lỗi (${names}).`;
      extractStatus.className = "status error";
    } else {
      extractStatus.textContent = `Đã trích xuất xong ${data.results.length} ảnh.`;
      extractStatus.className = "status success";
    }

    pendingFiles = [];
    renderPendingList();
  } catch (err) {
    extractStatus.textContent = "Không thể kết nối tới server.";
    extractStatus.className = "status error";
  } finally {
    extractBtn.disabled = pendingFiles.length === 0;
  }
});

exportBtn.addEventListener("click", async () => {
  const rows = [];
  resultsBody.querySelectorAll("tr").forEach((tr) => {
    const row = {};
    tr.querySelectorAll("input[data-field]").forEach((input) => {
      row[input.dataset.field] = input.value.trim();
    });
    rows.push(row);
  });

  if (rows.length === 0) {
    exportStatus.textContent = "Không có dữ liệu để xuất.";
    exportStatus.className = "status error";
    return;
  }

  const sheetId = sheetIdInput.value.trim();
  if (!sheetId) {
    exportStatus.textContent = "Vui lòng nhập Google Sheet ID.";
    exportStatus.className = "status error";
    return;
  }

  exportBtn.disabled = true;
  exportStatus.textContent = "Đang xuất ra Google Sheet...";
  exportStatus.className = "status";

  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows,
        sheet_id: sheetId,
        sheet_tab: sheetTabInput.value.trim(),
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      exportStatus.textContent = data.error || "Có lỗi xảy ra khi xuất dữ liệu.";
      exportStatus.className = "status error";
      return;
    }

    exportStatus.textContent = `Đã ghi ${data.rows_written} dòng vào Google Sheet.`;
    exportStatus.className = "status success";
  } catch (err) {
    exportStatus.textContent = "Không thể kết nối tới server.";
    exportStatus.className = "status error";
  } finally {
    exportBtn.disabled = false;
  }
});

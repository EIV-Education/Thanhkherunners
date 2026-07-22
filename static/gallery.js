const uploadZone = document.getElementById("upload-zone");
const fileInput = document.getElementById("file-input");
const pendingFile = document.getElementById("pending-file");
const uploadForm = document.getElementById("upload-form");
const uploaderNameInput = document.getElementById("uploader-name");
const uploaderCaptionInput = document.getElementById("uploader-caption");
const uploadBtn = document.getElementById("upload-btn");
const uploadStatus = document.getElementById("upload-status");

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const MAX_BYTES = 20 * 1024 * 1024;

let selectedFile = null;

function setFile(file) {
  if (!file) return;
  if (!ALLOWED_TYPES.has(file.type)) {
    uploadStatus.textContent = "Định dạng không hỗ trợ.";
    uploadStatus.className = "status error";
    return;
  }
  if (file.size > MAX_BYTES) {
    uploadStatus.textContent = "File vượt quá 20MB.";
    uploadStatus.className = "status error";
    return;
  }
  selectedFile = file;
  pendingFile.hidden = false;
  pendingFile.innerHTML = `<span>${file.name}</span>`;
  uploadForm.hidden = false;
  uploadStatus.textContent = "";
  uploadStatus.className = "status";
}

["dragenter", "dragover"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadZone.classList.remove("dragover");
  });
});

uploadZone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  setFile(file);
});

fileInput.addEventListener("change", (e) => {
  setFile(e.target.files && e.target.files[0]);
  fileInput.value = "";
});

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(result.substring(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

uploadBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  uploadBtn.disabled = true;
  uploadStatus.textContent = "Đang tải lên (có thể mất chút thời gian với video)...";
  uploadStatus.className = "status";

  try {
    const media_base64 = await readFileAsBase64(selectedFile);
    const res = await fetch("/api/gallery/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uploader_name: uploaderNameInput.value.trim(),
        caption: uploaderCaptionInput.value.trim(),
        media_base64,
        media_mime_type: selectedFile.type,
        filename: selectedFile.name,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      uploadStatus.textContent = data.error || "Có lỗi xảy ra khi tải lên.";
      uploadStatus.className = "status error";
      uploadBtn.disabled = false;
      return;
    }

    uploadStatus.textContent = "Đã tải lên! Đang làm mới thư viện...";
    uploadStatus.className = "status success";
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    uploadStatus.textContent = "Không thể kết nối tới server.";
    uploadStatus.className = "status error";
    uploadBtn.disabled = false;
  }
});

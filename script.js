function createId() {
  if (window.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `dose-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const doses = [
  {
    id: createId(),
    name: "아침 혈압약",
    time: "08:00",
    rule: "아침 식후 30분",
    done: true,
  },
  {
    id: createId(),
    name: "점심 위장약",
    time: "12:40",
    rule: "점심 식후 30분",
    done: false,
  },
];

const doseList = document.querySelector("#doseList");
const progressValue = document.querySelector("#progressValue");
const progressTitle = document.querySelector("#progressTitle");
const progressRing = document.querySelector(".progress-ring");
const routineForm = document.querySelector("#routineForm");
const toast = document.querySelector("#toast");
const shareToggle = document.querySelector("#shareToggle");
const shareText = document.querySelector("#shareText");
const prescriptionImage = document.querySelector("#prescriptionImage");
const ocrPreview = document.querySelector("#ocrPreview");
const ocrResult = document.querySelector("#ocrResult");
const installDialog = document.querySelector("#installDialog");
let deferredInstallPrompt = null;
let ocrWorkerPromise = null;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function renderDoses() {
  doseList.innerHTML = doses
    .map(
      (dose) => `
        <article class="dose-card ${dose.done ? "done" : ""}">
          <div class="dose-time">${escapeHtml(dose.time)}</div>
          <div>
            <h3>${escapeHtml(dose.name)}</h3>
            <p>${escapeHtml(dose.rule)}</p>
          </div>
          <button class="check-dose" type="button" data-id="${dose.id}" title="복약 체크">
            ${dose.done ? "✓" : ""}
          </button>
        </article>
      `,
    )
    .join("");

  const completed = doses.filter((dose) => dose.done).length;
  const percent = doses.length ? Math.round((completed / doses.length) * 100) : 0;
  progressValue.textContent = `${percent}%`;
  progressTitle.textContent = `${doses.length}개 중 ${completed}개 완료`;
  progressRing.style.setProperty("--value", `${percent}%`);
}

doseList.addEventListener("click", (event) => {
  const button = event.target.closest(".check-dose");
  if (!button) return;

  const dose = doses.find((item) => item.id === button.dataset.id);
  dose.done = !dose.done;
  renderDoses();
  showToast(dose.done ? "복약 완료를 기록했어요." : "복약 체크를 되돌렸어요.");
});

routineForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = document.querySelector("#medicineName").value.trim();
  const time = document.querySelector("#medicineTime").value;
  const rule = document.querySelector("#medicineRule").value;

  doses.push({
    id: createId(),
    name,
    time,
    rule,
    done: false,
  });

  doses.sort((a, b) => a.time.localeCompare(b.time));
  routineForm.reset();
  renderDoses();
  showToast("새 복약 루틴을 추가했어요.");
});

document.querySelector("#scanPreset").addEventListener("click", () => {
  applyOcrText("약품명: 저녁 콜레스테롤약\n용법: 잠들기 전\n복용시간: 20:30");
  showToast("처방전 촬영 결과 예시를 채웠어요.");
});

function applyOcrText(text) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const timeMatch = normalized.match(/([01]?\d|2[0-3])[:시]\s?([0-5]\d)?/);
  const knownRules = ["식후 30분", "식전", "잠들기 전", "아침 기상 후"];
  const rule = knownRules.find((item) => normalized.includes(item)) || "식후 30분";
  const nameMatch =
    text.match(/(?:약품명|약명|약 이름|의약품)[:\s]+([^\n]+)/) ||
    text.match(/([가-힣A-Za-z0-9]+(?:약|정|캡슐|시럽))/);

  const name = nameMatch?.[1]?.replace(/[.,]/g, "").trim() || "처방 약";
  const hour = timeMatch ? timeMatch[1].padStart(2, "0") : "08";
  const minute = timeMatch?.[2] || "00";

  document.querySelector("#medicineName").value = name;
  document.querySelector("#medicineTime").value = `${hour}:${minute}`;
  document.querySelector("#medicineRule").value = rule;
  ocrResult.textContent = `읽은 내용\n${text.trim()}\n\n자동 입력: ${name}, ${hour}:${minute}, ${rule}`;
}

function setOcrStatus(message) {
  ocrResult.textContent = message;
}

async function prepareImageForOcr(file) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = imageUrl;
  });

  const targetWidth = Math.min(1800, Math.max(1200, image.naturalWidth));
  const scale = targetWidth / image.naturalWidth;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);

  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    pixels[i] = contrast;
    pixels[i + 1] = contrast;
    pixels[i + 2] = contrast;
  }

  context.putImageData(imageData, 0, 0);
  URL.revokeObjectURL(imageUrl);
  return canvas;
}

function updateOcrProgress(message) {
  if (!message?.status) return;

  const percent = Math.round((message.progress || 0) * 100);
  if (message.status === "recognizing text") {
    setOcrStatus(`글자를 읽는 중이에요... ${percent}%`);
    return;
  }

  if (message.status.includes("loading") || message.status.includes("initializing")) {
    setOcrStatus(`OCR 엔진을 준비하는 중이에요... ${percent}%`);
  }
}

async function getOcrWorker() {
  if (!window.Tesseract?.createWorker) {
    throw new Error("Tesseract.js가 아직 불러와지지 않았어요.");
  }

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker("kor+eng", 1, {
      logger: updateOcrProgress,
    });
  }

  return ocrWorkerPromise;
}

prescriptionImage.addEventListener("change", () => {
  const file = prescriptionImage.files?.[0];
  if (!file) return;

  ocrPreview.src = URL.createObjectURL(file);
  ocrPreview.hidden = false;
  ocrResult.textContent = "이미지를 불러왔어요. 이제 글자 읽기를 눌러주세요.";
});

document.querySelector("#runOcr").addEventListener("click", async () => {
  const file = prescriptionImage.files?.[0];
  if (!file) {
    showToast("먼저 약봉투 사진을 올려주세요.");
    return;
  }

  try {
    setOcrStatus("사진을 OCR에 맞게 정리하는 중이에요...");
    const image = await prepareImageForOcr(file);
    const worker = await getOcrWorker();
    const {
      data: { text },
    } = await worker.recognize(image);

    if (!text.trim()) {
      setOcrStatus(
        "글자를 찾지 못했어요.\n약봉투를 화면에 꽉 차게 찍고, 그림자 없이 밝은 곳에서 다시 시도해보세요.",
      );
      return;
    }

    applyOcrText(text);
    showToast("사진에서 읽은 내용으로 입력했어요.");
  } catch {
    setOcrStatus(
      "OCR 엔진을 불러오지 못했어요.\n인터넷 연결을 확인한 뒤 다시 시도하거나, 샘플 읽기로 흐름을 확인해보세요.",
    );
    showToast("OCR을 완료하지 못했어요.");
  }
});

document.querySelector("#demoOcr").addEventListener("click", () => {
  applyOcrText("약품명: 위장 보호정\n용법: 식후 30분\n복용시간: 12:40\n1회 1정");
  showToast("샘플 OCR 결과를 입력했어요.");
});

document.querySelector("#openAdd").addEventListener("click", () => {
  document.querySelector("#addPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  document.querySelector("#medicineName").focus();
});

shareToggle.addEventListener("change", () => {
  shareText.textContent = shareToggle.checked
    ? "복약 완료 시 안심 메시지 전송 중"
    : "보호자 공유가 잠시 꺼져 있어요";
  showToast(shareToggle.checked ? "가족 공유를 켰어요." : "가족 공유를 껐어요.");
});

document.querySelector("#copyShare").addEventListener("click", async () => {
  const url = "https://mediroutine.example/share/family-demo";
  try {
    await navigator.clipboard.writeText(url);
    showToast("공유 링크를 복사했어요.");
  } catch {
    showToast("공유 링크: mediroutine.example/share/family-demo");
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

document.querySelector("#installApp").addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }

  if (typeof installDialog.showModal === "function") {
    installDialog.showModal();
  } else {
    showToast("브라우저 메뉴에서 홈 화면에 추가를 선택하세요.");
  }
});

document.querySelector("#closeInstall").addEventListener("click", () => {
  installDialog.close();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    showToast("오프라인 저장을 준비하지 못했어요.");
  });
}

renderDoses();

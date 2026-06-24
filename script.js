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

  if (!("TextDetector" in window)) {
    ocrResult.textContent =
      "이 브라우저에서는 실시간 OCR을 지원하지 않아요.\n샘플 읽기로 자동 입력 흐름을 확인해보세요.";
    showToast("현재 브라우저가 OCR을 지원하지 않아요.");
    return;
  }

  try {
    ocrResult.textContent = "이미지에서 글자를 읽는 중이에요...";
    const detector = new TextDetector();
    const bitmap = await createImageBitmap(file);
    const results = await detector.detect(bitmap);
    const text = results.map((item) => item.rawValue).join("\n");

    if (!text.trim()) {
      ocrResult.textContent = "글자를 찾지 못했어요. 더 밝고 선명한 사진으로 다시 시도해보세요.";
      return;
    }

    applyOcrText(text);
    showToast("사진에서 읽은 내용으로 입력했어요.");
  } catch {
    ocrResult.textContent =
      "OCR 처리 중 문제가 생겼어요.\n샘플 읽기로 자동 입력 흐름을 확인해보세요.";
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

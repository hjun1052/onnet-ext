const baseUrlInput = document.getElementById("baseUrl");
const gameUrlInput = document.getElementById("gameUrl");
const userIdInput = document.getElementById("userId");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");

async function loadSettings() {
  const { onnetSettings } = await chrome.storage.sync.get("onnetSettings");
  baseUrlInput.value = onnetSettings?.baseUrl || "http://localhost:3000";
  userIdInput.value = onnetSettings?.userId || 1;
}

async function saveSettings(baseUrl, userId) {
  await chrome.storage.sync.set({
    onnetSettings: { baseUrl, userId },
  });
}

saveBtn.addEventListener("click", async () => {
  const baseUrl = baseUrlInput.value.trim() || "http://localhost:3000";
  const url = gameUrlInput.value.trim();
  const userId = Number(userIdInput.value || 1);
  if (!url) {
    statusEl.textContent = "URL을 입력하세요.";
    statusEl.style.color = "#fca5a5";
    return;
  }

  statusEl.textContent = "추가 중...";
  statusEl.style.color = "#e5e7eb";

  await saveSettings(baseUrl, userId);

  chrome.runtime.sendMessage(
    { type: "ADD_GAME", payload: { url, userId, baseUrl } },
    (resp) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = chrome.runtime.lastError.message;
        statusEl.style.color = "#fca5a5";
        return;
      }
      if (resp?.error) {
        statusEl.textContent = resp.error;
        statusEl.style.color = "#fca5a5";
      } else {
        statusEl.textContent = `등록 완료: ${resp?.slug || "새 게임"} (트래킹 시작)`;
        statusEl.style.color = "#bbf7d0";
      }
    },
  );
});

loadSettings();

(() => {
  const BTN_ID = "onnet-extension-add-btn";

  function extractMeta() {
    const title = document.querySelector("meta[property='og:title']")?.content ||
      document.title ||
      document.querySelector("h1")?.textContent?.trim();
    const image =
      document.querySelector("meta[property='og:image']")?.content ||
      document.querySelector("link[rel='icon']")?.href ||
      document.querySelector("link[rel='shortcut icon']")?.href ||
      document.querySelector("img")?.src;
    const description =
      document.querySelector("meta[name='description']")?.content ||
      document.querySelector("meta[property='og:description']")?.content ||
      document.querySelector("p")?.textContent?.trim();
    return { title, image, description };
  }

  function createButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.textContent = "Onnet: 게임 추가";
    btn.style.position = "fixed";
    btn.style.bottom = "16px";
    btn.style.right = "16px";
    btn.style.zIndex = "99999";
    btn.style.padding = "12px 16px";
    btn.style.border = "none";
    btn.style.borderRadius = "12px";
    btn.style.background = "linear-gradient(120deg, #38bdf8, #6366f1)";
    btn.style.color = "#fff";
    btn.style.fontWeight = "700";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "14px";

    btn.addEventListener("click", () => {
      const url = prompt("추가할 게임 URL을 입력하세요:");
      if (!url) return;
      const meta = extractMeta();
      chrome.runtime.sendMessage({ type: "ADD_GAME", payload: { url, meta } }, (resp) => {
        if (chrome.runtime.lastError) {
          alert(`실패: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (resp?.error) {
          alert(`실패: ${resp.error}`);
        } else {
          alert(`등록 완료! slug: ${resp.slug}. 이 페이지 체류 시간이 플레이타임으로 기록됩니다.`);
        }
      });
    });
    document.body.appendChild(btn);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    createButton();
  } else {
    document.addEventListener("DOMContentLoaded", createButton);
  }

  // Dwell-time tracker: ask background if this URL is mapped, then send time on unload/visibility change.
  chrome.runtime.sendMessage({ type: "GET_MAPPING", payload: { url: location.href } }, (resp) => {
    if (!resp?.gameSlug) return;
    let start = Date.now();
    const flush = () => {
      const elapsed = Date.now() - start;
      if (elapsed < 1000) return;
      chrome.runtime.sendMessage({
        type: "TRACK_TIME",
        payload: { gameSlug: resp.gameSlug, seconds: Math.round(elapsed / 1000) },
      });
      start = Date.now();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    setInterval(flush, 15000);
  });
})();

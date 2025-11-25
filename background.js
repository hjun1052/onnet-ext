const STORAGE_KEY = "onnetTrackedGames";

function normalizeUrl(url) {
  try {
    return new URL(url).origin + new URL(url).pathname;
  } catch {
    return url;
  }
}

async function getSettings() {
  const { onnetSettings } = await chrome.storage.sync.get("onnetSettings");
  return {
    baseUrl: onnetSettings?.baseUrl || "http://localhost:3000",
    userId: Number(onnetSettings?.userId || 1),
  };
}

async function loadTracked() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveTracked(entries) {
  await chrome.storage.local.set({ [STORAGE_KEY]: entries });
}

async function addGameMapping(mapping) {
  const entries = await loadTracked();
  const existingIdx = entries.findIndex((e) => e.urlPrefix === mapping.urlPrefix);
  if (existingIdx >= 0) {
    entries[existingIdx] = mapping;
  } else {
    entries.push(mapping);
  }
  await saveTracked(entries);
}

function matchGame(url, mappings) {
  const normalized = normalizeUrl(url);
  return mappings.find((m) => normalized.startsWith(m.urlPrefix));
}

let active = {
  tabId: null,
  start: null,
  url: null,
  gameSlug: null,
  userId: 1,
  baseUrl: "http://localhost:3000",
};

async function flushActive() {
  if (!active.tabId || !active.start || !active.url || !active.gameSlug) return;
  const elapsedMs = Date.now() - active.start;
  if (elapsedMs < 2000) return;
  const seconds = Math.round(elapsedMs / 1000);
  const payload = {
    userId: active.userId,
    gameSlug: active.gameSlug,
    seconds,
  };
  try {
    await fetch(`${active.baseUrl}/api/playtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("Failed to send playtime", e);
  } finally {
    active.start = Date.now();
  }
}

async function setActive(tabId, url) {
  const { baseUrl, userId } = await getSettings();
  const mappings = await loadTracked();
  const match = matchGame(url, mappings);
  if (!match) {
    active = { tabId: null, start: null, url: null, gameSlug: null, userId, baseUrl };
    return;
  }
  await flushActive();
  active = {
    tabId,
    start: Date.now(),
    url,
    gameSlug: match.gameSlug,
    userId,
    baseUrl,
  };
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.url) return;
  await setActive(tabId, tab.url);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    await setActive(tabId, tab.url);
  }
});

chrome.windows.onFocusChanged.addListener(async () => {
  await flushActive();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "ADD_GAME") {
    handleAddGame(message.payload).then(sendResponse);
    return true;
  }
  return false;
});

async function handleAddGame(payload) {
  const { baseUrl, userId } = await getSettings();
  const url = payload.url;
  if (!url) return { error: "URL required" };
  const meta = payload.meta || {};

  try {
    const resp = await fetch(`${baseUrl}/api/external-games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, userId, ...meta }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return { error: data?.message || "Failed to add game" };
    }
    const urlPrefix = normalizeUrl(url);
    await addGameMapping({ urlPrefix, gameSlug: data.slug, userId, baseUrl });
    return { slug: data.slug };
  } catch (e) {
    return { error: String(e) };
  }
}

setInterval(() => {
  flushActive();
}, 10000);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_MAPPING") {
    loadTracked().then((entries) => {
      const match = matchGame(message.payload?.url || "", entries);
      sendResponse(match || {});
    });
    return true;
  }
  if (message.type === "TRACK_TIME") {
    (async () => {
      const entries = await loadTracked();
      const mapping = entries.find((m) => m.gameSlug === message.payload?.gameSlug);
      if (!mapping) return sendResponse({ ok: false, reason: "no mapping" });
      const { baseUrl, userId } = await getSettings();
      const seconds = message.payload?.seconds || 0;
      if (seconds <= 0) return sendResponse({ ok: false, reason: "no time" });
      await fetch(`${baseUrl}/api/playtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug: mapping.gameSlug, userId, seconds }),
      }).catch(() => {});
      sendResponse({ ok: true });
    })();
    return true;
  }
});

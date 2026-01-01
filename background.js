chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    title: "Save as Snippet",
    contexts: ["selection", "editable"],
    id: "save-snippet"
  });
  void clearLegacyEmbeddingsStorage();
  ensureSnippetsStorage('local');
  ensureSnippetsStorage('sync');
});

function ensureSnippetsStorage(area) {
  if (!chrome.storage || !chrome.storage[area]) {
    throw new Error(`chrome.storage.${area} is not available.`);
  }
  chrome.storage[area].get(['snippets'], function(result) {
    if (chrome.runtime.lastError) {
      throw new Error(`Failed to read snippets: ${chrome.runtime.lastError.message}`);
    }
    if (result.snippets === undefined) {
      chrome.storage[area].set({ snippets: [] }, function() {
        if (chrome.runtime.lastError) {
          throw new Error(`Failed to initialize snippets: ${chrome.runtime.lastError.message}`);
        }
      });
      return;
    }
    if (!Array.isArray(result.snippets)) {
      throw new Error('Snippets storage must be an array.');
    }
  });
}

const LEGACY_EMBEDDINGS_KEY = 'snippet_embeddings_v1';

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-snippet") {
    return;
  }
  void handleSaveSnippet(info, tab);
});

async function handleSaveSnippet(info, tab) {
  let selectedText = typeof info.selectionText === 'string' ? info.selectionText : '';
  if (typeof selectedText !== 'string' || selectedText.trim().length === 0) {
    if (typeof tab.id !== 'number') {
      throw new Error('Tab ID is required to read selection.');
    }
    selectedText = await requestSelectedText(tab.id);
  }
  if (typeof selectedText !== 'string' || selectedText.trim().length === 0) {
    throw new Error('Selected text is required to save a snippet.');
  }
  if (!tab || typeof tab.url !== 'string') {
    throw new Error('Tab URL is required to save a snippet.');
  }
  if (typeof tab.id !== 'number') {
    throw new Error('Tab ID is required to save a snippet.');
  }
  const id = generateSnippetId();
  await saveSnippet({ id, text: selectedText, url: tab.url });
  sendAnimateMessage(tab.id, selectedText);
}

function generateSnippetId() {
  if (!crypto || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID is required to generate snippet IDs.');
  }
  return crypto.randomUUID();
}

async function getStorage(area, keys) {
  if (!chrome.storage || !chrome.storage[area]) {
    throw new Error(`chrome.storage.${area} is not available.`);
  }
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Storage read failed: ${chrome.runtime.lastError.message}`));
        return;
      }
      resolve(result);
    });
  });
}

async function setStorage(area, data) {
  if (!chrome.storage || !chrome.storage[area]) {
    throw new Error(`chrome.storage.${area} is not available.`);
  }
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(data, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Storage write failed: ${chrome.runtime.lastError.message}`));
        return;
      }
      resolve();
    });
  });
}

async function saveSnippet({ id, text, url }) {
  const result = await getStorage('local', ['snippets']);
  if (!Array.isArray(result.snippets)) {
    throw new Error('Snippets storage must be an array.');
  }
  const snippets = result.snippets;
  snippets.push({
    id,
    text,
    url,
    date: new Date().toISOString()
  });
  await setStorage('local', { snippets });
}

async function requestSelectedText(tabId) {
  if (typeof tabId !== 'number') {
    throw new Error('Tab ID is required to request selection.');
  }
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'getSelectedText' }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Failed to read selection: ${chrome.runtime.lastError.message}`));
        return;
      }
      if (!response || response.ok !== true || typeof response.text !== 'string') {
        const message = response && response.error ? response.error : 'No selection available.';
        reject(new Error(message));
        return;
      }
      resolve(response.text);
    });
  });
}

async function clearLegacyEmbeddingsStorage() {
  await removeStorage('local', [LEGACY_EMBEDDINGS_KEY]);
}

async function removeStorage(area, keys) {
  if (!chrome.storage || !chrome.storage[area]) {
    throw new Error(`chrome.storage.${area} is not available.`);
  }
  if (typeof chrome.storage[area].remove !== 'function') {
    throw new Error(`chrome.storage.${area}.remove is not available.`);
  }
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Storage remove failed: ${chrome.runtime.lastError.message}`));
        return;
      }
      resolve();
    });
  });
}

function sendAnimateMessage(tabId, text) {
  chrome.tabs.sendMessage(
    tabId,
    { action: 'animateSnippet', text },
    () => {
      if (chrome.runtime.lastError) {
        console.log('Animation message failed:', chrome.runtime.lastError.message);
      }
    }
  );
}

const LEGACY_EMBEDDINGS_KEY = 'snippet_embeddings_v1';
const STORAGE_LABELS = Object.freeze({
  local: 'Local',
  sync: 'Synced'
});

let snippetsByArea = { local: [], sync: [] };
let activeArea = 'local';
let addTargetArea = 'local';
let searchToken = 0;

document.addEventListener('DOMContentLoaded', () => {
  void initialize();
});

async function initialize() {
  setStatus('', 'idle');
  const clearAllButton = getRequiredElement('clear-all');
  const searchInput = getRequiredElement('search-input');
  const localTab = getRequiredElement('tab-local');
  const syncTab = getRequiredElement('tab-sync');
  const addButton = getRequiredElement('add-snippet');
  const addPanel = getRequiredElement('add-panel');
  const addInput = getRequiredElement('add-input');
  const addSave = getRequiredElement('add-save');
  const addCancel = getRequiredElement('add-cancel');
  const addAreaLocal = getRequiredElement('add-area-local');
  const addAreaSync = getRequiredElement('add-area-sync');

  clearAllButton.addEventListener('click', () => {
    void clearAllSnippets();
  });
  searchInput.addEventListener('input', () => {
    void filterSnippets();
  });
  localTab.addEventListener('click', () => {
    void setActiveArea('local');
  });
  syncTab.addEventListener('click', () => {
    void setActiveArea('sync');
  });
  addButton.addEventListener('click', () => {
    toggleAddPanel();
  });
  addCancel.addEventListener('click', () => {
    closeAddPanel();
  });
  addSave.addEventListener('click', () => {
    void handleAddSnippet();
  });
  addAreaLocal.addEventListener('click', () => {
    setAddTargetArea('local');
  });
  addAreaSync.addEventListener('click', () => {
    setAddTargetArea('sync');
  });
  addInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleAddSnippet();
    }
  });

  await loadAndDisplaySnippets();
}

function getRequiredElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

function setStatus(message, state) {
  const status = getRequiredElement('search-status');
  status.textContent = message;
  status.dataset.state = state;
}

function getStorage(area, keys) {
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

function setStorage(area, data) {
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

function removeStorage(area, keys) {
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

function getBytesInUse(area, keys) {
  if (!chrome.storage || !chrome.storage[area]) {
    throw new Error(`chrome.storage.${area} is not available.`);
  }
  if (typeof chrome.storage[area].getBytesInUse !== 'function') {
    throw new Error(`chrome.storage.${area}.getBytesInUse is not available.`);
  }
  return new Promise((resolve, reject) => {
    chrome.storage[area].getBytesInUse(keys, (bytes) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Storage bytes failed: ${chrome.runtime.lastError.message}`));
        return;
      }
      resolve(bytes);
    });
  });
}

async function ensureSnippetsStorage(area) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  const result = await getStorage(area, ['snippets']);
  if (result.snippets === undefined) {
    await setStorage(area, { snippets: [] });
    return;
  }
  if (!Array.isArray(result.snippets)) {
    throw new Error('Snippets storage must be an array.');
  }
}

async function clearLegacyEmbeddingsStorage() {
  await removeStorage('local', [LEGACY_EMBEDDINGS_KEY]);
}

async function loadAndDisplaySnippets() {
  await ensureSnippetsStorage('local');
  await ensureSnippetsStorage('sync');
  snippetsByArea.local = await loadSnippetsForArea('local');
  snippetsByArea.sync = await loadSnippetsForArea('sync');
  await ensureSnippetIds('local');
  await ensureSnippetIds('sync');
  await clearLegacyEmbeddingsStorage();

  await setActiveArea(activeArea);
}

function getAreaLabel(area) {
  const label = STORAGE_LABELS[area];
  if (!label) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  return label;
}

function getActiveSnippets() {
  const snippets = snippetsByArea[activeArea];
  if (!Array.isArray(snippets)) {
    throw new Error('Active snippets are invalid.');
  }
  return snippets;
}

function getSortedSnippets(area) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  const list = snippetsByArea[area];
  if (!Array.isArray(list)) {
    throw new Error('Snippets storage must be an array.');
  }
  return [...list].sort((a, b) => getSnippetTimestamp(b) - getSnippetTimestamp(a));
}

function getSnippetTimestamp(snippet) {
  if (!snippet || typeof snippet !== 'object') {
    throw new Error('Snippet entry is invalid.');
  }
  if (typeof snippet.date !== 'string' || snippet.date.trim().length === 0) {
    throw new Error('Snippet date is required for sorting.');
  }
  const timestamp = Date.parse(snippet.date);
  if (!Number.isFinite(timestamp)) {
    throw new Error('Snippet date is invalid.');
  }
  return timestamp;
}

function getAllSnippetItems() {
  const items = [];
  for (const area of Object.keys(snippetsByArea)) {
    if (!STORAGE_LABELS[area]) {
      throw new Error(`Unsupported storage area: ${area}`);
    }
    const list = snippetsByArea[area];
    if (!Array.isArray(list)) {
      throw new Error('Snippets storage must be an array.');
    }
    for (const snippet of list) {
      if (!snippet || typeof snippet !== 'object') {
        throw new Error('Snippet entry is invalid.');
      }
      items.push({ snippet, area });
    }
  }
  return items;
}

async function loadSnippetsForArea(area) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  const result = await getStorage(area, ['snippets']);
  if (result.snippets === undefined) {
    throw new Error(`Snippets storage is missing for ${area}.`);
  }
  if (!Array.isArray(result.snippets)) {
    throw new Error('Snippets storage must be an array.');
  }
  return result.snippets;
}

async function saveSnippetsForArea(area, snippets) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  if (!Array.isArray(snippets)) {
    throw new Error('Snippets storage must be an array.');
  }
  await setStorage(area, { snippets });
}

async function ensureSnippetIds(area) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  let updated = false;
  const current = snippetsByArea[area];
  if (!Array.isArray(current)) {
    throw new Error('Snippets storage must be an array.');
  }
  const next = current.map((snippet) => {
    if (!snippet || typeof snippet !== 'object') {
      throw new Error('Snippet entry is invalid.');
    }
    if (!snippet.id) {
      updated = true;
      return { ...snippet, id: generateSnippetId() };
    }
    return snippet;
  });
  snippetsByArea[area] = next;
  if (updated) {
    await saveSnippetsForArea(area, next);
  }
}

function generateSnippetId() {
  if (!crypto || typeof crypto.randomUUID !== 'function') {
    throw new Error('crypto.randomUUID is required to generate snippet IDs.');
  }
  return crypto.randomUUID();
}

function updateTabCounts() {
  if (!Array.isArray(snippetsByArea.local) || !Array.isArray(snippetsByArea.sync)) {
    throw new Error('Snippet storage is not initialized.');
  }
  getRequiredElement('tab-count-local').textContent = `${snippetsByArea.local.length}`;
  getRequiredElement('tab-count-sync').textContent = `${snippetsByArea.sync.length}`;
}

function updateTabState() {
  if (!STORAGE_LABELS[activeArea]) {
    throw new Error(`Unsupported storage area: ${activeArea}`);
  }
  const localTab = getRequiredElement('tab-local');
  const syncTab = getRequiredElement('tab-sync');
  const isLocal = activeArea === 'local';
  localTab.classList.toggle('active', isLocal);
  syncTab.classList.toggle('active', !isLocal);
  localTab.setAttribute('aria-selected', isLocal ? 'true' : 'false');
  syncTab.setAttribute('aria-selected', isLocal ? 'false' : 'true');
  localTab.tabIndex = isLocal ? 0 : -1;
  syncTab.tabIndex = isLocal ? -1 : 0;
}

function updateAreaChrome() {
  const label = getAreaLabel(activeArea);
  getRequiredElement('snippets-title').textContent = `${label} snippets`;
  getRequiredElement('storage-label').textContent = `${label} storage`;
  getRequiredElement('clear-all').textContent = `Clear ${label.toLowerCase()}`;
  getRequiredElement('search-input').placeholder = 'Search all snippets...';
}

async function setActiveArea(area) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  activeArea = area;
  searchToken += 1;
  updateTabCounts();
  updateTabState();
  updateAreaChrome();
  if (isAddPanelOpen()) {
    setAddTargetArea(area);
  }
  await updateDisplay();
}

async function updateStorageInfo(area) {
  if (!chrome.storage || !chrome.storage[area]) {
    throw new Error(`chrome.storage.${area} is not available.`);
  }
  if (typeof chrome.storage[area].QUOTA_BYTES !== 'number') {
    throw new Error(`chrome.storage.${area}.QUOTA_BYTES is not available.`);
  }
  const quotaBytes = chrome.storage[area].QUOTA_BYTES;
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) {
    throw new Error('Storage quota is invalid.');
  }
  const bytesUsed = await getBytesInUse(area, null);
  if (!Number.isFinite(bytesUsed) || bytesUsed < 0) {
    throw new Error('Storage usage is invalid.');
  }
  const usedKBValue = bytesUsed / 1024;
  const limitKBValue = quotaBytes / 1024;
  getRequiredElement('storage-used').textContent = usedKBValue.toFixed(2);
  getRequiredElement('storage-limit').textContent = limitKBValue.toFixed(2);
  const bar = getRequiredElement('storage-bar');
  bar.max = limitKBValue;
  bar.value = Math.min(usedKBValue, limitKBValue);
}

function isAddPanelOpen() {
  const panel = getRequiredElement('add-panel');
  return !panel.hidden;
}

function toggleAddPanel() {
  if (isAddPanelOpen()) {
    closeAddPanel();
    return;
  }
  openAddPanel();
}

function openAddPanel() {
  const panel = getRequiredElement('add-panel');
  panel.hidden = false;
  setAddTargetArea(activeArea);
  const input = getRequiredElement('add-input');
  input.focus();
}

function closeAddPanel() {
  const panel = getRequiredElement('add-panel');
  panel.hidden = true;
  const input = getRequiredElement('add-input');
  input.value = '';
  setStatus('', 'idle');
}

function setAddTargetArea(area) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  addTargetArea = area;
  const label = getAreaLabel(area);
  getRequiredElement('add-target-label').textContent = `Saving to ${label}`;
  const localToggle = getRequiredElement('add-area-local');
  const syncToggle = getRequiredElement('add-area-sync');
  const isLocal = area === 'local';
  localToggle.classList.toggle('active', isLocal);
  syncToggle.classList.toggle('active', !isLocal);
}

async function handleAddSnippet() {
  try {
    const input = getRequiredElement('add-input');
    const text = input.value.trim();
    if (text.length === 0) {
      throw new Error('Snippet text is required.');
    }
    const area = addTargetArea;
    if (!STORAGE_LABELS[area]) {
      throw new Error(`Unsupported storage area: ${area}`);
    }
    const snippet = {
      id: generateSnippetId(),
      text,
      url: 'manual',
      date: new Date().toISOString()
    };
    const list = snippetsByArea[area];
    if (!Array.isArray(list)) {
      throw new Error('Snippets storage must be an array.');
    }
    list.push(snippet);
    await saveSnippetsForArea(area, list);
    closeAddPanel();
    await setActiveArea(area);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add snippet.';
    setStatus(message, 'error');
    throw error;
  }
}

function displaySnippets(items) {
  const list = getRequiredElement('snippets-list');
  list.replaceChildren();
  if (items.length === 0) {
    const areaLabel = getAreaLabel(activeArea).toLowerCase();
    renderEmptyState(`No ${areaLabel} snippets yet. Save a selection to start building your vault.`);
    return;
  }
  items.forEach((item, displayIndex) => {
    const { snippet, area } = item;
    if (!STORAGE_LABELS[area]) {
      throw new Error(`Unsupported storage area: ${area}`);
    }
    const areaLabel = getAreaLabel(area);
    const targetArea = area === 'local' ? 'sync' : 'local';
    const moveLabel = area === 'local' ? 'Move to Synced' : 'Move to Local';
    const div = document.createElement('div');
    div.className = 'snippet';
    div.style.setProperty('--delay', `${displayIndex * 45}ms`);

    const meta = document.createElement('div');
    meta.className = 'snippet-meta';
    const badge = document.createElement('span');
    badge.className = `snippet-badge snippet-badge--${area}`;
    badge.textContent = areaLabel;
    meta.appendChild(badge);

    const text = document.createElement('div');
    text.className = 'snippet-text';
    text.textContent = snippet.text;

    const actions = document.createElement('div');
    actions.className = 'snippet-actions';
    const copyButton = createActionButton('Copy', 'btn btn-primary');
    const moveButton = createActionButton(moveLabel, 'btn btn-move');
    const deleteButton = createActionButton('Delete', 'btn btn-danger');
    actions.append(copyButton, moveButton, deleteButton);

    div.append(meta, text, actions);
    list.appendChild(div);
    copyButton.addEventListener('click', () => {
      void copySnippet(area, snippet.id);
    });
    moveButton.addEventListener('click', () => {
      void moveSnippet(area, snippet.id, targetArea);
    });
    deleteButton.addEventListener('click', () => {
      void deleteSnippet(area, snippet.id);
    });
  });
}

function createActionButton(label, className) {
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new Error('Button label is required.');
  }
  if (typeof className !== 'string' || className.trim().length === 0) {
    throw new Error('Button className is required.');
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  return button;
}

function renderEmptyState(message) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Empty state message is required.');
  }
  const list = getRequiredElement('snippets-list');
  list.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = message;
  list.appendChild(empty);
}

async function filterSnippets() {
  const query = getRequiredElement('search-input').value.trim();
  if (query.length === 0) {
    setStatus('', 'idle');
    const activeSnippets = getSortedSnippets(activeArea);
    getRequiredElement('snippets-title').textContent = `${getAreaLabel(activeArea)} snippets`;
    displaySnippets(activeSnippets.map((snippet) => ({ snippet, area: activeArea })));
    return;
  }

  const requestId = ++searchToken;
  setStatus('Searching...', 'loading');

  try {
    const ranked = searchSnippets(query);
    if (requestId !== searchToken) {
      return;
    }
    setStatus('', 'idle');
    getRequiredElement('snippets-title').textContent = 'Search results';
    if (ranked.length === 0) {
      renderEmptyState('No matches in local or synced snippets.');
      return;
    }
    displaySnippets(ranked);
  } catch (error) {
    if (requestId !== searchToken) {
      return;
    }
    const message = error instanceof Error ? error.message : 'Search failed.';
    setStatus(message, 'error');
    console.error(error);
    throw error;
  }
}

function searchSnippets(query) {
  const allSnippets = getAllSnippetItems();
  if (allSnippets.length === 0) {
    return [];
  }
  const normalizedQuery = normalizeQuery(query);
  const fuse = createFuseIndex(allSnippets);
  const results = fuse.search(normalizedQuery);
  const scored = results.map((result) => {
    if (!result || !result.item || !result.item.snippet) {
      throw new Error('Search results are missing snippet data.');
    }
    if (typeof result.score !== 'number' || !Number.isFinite(result.score)) {
      throw new Error('Search results are missing scores.');
    }
    return { snippet: result.item.snippet, area: result.item.area, score: result.score };
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return getSnippetTimestamp(b.snippet) - getSnippetTimestamp(a.snippet);
  });
  return scored.map((item) => ({ snippet: item.snippet, area: item.area }));
}

function normalizeQuery(query) {
  if (typeof query !== 'string') {
    throw new Error('Search query must be a string.');
  }
  const normalized = query.trim();
  if (normalized.length === 0) {
    throw new Error('Search query is required.');
  }
  return normalized;
}

function createFuseIndex(items) {
  if (!Array.isArray(items)) {
    throw new Error('Search index requires snippet items.');
  }
  const FuseCtor = getFuse();
  const options = {
    includeScore: true,
    shouldSort: true,
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 1,
    keys: [
      { name: 'snippet.text', weight: 1 }
    ]
  };
  return new FuseCtor(items, options);
}

function getFuse() {
  if (!window || typeof window.Fuse !== 'function') {
    throw new Error('Fuse.js is required for search.');
  }
  return window.Fuse;
}

function getSnippetIndex(area, id) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Snippet ID is required.');
  }
  const list = snippetsByArea[area];
  if (!Array.isArray(list)) {
    throw new Error('Snippets storage must be an array.');
  }
  const index = list.findIndex((snippet) => snippet && snippet.id === id);
  if (index === -1) {
    throw new Error('Snippet not found.');
  }
  return index;
}

function copySnippet(area, id) {
  const index = getSnippetIndex(area, id);
  const snippet = snippetsByArea[area][index];
  if (!snippet || typeof snippet.text !== 'string') {
    throw new Error('Snippet text is missing.');
  }
  const textArea = document.createElement('textarea');
  textArea.value = snippet.text;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
  alert('Snippet copied!');
}

async function deleteSnippet(area, id) {
  const index = getSnippetIndex(area, id);
  const list = snippetsByArea[area];
  list.splice(index, 1);
  await saveSnippetsForArea(area, list);
  await updateDisplay();
}

async function clearAllSnippets() {
  const label = getAreaLabel(activeArea).toLowerCase();
  if (!confirm(`Are you sure you want to delete all ${label} snippets?`)) {
    return;
  }
  snippetsByArea[activeArea] = [];
  await saveSnippetsForArea(activeArea, []);
  await updateDisplay();
}

async function updateDisplay() {
  updateTabCounts();
  updateTabState();
  updateAreaChrome();
  await updateStorageInfo(activeArea);
  const activeSnippets = getSortedSnippets(activeArea);
  displaySnippets(activeSnippets.map((snippet) => ({ snippet, area: activeArea })));
  getRequiredElement('search-input').value = '';
  setStatus('', 'idle');
}

async function moveSnippet(area, id, targetArea) {
  if (!STORAGE_LABELS[area]) {
    throw new Error(`Unsupported storage area: ${area}`);
  }
  if (!STORAGE_LABELS[targetArea]) {
    throw new Error(`Unsupported storage area: ${targetArea}`);
  }
  if (targetArea === area) {
    throw new Error('Target storage area must be different.');
  }
  const sourceSnippets = snippetsByArea[area];
  if (!Array.isArray(sourceSnippets)) {
    throw new Error('Source snippets are invalid.');
  }
  const index = getSnippetIndex(area, id);
  const snippet = sourceSnippets[index];
  const destinationSnippets = snippetsByArea[targetArea];
  if (!Array.isArray(destinationSnippets)) {
    throw new Error('Destination snippets are invalid.');
  }
  if (destinationSnippets.some((item) => item && item.id === snippet.id)) {
    throw new Error('Snippet already exists in target storage.');
  }
  sourceSnippets.splice(index, 1);
  destinationSnippets.push(snippet);
  await saveSnippetsForArea(area, sourceSnippets);
  await saveSnippetsForArea(targetArea, destinationSnippets);
  updateTabCounts();
  await updateDisplay();
}

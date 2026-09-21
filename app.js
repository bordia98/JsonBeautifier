/**
 * JSON Beautifier — app.js
 * All logic: parsing, formatting, syntax highlighting, UI interactions
 */

// ─── DOM refs ────────────────────────────────────────────────────────────────
const jsonInput       = document.getElementById('json-input');
const jsonOutput      = document.getElementById('json-output');
const outputPlaceholder = document.getElementById('output-placeholder');
const errorBar        = document.getElementById('error-bar');
const errorText       = document.getElementById('error-text');
const statusBadge     = document.getElementById('status-badge');
const inputMeta       = document.getElementById('input-meta');
const outputMeta      = document.getElementById('output-meta');
const statsRow        = document.getElementById('stats-row');
const toast           = document.getElementById('toast');
const indentSelect    = document.getElementById('indent-select');

const btnBeautify  = document.getElementById('btn-beautify');
const btnMinify    = document.getElementById('btn-minify');
const btnClear     = document.getElementById('btn-clear');
const btnSample    = document.getElementById('btn-sample');
const btnCopy      = document.getElementById('btn-copy');
const btnPaste     = document.getElementById('btn-paste');
const btnDownload  = document.getElementById('btn-download');
const btnSwap      = document.getElementById('btn-swap');
const btnEscape    = document.getElementById('btn-escape');
const btnUnescape  = document.getElementById('btn-unescape');
const btnTheme     = document.getElementById('btn-theme');

// ─── State ───────────────────────────────────────────────────────────────────
let lastParsed = null;
let toastTimer = null;
let isDark = false; // tracks current theme

// ─── Theme ───────────────────────────────────────────────────────────────────
function applyTheme(dark) {
  isDark = dark;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  localStorage.setItem('jb-theme', dark ? 'dark' : 'light');
}

// Restore saved theme — default is light
(function initTheme() {
  const saved = localStorage.getItem('jb-theme');
  applyTheme(saved ? saved === 'dark' : false);
})();

// ─── Sample JSON ─────────────────────────────────────────────────────────────
const SAMPLE_JSON = {
  "project": "JSON Beautifier",
  "version": "1.0.0",
  "author": {
    "name": "Antigravity",
    "email": "hello@example.com",
    "active": true
  },
  "features": ["syntax highlighting", "minify", "copy", "download", "stats"],
  "config": {
    "darkMode": true,
    "indentSize": 2,
    "maxDepth": null
  },
  "stats": {
    "stars": 42,
    "forks": 7,
    "issues": 0
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getIndent() {
  const v = indentSelect.value;
  if (v === 'tab') return '\t';
  return parseInt(v, 10);
}

function formatSize(str) {
  const bytes = new TextEncoder().encode(str).length;
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function countKeys(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return 0;
  if (seen.has(obj)) return 0;
  seen.add(obj);
  const keys = Object.keys(obj);
  return keys.reduce((n, k) => n + 1 + countKeys(obj[k], seen), 0);
}

function maxDepth(obj, depth = 0) {
  if (obj === null || typeof obj !== 'object') return depth;
  const children = Array.isArray(obj) ? obj : Object.values(obj);
  if (children.length === 0) return depth;
  return Math.max(...children.map(c => maxDepth(c, depth + 1)));
}

function rootType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'Array';
  return typeof v === 'object' ? 'Object' : typeof v;
}

// ─── Syntax Highlighting ─────────────────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function syntaxHighlight(json) {
  // Tokenise using a regex
  const re = /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|[{}\[\],:])/g;
  return escapeHtml(json).replace(
    // Run on the escaped string — we need to re-run the regex on the un-escaped version
    // so we work on the raw string and escape later
    // Actually, let's do it properly below
    re, ''  // placeholder — overridden below
  );
}

// Correct approach: run regex on raw then wrap tokens
function highlight(json) {
  const re = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[{}[\],:])/g;
  let result = '';
  let lastIndex = 0;

  for (const match of json.matchAll(re)) {
    // Escaped text before this match
    if (match.index > lastIndex) {
      result += escapeHtml(json.slice(lastIndex, match.index));
    }

    const token = match[0];
    let cls;

    if (/^"/.test(token)) {
      cls = token.endsWith(':') ? 'tok-key' : 'tok-string';
    } else if (token === 'true' || token === 'false') {
      cls = 'tok-bool';
    } else if (token === 'null') {
      cls = 'tok-null';
    } else if (/^[{}\[\]]$/.test(token)) {
      cls = 'tok-punct';
    } else if (token === ',' || token === ':') {
      cls = 'tok-punct';
    } else {
      cls = 'tok-number';
    }

    result += `<span class="${cls}">${escapeHtml(token)}</span>`;
    lastIndex = match.index + token.length;
  }

  // Trailing text
  if (lastIndex < json.length) {
    result += escapeHtml(json.slice(lastIndex));
  }

  return result;
}

// ─── Core operations ─────────────────────────────────────────────────────────
function showOutput(rawJson, parsed) {
  lastParsed = parsed;
  const highlighted = highlight(rawJson);
  jsonOutput.innerHTML = highlighted;
  jsonOutput.classList.add('visible');
  outputPlaceholder.classList.add('hidden');

  // Footer meta
  outputMeta.textContent = formatSize(rawJson);

  // Stats
  document.getElementById('stat-keys-value').textContent   = countKeys(parsed);
  document.getElementById('stat-depth-value').textContent  = maxDepth(parsed);
  document.getElementById('stat-size-value').textContent   = formatSize(rawJson);
  document.getElementById('stat-type-value').textContent   = rootType(parsed);
  statsRow.hidden = false;
}

function clearOutput() {
  lastParsed = null;
  jsonOutput.innerHTML = '';
  jsonOutput.classList.remove('visible');
  outputPlaceholder.classList.remove('hidden');
  outputMeta.textContent = '';
  statsRow.hidden = true;
}

function setStatus(state) {
  statusBadge.className = 'badge';
  if (state === 'valid') {
    statusBadge.classList.add('badge--success');
    statusBadge.textContent = '✓ Valid JSON';
  } else if (state === 'error') {
    statusBadge.classList.add('badge--error');
    statusBadge.textContent = '✕ Invalid';
  } else {
    statusBadge.textContent = 'Ready';
  }
}

function showError(msg) {
  errorText.textContent = msg;
  errorBar.hidden = false;
  setStatus('error');
}

function hideError() {
  errorBar.hidden = true;
}

function beautify() {
  const raw = jsonInput.value.trim();
  if (!raw) {
    clearOutput();
    hideError();
    setStatus('ready');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    showError(e.message);
    clearOutput();
    return;
  }

  hideError();
  setStatus('valid');
  const indent = getIndent();
  const formatted = JSON.stringify(parsed, null, indent);
  showOutput(formatted, parsed);
}

function minify() {
  const raw = jsonInput.value.trim();
  if (!raw) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    showError(e.message);
    clearOutput();
    return;
  }

  hideError();
  setStatus('valid');
  const minified = JSON.stringify(parsed);
  showOutput(minified, parsed);
}

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg, duration = 2200) {
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), duration);
}

// ─── Input meta ──────────────────────────────────────────────────────────────
function updateInputMeta() {
  const len = jsonInput.value.length;
  inputMeta.textContent = len === 0 ? '0 characters' : `${len.toLocaleString()} characters`;
}

// ─── Event listeners ─────────────────────────────────────────────────────────
btnBeautify.addEventListener('click', beautify);
btnMinify.addEventListener('click', minify);

btnClear.addEventListener('click', () => {
  jsonInput.value = '';
  clearOutput();
  hideError();
  setStatus('ready');
  updateInputMeta();
  jsonInput.focus();
});

btnSample.addEventListener('click', () => {
  jsonInput.value = JSON.stringify(SAMPLE_JSON, null, 2);
  updateInputMeta();
  beautify();
  showToast('Sample JSON loaded');
});

btnCopy.addEventListener('click', async () => {
  if (!jsonOutput.textContent.trim()) {
    showToast('Nothing to copy yet');
    return;
  }
  try {
    await navigator.clipboard.writeText(jsonOutput.textContent);
    showToast('✓ Copied to clipboard!');
  } catch {
    showToast('Copy failed — try manually');
  }
});

btnPaste.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      jsonInput.value = text;
      updateInputMeta();
      beautify();
    }
  } catch {
    showToast('Clipboard access denied');
    jsonInput.focus();
  }
});

btnDownload.addEventListener('click', () => {
  if (!jsonOutput.textContent.trim()) {
    showToast('Nothing to download yet');
    return;
  }
  const blob = new Blob([jsonOutput.textContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'beautified.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Downloaded!');
});

btnSwap.addEventListener('click', () => {
  if (!jsonOutput.textContent.trim()) return;
  jsonInput.value = jsonOutput.textContent;
  updateInputMeta();
  beautify();
  showToast('Swapped input ↔ output');
});

// ─── Theme toggle ─────────────────────────────────────────────────────────────
btnTheme.addEventListener('click', () => {
  applyTheme(!isDark);
  showToast(isDark ? '🌙 Dark mode' : '☀️ Light mode');
});

// ─── Escape ──────────────────────────────────────────────────────────────────
btnEscape.addEventListener('click', () => {
  const raw = jsonInput.value;
  if (!raw) { showToast('Nothing to escape'); return; }
  // Wrap the raw text as a JSON string value (escape special chars)
  const escaped = JSON.stringify(raw);
  jsonInput.value = escaped;
  updateInputMeta();
  // Show in output with highlighting
  hideError();
  setStatus('valid');
  showOutput(escaped, raw);
  showToast('✓ Escaped as JSON string');
});

// ─── Unescape ────────────────────────────────────────────────────────────────
btnUnescape.addEventListener('click', () => {
  const raw = jsonInput.value.trim();
  if (!raw) { showToast('Nothing to unescape'); return; }

  // Accept with or without wrapping quotes
  const toparse = (raw.startsWith('"') && raw.endsWith('"')) ? raw : `"${raw}"`;
  let unescaped;
  try {
    unescaped = JSON.parse(toparse);
  } catch (e) {
    showError('Cannot unescape: ' + e.message);
    clearOutput();
    return;
  }
  jsonInput.value = unescaped;
  updateInputMeta();
  // Try to parse the unescaped result as JSON for highlighting
  hideError();
  try {
    const parsed = JSON.parse(unescaped);
    setStatus('valid');
    const formatted = JSON.stringify(parsed, null, getIndent());
    showOutput(formatted, parsed);
  } catch {
    // Not valid JSON, show as plain text
    setStatus('ready');
    clearOutput();
  }
  showToast('✓ Unescaped string');
});

// Auto-beautify on input with debounce
let debounceTimer;
jsonInput.addEventListener('input', () => {
  updateInputMeta();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (jsonInput.value.trim()) beautify();
    else {
      clearOutput();
      hideError();
      setStatus('ready');
    }
  }, 350);
});

// Keyboard shortcut: Ctrl/Cmd + Enter to beautify
jsonInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    beautify();
  }
  // Tab key support
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = jsonInput.selectionStart;
    const end = jsonInput.selectionEnd;
    jsonInput.value = jsonInput.value.slice(0, start) + '  ' + jsonInput.value.slice(end);
    jsonInput.selectionStart = jsonInput.selectionEnd = start + 2;
  }
});

// Drag & drop JSON files
jsonInput.addEventListener('dragover', (e) => {
  e.preventDefault();
  jsonInput.style.background = 'rgba(124,58,237,0.08)';
});
jsonInput.addEventListener('dragleave', () => {
  jsonInput.style.background = '';
});
jsonInput.addEventListener('drop', (e) => {
  e.preventDefault();
  jsonInput.style.background = '';
  const file = e.dataTransfer.files[0];
  if (!file) return;
  if (!file.name.endsWith('.json') && file.type !== 'application/json') {
    showToast('Please drop a .json file');
    return;
  }
  const reader = new FileReader();
  reader.onload = (evt) => {
    jsonInput.value = evt.target.result;
    updateInputMeta();
    beautify();
    showToast(`✓ Loaded: ${file.name}`);
  };
  reader.readAsText(file);
});

// ─── Init ─────────────────────────────────────────────────────────────────────
updateInputMeta();

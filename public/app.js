// The Grid: frontend (phase 1)
// Plain JavaScript, no framework. Everything the app does on the page lives here.

const $ = (sel) => document.querySelector(sel);

const state = {
  items: [],
  tags: [],
  total: 0,
  q: '',
  tag: '',
  selectedId: null,
};

// ---------- small helpers ----------

// Builds an element. Text always goes in as textContent, so nothing is ever run as HTML.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, options);
  if (res.status === 401 || res.status === 403) {
    location.reload(); // signed out: let Access show the login page
    throw new Error('Signed out');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setStatus(text) { $('#status').textContent = text; }

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).toUpperCase();
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// ---------- loading ----------

async function loadItems() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.tag) params.set('tag', state.tag);
  setStatus('LOADING');
  state.items = await api(`/api/items?${params}`);
  renderGrid();
  renderFilters();
}

async function loadTags() {
  const data = await api('/api/tags');
  state.tags = data.tags;
  state.total = data.total;
  renderTags();
}

async function refresh() {
  await Promise.all([loadItems(), loadTags()]);
}

// ---------- rendering ----------

function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren();
  for (const item of state.items) {
    const img = el('img', {
      src: item.url,
      alt: item.filename,
      loading: 'lazy',
      decoding: 'async',
      width: item.width || undefined,
      height: item.height || undefined,
    });
    const caption = el('span', { class: 'cap' },
      el('span', { text: item.tags[0] || 'untagged' }),
      el('span', { text: hostOf(item.source_url) || shortDate(item.created_at) }),
    );
    const card = el('button', {
      class: 'card' + (item.id === state.selectedId ? ' sel' : ''),
      'data-id': item.id,
      'aria-label': `Open ${item.filename}`,
      onclick: () => select(item.id),
    }, img, caption);
    grid.append(card);
  }
  const filtered = state.q || state.tag;
  $('#empty').hidden = state.items.length > 0;
  $('#empty').querySelector('p:last-child').textContent = filtered
    ? 'No matches. Try fewer words or clear the filter.'
    : 'Drop some images in to start your library.';
  setStatus(`${state.items.length} ITEM${state.items.length === 1 ? '' : 'S'} · NEWEST FIRST`);
}

function renderTags() {
  $('#totalCount').textContent = state.total.toLocaleString();
  $('#allLink').classList.toggle('on', !state.tag);
  const list = $('#tagList');
  list.replaceChildren();
  if (!state.tags.length) {
    list.append(el('p', { class: 'empty-note', text: 'Tags you add show up here.' }));
    return;
  }
  for (const t of state.tags) {
    list.append(el('button', {
      class: 'side-link' + (t.name === state.tag ? ' on' : ''),
      onclick: () => setTag(t.name === state.tag ? '' : t.name),
    }, el('span', { text: t.name }), el('span', { class: 'mono count', text: t.count })));
  }
}

function renderFilters() {
  const box = $('#activeFilters');
  box.replaceChildren();
  if (state.tag) {
    box.append(el('button', { class: 'chip on', onclick: () => setTag(''), 'aria-label': `Remove filter ${state.tag}` }, `${state.tag} ×`));
  }
  if (state.q) {
    box.append(el('button', { class: 'chip', onclick: clearSearch, 'aria-label': 'Clear search' }, `"${state.q}" ×`));
  }
  if (!state.tag && !state.q) {
    box.append(el('span', { class: 'mono', style: 'color:#999', text: 'NONE' }));
  }
}

// ---------- filters ----------

function setTag(name) {
  state.tag = name;
  loadItems();
  renderTags();
}

function clearSearch() {
  state.q = '';
  $('#search').value = '';
  loadItems();
}

$('#search').addEventListener('input', debounce((e) => {
  state.q = e.target.value.trim();
  loadItems();
}, 250));

$('#allLink').addEventListener('click', () => setTag(''));

// ---------- detail panel ----------

function select(id) {
  state.selectedId = id;
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
  renderPanel();
}

function closePanel() {
  state.selectedId = null;
  $('#panel').hidden = true;
  document.querySelectorAll('.card.sel').forEach((c) => c.classList.remove('sel'));
}

function currentItem() {
  return state.items.find((i) => i.id === state.selectedId);
}

async function save(changes) {
  const item = currentItem();
  if (!item) return;
  const flag = $('#savedFlag');
  if (flag) flag.textContent = 'SAVING';
  try {
    const updated = await api(`/api/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    Object.assign(item, updated);
    if (flag) flag.textContent = 'SAVED';
    if ('tags' in changes) {
      renderPanel();
      renderGrid();
      loadTags();
    }
  } catch (e) {
    if (flag) flag.textContent = `NOT SAVED: ${e.message}`.toUpperCase();
  }
}

function renderPanel() {
  const item = currentItem();
  const panel = $('#panel');
  if (!item) { panel.hidden = true; return; }

  const tagInput = el('input', {
    type: 'text',
    placeholder: 'Add a tag, press Enter',
    'aria-label': 'Add a tag',
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const names = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
        if (names.length) save({ tags: [...item.tags, ...names] });
      }
      if (e.key === 'Backspace' && !e.target.value && item.tags.length) {
        save({ tags: item.tags.slice(0, -1) });
      }
    },
  });

  const tagChips = item.tags.map((t) =>
    el('span', { class: 'tag' }, t,
      el('button', { 'aria-label': `Remove tag ${t}`, onclick: () => save({ tags: item.tags.filter((x) => x !== t) }) }, '×'))
  );

  const source = item.source_url;
  const meta = el('div', { class: 'meta' },
    `SAVED ${shortDate(item.created_at)}`,
    item.width ? ` · ${item.width}×${item.height}` : '',
    source ? ' · ' : '',
    source ? el('a', { href: source, target: '_blank', rel: 'noopener noreferrer', text: hostOf(source) || 'SOURCE' }) : '',
  );

  panel.replaceChildren(el('div', { class: 'panel-wrap' },
    el('button', { class: 'close', 'aria-label': 'Close', onclick: closePanel }, '×'),
    el('img', { class: 'preview', src: item.url, alt: item.filename }),
    el('div', { class: 'inner' },
      el('div', { class: 'row' },
        el('input', {
          class: 'name', type: 'text', value: item.filename, 'aria-label': 'Filename',
          onchange: (e) => save({ filename: e.target.value }),
        }),
        meta,
      ),
      el('div', { class: 'row' },
        el('div', { class: 'label mono', text: 'TAGS' }),
        tagChips.length ? el('div', { class: 'tags' }, tagChips) : '',
        tagInput,
      ),
      el('div', { class: 'row' },
        el('label', { class: 'label mono', for: 'note', text: 'NOTE' }),
        el('textarea', {
          id: 'note', placeholder: 'Why you saved it, where it could go',
          onchange: (e) => save({ note: e.target.value }),
        }, item.note),
      ),
      el('div', { class: 'row' },
        el('label', { class: 'label mono', for: 'source', text: 'SOURCE LINK' }),
        el('input', {
          id: 'source', type: 'url', value: source, placeholder: 'https://',
          onchange: (e) => save({ source_url: e.target.value }),
        }),
      ),
      el('div', { class: 'saved', id: 'savedFlag' }),
      el('div', { class: 'actions' },
        el('a', { class: 'btn primary', href: item.url, download: item.filename, text: 'DOWNLOAD' }),
        el('a', { class: 'btn', href: item.url, target: '_blank', rel: 'noopener', text: 'OPEN FULL' }),
        el('button', { class: 'btn danger', onclick: () => removeItem(item) }, 'DELETE'),
      ),
    ),
  ));
  panel.hidden = false;
}

async function removeItem(item) {
  if (!confirm(`Delete ${item.filename}? This can't be undone.`)) return;
  try {
    await api(`/api/items/${item.id}`, { method: 'DELETE' });
    closePanel();
    await refresh();
  } catch (e) {
    alert(`Could not delete: ${e.message}`);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.selectedId) closePanel();
});

// ---------- uploads ----------

async function imageSize(file) {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: '', height: '' };
  }
}

// For 2+ images: ask once for tags, a note and a source that apply to the whole batch.
// Resolves to { tags, note, source }, or null if cancelled.
function askBatchDetails(files, sourceUrl) {
  return new Promise((resolve) => {
    const sheet = $('#batchSheet');
    const thumbs = $('#batchThumbs');
    const urls = [];
    thumbs.replaceChildren();
    for (const file of files.slice(0, 12)) {
      const url = URL.createObjectURL(file);
      urls.push(url);
      thumbs.append(el('img', { src: url, alt: '' }));
    }
    if (files.length > 12) thumbs.append(el('div', { class: 'more', text: `+${files.length - 12}` }));

    $('#batchTitle').textContent = `ADDING ${files.length} IMAGES`;
    $('#batchAdd').textContent = `ADD ${files.length} IMAGES`;
    $('#batchTags').value = state.tag || '';
    $('#batchNote').value = '';
    $('#batchSource').value = sourceUrl;

    sheet.addEventListener('close', () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (sheet.returnValue !== 'add') return resolve(null);
      resolve({
        tags: $('#batchTags').value,
        note: $('#batchNote').value.trim(),
        source: $('#batchSource').value.trim(),
      });
    }, { once: true });

    sheet.returnValue = '';
    sheet.showModal();
    $('#batchTags').focus();
  });
}

async function uploadFiles(fileList, sourceUrl = '') {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;

  let details = { tags: '', note: '', source: sourceUrl };
  if (files.length > 1) {
    details = await askBatchDetails(files, sourceUrl);
    if (!details) return; // cancelled
  }

  let done = 0;
  let lastId = null;
  const failed = [];
  for (const file of files) {
    setStatus(`UPLOADING ${done + 1}/${files.length}`);
    const { width, height } = await imageSize(file);
    const form = new FormData();
    form.append('file', file);
    form.append('width', width);
    form.append('height', height);
    if (details.source) form.append('source_url', details.source);
    if (details.tags) form.append('tags', details.tags);
    if (details.note) form.append('note', details.note);
    try {
      const item = await api('/api/items', { method: 'POST', body: form });
      lastId = item.id;
      done++;
    } catch (e) {
      failed.push(`${file.name}: ${e.message}`);
    }
  }
  await refresh();
  // A single image opens straight away so you can tag it.
  if (files.length === 1 && lastId) select(lastId);
  if (failed.length) alert(`Some images did not upload:\n\n${failed.join('\n')}`);
}

$('#uploadBtn').addEventListener('click', () => $('#fileInput').click());
$('#fileInput').addEventListener('change', (e) => {
  uploadFiles(e.target.files);
  e.target.value = '';
});

// Drag and drop anywhere on the page.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  $('#dropzone').hidden = false;
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#dropzone').hidden = true;
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('#dropzone').hidden = true;
  // When dragging an image from another site, the browser also hands over its page link.
  const link = e.dataTransfer.getData('text/uri-list').split('\n').find((l) => l.startsWith('http')) || '';
  uploadFiles(e.dataTransfer.files, link);
});

// Paste a screenshot with Cmd+V (skipped while typing in a field).
window.addEventListener('paste', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) {
    e.preventDefault();
    uploadFiles(files);
  }
});

// ---------- start ----------

refresh().catch((e) => setStatus(`ERROR: ${e.message}`.toUpperCase()));

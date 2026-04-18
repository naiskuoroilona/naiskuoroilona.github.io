const state = {
  currentSlug: null,
  editor: null,
  dirty: false,
};

const $ = (id) => document.getElementById(id);

async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function loadPageList() {
  const pages = await api('GET', '/admin/api/pages');
  const ul = $('page-list');
  ul.innerHTML = '';
  pages.forEach(p => {
    const li = document.createElement('li');
    li.dataset.slug = p.slug;
    li.innerHTML = `<strong>${escapeHtml(p.title)}</strong><span class="slug">${escapeHtml(p.slug)}</span>`;
    li.addEventListener('click', () => selectPage(p.slug));
    ul.appendChild(li);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
  }[c]));
}

function setActive(slug) {
  document.querySelectorAll('#page-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.slug === slug);
  });
}

function setStatus(msg, kind) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 3000);
}

function openModal(title, bodyHtml) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3></h3>
        <button class="modal-close" aria-label="Sulje">&times;</button>
      </div>
      <div class="modal-body"></div>
    </div>
  `;
  backdrop.querySelector('h3').textContent = title;
  backdrop.querySelector('.modal-body').innerHTML = bodyHtml;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.classList.contains('modal-close')) closeModal();
  });
  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onEscClose);
}

function closeModal() {
  const el = $('modal-backdrop');
  if (el) el.remove();
  document.removeEventListener('keydown', onEscClose);
}

function onEscClose(e) { if (e.key === 'Escape') closeModal(); }

function toast(msg, kind) {
  let host = $('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    t.addEventListener('transitionend', () => t.remove(), { once: true });
  }, 2800);
}

async function selectPage(slug) {
  if (state.dirty && !confirm('Sinulla on tallentamattomia muutoksia. Jatketaanko?')) return;

  const data = await api('GET', `/admin/api/page/${slug}`);
  state.currentSlug = slug;
  state.dirty = false;

  $('empty-state').hidden = true;
  $('editor-form').hidden = false;
  $('history-panel').hidden = true;

  $('title-input').value = data.title || '';
  $('slug-hint').textContent = slug;
  $('note-input').value = '';

  if (!state.editor) {
    await initEditor();
  }
  state.editor.setContent(data.content || '');
  state.dirty = false;
  setStatus('', '');
  setActive(slug);
}

function initEditor() {
  return new Promise((resolve) => {
    tinymce.init({
      selector: '#editor',
      height: 'calc(100vh - 260px)',
      min_height: 500,
      menubar: false,
      license_key: 'gpl',
      base_url: '/admin/tinymce',
      suffix: '.min',
      language: 'fi',
      language_url: '/admin/tinymce-langs/fi.js',
      plugins: 'lists link image media table code autolink',
      toolbar:
        'undo redo | blocks | bold italic underline | alignleft aligncenter alignright | ' +
        'bullist numlist | link image media table | removeformat | code',
      images_upload_url: '/admin/api/upload',
      images_upload_handler: async (blobInfo) => {
        const fd = new FormData();
        fd.append('file', blobInfo.blob(), blobInfo.filename());
        const res = await fetch('/admin/api/upload', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('upload failed');
        const j = await res.json();
        return j.location;
      },
      content_css: '/shared.css',
      content_style: 'html, body { background: #fff; } body { padding: 20px 30px; max-width: 900px; margin: 0 auto; }',
      body_class: 'entry page',
      branding: false,
      promotion: false,
      setup: (ed) => {
        ed.on('init', () => { state.editor = ed; resolve(); });
        ed.on('change keyup', () => { state.dirty = true; });
      },
    });
  });
}

async function save() {
  if (!state.currentSlug) return;
  const title = $('title-input').value.trim();
  const content = state.editor.getContent();
  const note = $('note-input').value.trim();
  if (!title) { toast('Otsikko puuttuu', 'error'); return; }

  $('save-btn').disabled = true;
  try {
    await api('POST', `/admin/api/page/${state.currentSlug}`, { title, content, note });
    state.dirty = false;
    $('note-input').value = '';
    toast('Tallennettu', 'saved');
    await loadPageList();
    setActive(state.currentSlug);
  } catch (e) {
    toast('Virhe: ' + e.message, 'error');
  } finally {
    $('save-btn').disabled = false;
  }
}

async function showHistory() {
  if (!state.currentSlug) return;
  const versions = await api('GET', `/admin/api/page/${state.currentSlug}/versions`);
  const ul = $('version-list');
  ul.innerHTML = '';
  versions.forEach((v, i) => {
    const li = document.createElement('li');
    const when = new Date(v.created_at + 'Z').toLocaleString('fi-FI');
    const who = v.author ? ` · ${escapeHtml(v.author)}` : '';
    const note = v.note ? ` · <span class="version-note">${escapeHtml(v.note)}</span>` : '';
    const current = i === 0 ? ' <strong>(nykyinen)</strong>' : '';
    li.innerHTML = `
      <div>
        <div>#${v.id} — ${escapeHtml(v.title)}${current}</div>
        <div class="version-meta">${when}${who}${note}</div>
      </div>
      <div class="version-actions">
        <button class="btn" data-action="preview" data-id="${v.id}">Esikatsele</button>
        ${i === 0 ? '' : `<button class="btn" data-action="revert" data-id="${v.id}">Palauta</button>`}
      </div>
    `;
    ul.appendChild(li);
  });
  $('history-panel').hidden = false;
}

async function handleHistoryClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'preview') {
    const v = await api('GET', `/admin/api/version/${id}`);
    openModal(`Esikatselu — #${v.id}: ${v.title}`, `<h1>${escapeHtml(v.title)}</h1>${v.content}`);
  } else if (btn.dataset.action === 'revert') {
    if (!confirm('Palautetaanko tähän versioon? Uusi versio luodaan nykyisen sisällön tilalle.')) return;
    await api('POST', `/admin/api/version/${id}/revert`, {});
    toast('Palautettu versioon #' + id, 'saved');
    $('history-panel').hidden = true;
    await selectPage(state.currentSlug);
  }
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

document.addEventListener('DOMContentLoaded', () => {
  loadPageList();
  $('save-btn').addEventListener('click', save);
  $('history-btn').addEventListener('click', showHistory);
  $('close-history').addEventListener('click', () => { $('history-panel').hidden = true; });
  $('version-list').addEventListener('click', handleHistoryClick);
  $('title-input').addEventListener('input', () => { state.dirty = true; });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
  });
});

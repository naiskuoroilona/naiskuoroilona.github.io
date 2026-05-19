const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const auth = require('basic-auth');
const {
  getPage, listPages, saveVersion,
  listVersions, getVersion, revertTo,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'ilona';

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

const PAGE_SLUGS = new Set([
  'index.html', 'konsertit.html', 'kuoronjohtaja.html', 'laulajaksi.html',
  'ohjelmisto.html', 'tilaa-laulua.html', 'yhteystiedot.html',
]);

function renderPage(slug) {
  const p = getPage(slug);
  if (!p) return null;
  return TEMPLATE
    .replace(/\{\{TITLE\}\}/g, escapeHtml(p.title))
    .replace('{{CONTENT}}', p.content || '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Page routes — serve from DB + template
app.get(['/', '/index.html'], (req, res) => {
  const html = renderPage('index.html');
  if (!html) return res.status(500).send('page not seeded');
  res.type('html').send(html);
});

app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const slug = req.path.replace(/^\//, '');
  if (!PAGE_SLUGS.has(slug)) return next();
  const html = renderPage(slug);
  if (!html) return next();
  res.type('html').send(html);
});

// --- Admin ---

function requireAdmin(req, res, next) {
  const creds = auth(req);
  if (!creds || creds.name !== ADMIN_USER || creds.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Ilona admin"');
    return res.status(401).send('Authentication required');
  }
  req.adminUser = creds.name;
  next();
}

app.use('/admin', requireAdmin);

app.use('/admin/tinymce', express.static(path.join(__dirname, 'node_modules/tinymce')));
app.use('/admin/tinymce-langs', express.static(path.join(__dirname, 'node_modules/tinymce-i18n/langs8')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.use('/admin/static', express.static(path.join(__dirname, 'admin')));

// Admin API
app.use('/admin/api', express.json({ limit: '5mb' }));

app.get('/admin/api/pages', (req, res) => {
  res.json(listPages());
});

app.get('/admin/api/page/:slug', (req, res) => {
  const p = getPage(req.params.slug);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

app.post('/admin/api/page/:slug', (req, res) => {
  const { title, content, note } = req.body || {};
  if (typeof title !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: 'title and content required' });
  }
  const id = saveVersion(req.params.slug, title.trim(), content, req.adminUser, note || null);
  res.json({ ok: true, version_id: id });
});

app.get('/admin/api/page/:slug/versions', (req, res) => {
  res.json(listVersions(req.params.slug));
});

app.get('/admin/api/version/:id', (req, res) => {
  const v = getVersion(Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'not found' });
  res.json(v);
});

app.post('/admin/api/version/:id/revert', (req, res) => {
  try {
    const id = revertTo(Number(req.params.id), req.adminUser);
    res.json({ ok: true, new_version_id: id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Image upload
const IMAGES_DIR = path.join(__dirname, 'images');
const uploader = multer({
  storage: multer.diskStorage({
    destination: IMAGES_DIR,
    filename: (req, file, cb) => {
      const safe = file.originalname
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const stamp = Date.now();
      cb(null, `${stamp}-${safe || 'upload'}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('only images allowed'));
  },
});

app.post('/admin/api/upload', uploader.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  res.json({ location: `/images/${req.file.filename}` });
});

// Static assets (images, css, js, nav.js). Keep AFTER admin so auth wins.
app.use(express.static(path.join(__dirname), {
  index: false,
  extensions: [],
}));

app.listen(PORT, HOST, () => {
  console.log(`Naiskuoro Ilona @ http://${HOST}:${PORT}`);
  console.log(`Admin @ http://${HOST}:${PORT}/admin (user: ${ADMIN_USER})`);
});

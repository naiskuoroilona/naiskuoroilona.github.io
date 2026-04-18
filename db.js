const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'ilona.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    current_version_id INTEGER,
    FOREIGN KEY (current_version_id) REFERENCES page_versions(id)
  );

  CREATE TABLE IF NOT EXISTS page_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (slug) REFERENCES pages(slug)
  );

  CREATE INDEX IF NOT EXISTS idx_versions_slug ON page_versions(slug, created_at DESC);
`);

function getPage(slug) {
  return db.prepare(`
    SELECT p.slug, p.title, v.content, v.id AS version_id, v.created_at
    FROM pages p
    LEFT JOIN page_versions v ON v.id = p.current_version_id
    WHERE p.slug = ?
  `).get(slug);
}

function listPages() {
  return db.prepare(`SELECT slug, title FROM pages ORDER BY slug`).all();
}

const insertVersion = db.prepare(`
  INSERT INTO page_versions (slug, title, content, author, note) VALUES (?, ?, ?, ?, ?)
`);
const updatePagePointer = db.prepare(`
  UPDATE pages SET title = ?, current_version_id = ? WHERE slug = ?
`);
const insertPage = db.prepare(`
  INSERT OR IGNORE INTO pages (slug, title) VALUES (?, ?)
`);

const saveVersion = db.transaction((slug, title, content, author, note) => {
  insertPage.run(slug, title);
  const info = insertVersion.run(slug, title, content, author || null, note || null);
  updatePagePointer.run(title, info.lastInsertRowid, slug);
  return info.lastInsertRowid;
});

function listVersions(slug) {
  return db.prepare(`
    SELECT id, title, author, note, created_at
    FROM page_versions WHERE slug = ?
    ORDER BY created_at DESC, id DESC
  `).all(slug);
}

function getVersion(id) {
  return db.prepare(`SELECT * FROM page_versions WHERE id = ?`).get(id);
}

const revertTo = db.transaction((versionId, author) => {
  const v = getVersion(versionId);
  if (!v) throw new Error('version not found');
  return saveVersion(v.slug, v.title, v.content, author, `revert to #${versionId}`);
});

module.exports = { db, getPage, listPages, saveVersion, listVersions, getVersion, revertTo };

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { saveVersion, getPage } = require('../db');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  'index.html',
  'konsertit.html',
  'kuoronjohtaja.html',
  'laulajaksi.html',
  'ohjelmisto.html',
  'tilaa-laulua.html',
  'yhteystiedot.html',
];

let seeded = 0;
let skipped = 0;

for (const file of PAGES) {
  const slug = file;
  if (getPage(slug)?.content) {
    console.log(`skip ${slug} (already seeded)`);
    skipped++;
    continue;
  }

  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const pageTitleEl = doc.querySelector('h1.pagetitle');
  const entryEl = doc.querySelector('.entry.page');

  if (!pageTitleEl || !entryEl) {
    console.warn(`!! ${slug}: missing pagetitle or entry, skipping`);
    continue;
  }

  const title = pageTitleEl.textContent.trim();
  const content = entryEl.innerHTML.trim();

  saveVersion(slug, title, content, 'migration', 'initial seed from static html');
  console.log(`seeded ${slug} — "${title}" (${content.length} chars)`);
  seeded++;
}

console.log(`\ndone. seeded=${seeded} skipped=${skipped}`);

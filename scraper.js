const fs = require('fs/promises');
const path = require('path');
const cheerio = require('cheerio');

const DEFAULT_URL =
  'https://www.georgiaprobaterecords.com/Estates/EstateDetails.aspx?RECID=ODAwNTI2';

// Convert a date like m/d/yyyy (or yyyy-mm-dd) to yyyymmdd.
function formatDate(text) {
  const s = text.trim();
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + m[1].padStart(2, '0') + m[2].padStart(2, '0');
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + m[2] + m[3];
  const d = new Date(s);
  if (isNaN(d)) return null;
  return (
    String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  );
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
}

// Parse the page: for each table row, 1st cell = event, 2nd = date, last = pdf link.
function parseDocuments(html, baseUrl) {
  const $ = cheerio.load(html);
  const docs = [];
  $('table tr').each((_, tr) => {
    const cells = $(tr).children('td');
    if (cells.length < 3) return;
    const href = cells.last().find('a[href]').first().attr('href');
    if (!href) return;
    const date = formatDate(cells.eq(1).text());
    const event = sanitize(cells.eq(0).text());
    if (!date || !event) return;
    docs.push({ url: new URL(href, baseUrl).href, filename: `${date}-${event}.pdf` });
  });
  return docs;
}

// Ensure unique filenames when the same date/event repeats.
function uniquify(docs) {
  const seen = new Map();
  return docs.map((d) => {
    const n = (seen.get(d.filename) || 0) + 1;
    seen.set(d.filename, n);
    if (n === 1) return d;
    return { ...d, filename: d.filename.replace(/\.pdf$/, `-${n}.pdf`) };
  });
}

async function main() {
  const url = process.argv[2] || DEFAULT_URL;
  const outDir = path.resolve(process.argv[3] || 'downloads');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`);
  const docs = uniquify(parseDocuments(await res.text(), url));
  await fs.mkdir(outDir, { recursive: true });
  for (const doc of docs) {
    const r = await fetch(doc.url);
    if (!r.ok) {
      console.error(`Failed ${doc.url}: ${r.status}`);
      continue;
    }
    await fs.writeFile(path.join(outDir, doc.filename), Buffer.from(await r.arrayBuffer()));
    console.log(`Saved ${doc.filename}`);
  }
  console.log(`Done: ${docs.length} document(s) found.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { parseDocuments, formatDate, uniquify };

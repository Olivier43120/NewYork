// Parcourt Step1, Step2... : écrit manifest.json (textes, trajets, GPS, dates, page de garde)
// et génère des miniatures dans thumbs/ (si "sharp" est installé).
import fs from 'fs'; import path from 'path'; import exifr from 'exifr';
let sharp = null; try { sharp = (await import('sharp')).default; } catch { console.warn('sharp absent : pas de miniatures'); }
const root = process.argv[2] || '.';
const nat = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const isImg = f => /\.(jpe?g|png|webp|heic)$/i.test(f);
const base = f => f.replace(/\.[^.]+$/, '').toLowerCase();
// Extrait les lignes "trajet: droit|vol" (ou "vol: oui|non") et renvoie {mode, text}
function parse(raw) {
  let mode = null;
  const kept = raw.split(/\r?\n/).filter(l => {
    const m = l.match(/^\s*(trajet|vol)\s*:\s*(\S+)/i);
    if (!m) return true;
    const v = m[2].toLowerCase();
    if (/^(droit|rectiligne|direct|route|non)/.test(v)) mode = 'straight';
    else if (/^(vol|avion|courbe|oui)/.test(v)) mode = 'flight';
    return false;
  });
  return { mode, text: kept.join('\n').trim() };
}
// Miniature 480 px max, stockée dans thumbs/<même chemin>.jpg (créée une seule fois)
async function mkThumb(rel) {
  if (!sharp) return null;
  const out = rel.replace(/\.[^.]+$/, '.jpg'), dst = path.join(root, 'thumbs', out);
  try {
    if (!fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      await sharp(path.join(root, rel)).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72 }).toFile(dst);
    }
    return 'thumbs/' + out;
  } catch (e) { console.warn('  pas de miniature pour', rel, '-', e.message); return null; }
}
let album = {}; try { album = JSON.parse(fs.readFileSync(path.join(root, 'album.json'), 'utf8')); } catch {}
const cover = fs.readdirSync(root).find(f => /^(cover|couverture|garde)\.(jpe?g|png|webp)$/i.test(f));
if (cover) console.log('Page de garde :', cover);
const dirs = fs.readdirSync(root, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^step\d+/i.test(d.name)).map(d => d.name).sort(nat);
const steps = [];
for (const d of dirs) {
  const files = fs.readdirSync(path.join(root, d)).sort(nat);
  const imgBases = new Set(files.filter(isImg).map(base));
  const txt = files.find(f => /\.txt$/i.test(f) && !imgBases.has(base(f)));
  const sp = parse(txt ? fs.readFileSync(path.join(root, d, txt), 'utf8') : '');
  const lines = sp.text.split('\n');
  const first = lines.findIndex(l => l.trim());
  const name = first >= 0 ? lines[first].trim() : d;
  const desc = first >= 0 ? lines.slice(first + 1).join('\n').trim() : '';
  const photos = [];
  for (const f of files.filter(isImg)) {
    const p = path.join(root, d, f);
    const tf = files.find(t => /\.txt$/i.test(t) && base(t) === base(f));
    const pp = parse(tf ? fs.readFileSync(path.join(root, d, tf), 'utf8') : '');
    const g = await exifr.gps(p).catch(() => null);
    const m = await exifr.parse(p, ['DateTimeOriginal']).catch(() => null);
    photos.push({ src: `${d}/${f}`, thumb: await mkThumb(`${d}/${f}`), text: pp.text, mode: pp.mode,
      lat: g?.latitude ?? null, lng: g?.longitude ?? null,
      date: m?.DateTimeOriginal ? new Date(m.DateTimeOriginal).toISOString() : null });
  }
  steps.push({ id: d, name, desc, mode: sp.mode, photos });
  console.log(d, '-', name, '-', photos.length, 'photos,', photos.filter(p => p.lat != null).length, 'géolocalisées');
}
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({
  title: album.title, author: album.author, subtitle: album.subtitle,
  cover: cover ? { src: cover } : null, steps }, null, 1));

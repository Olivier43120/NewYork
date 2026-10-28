// Parcourt Step1, Step2... et écrit manifest.json (nom, texte, photos, GPS, date)
import fs from 'fs'; import path from 'path'; import exifr from 'exifr';
const root = process.argv[2] || '.';
const nat = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const isImg = f => /\.(jpe?g|png|webp|heic)$/i.test(f);
let album = {}; try { album = JSON.parse(fs.readFileSync(path.join(root, 'album.json'), 'utf8')); } catch {}
const dirs = fs.readdirSync(root, { withFileTypes: true })
  .filter(d => d.isDirectory() && /^step\d+/i.test(d.name)).map(d => d.name).sort(nat);
const steps = [];
for (const d of dirs) {
  const files = fs.readdirSync(path.join(root, d)).sort(nat);
  const txt = files.find(f => /\.txt$/i.test(f));
  const lines = txt ? fs.readFileSync(path.join(root, d, txt), 'utf8').split(/\r?\n/) : [];
  const name = (lines.find(l => l.trim()) || d).trim();
  const desc = lines.slice(lines.findIndex(l => l.trim()) + 1).join('\n').trim();
  const photos = [];
  for (const f of files.filter(isImg)) {
    const p = path.join(root, d, f);
    const g = await exifr.gps(p).catch(() => null);
    const m = await exifr.parse(p, ['DateTimeOriginal']).catch(() => null);
    photos.push({ src: `${d}/${f}`, lat: g?.latitude ?? null, lng: g?.longitude ?? null,
      date: m?.DateTimeOriginal ? new Date(m.DateTimeOriginal).toISOString() : null });
  }
  steps.push({ id: d, name, desc, photos });
  console.log(d, '-', name, '-', photos.length, 'photos', photos.filter(p => p.lat != null).length, 'géolocalisées');
}
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ title: album.title, author: album.author, steps }, null, 1));

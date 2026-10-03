// Renders a Minecraft server folder into map/ so index.html shows it on GitHub Pages.
// Usage: node build-map.mjs <server folder> [--name "Map title"]
// Player positions are never written: only terrain, block names and spawn.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const args = process.argv.slice(2);
const server = args.find(a => !a.startsWith('--'));
const nameArg = args.includes('--name') ? args[args.indexOf('--name') + 1] : null;
if (!server || !fs.existsSync(server)) {
  console.error('Usage: node build-map.mjs <server folder> [--name "Map title"]');
  process.exit(1);
}

// Reuse the page's own NBT reader and region renderer so the published map matches the page.
const here = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const worker = html.match(/<script id="worker-src" type="text\/plain">([\s\S]*?)<\/script>/)[1];
globalThis.self = {};
const { renderRegion, NBT } = new Function(core + worker + '\nreturn { renderRegion, NBT };')();

// ---- Find the server's world and its dimensions ----
const props = path.join(server, 'server.properties');
const levelName = (fs.existsSync(props) && fs.readFileSync(props, 'utf8').match(/^level-name=(.*)$/m)?.[1].trim()) || 'world';
const worldDir = fs.existsSync(path.join(server, levelName, 'level.dat')) ? path.join(server, levelName)
  : fs.existsSync(path.join(server, 'level.dat')) ? server : null;
if (!worldDir) { console.error(`No world found: expected ${path.join(server, levelName, 'level.dat')}`); process.exit(1); }

const candidates = [
  ['overworld', 'Overworld', 'overworld', [path.join(worldDir, 'region'), path.join(worldDir, 'dimensions/minecraft/overworld/region')]],
  ['nether', 'Nether', 'nether', [path.join(worldDir, 'DIM-1/region'), path.join(worldDir + '_nether', 'DIM-1/region'), path.join(worldDir, 'dimensions/minecraft/the_nether/region')]],
  ['end', 'The End', 'end', [path.join(worldDir, 'DIM1/region'), path.join(worldDir + '_the_end', 'DIM1/region'), path.join(worldDir, 'dimensions/minecraft/the_end/region')]],
];

let data = {};
try { data = NBT.parse(zlib.gunzipSync(fs.readFileSync(path.join(worldDir, 'level.dat')))).Data || {}; } catch (e) { console.warn('Could not read level.dat:', e.message); }
const spawn = typeof data.SpawnX === 'number' ? { x: data.SpawnX, z: data.SpawnZ }
  : data.spawn?.pos ? { x: data.spawn.pos[0], z: data.spawn.pos[2] } : null;

// ---- Output helpers ----
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = zlib.crc32 || (buf => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; });
function png(rgba, w, h) {
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 1; // "Sub" filter: store each byte minus the pixel to its left
    for (let x = 0; x < stride; x++) raw[o + 1 + x] = (rgba[y * stride + x] - (x >= 4 ? rgba[y * stride + x - 4] : 0)) & 255;
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
// Block data for the hover readout: "SMPR", palette JSON length, palette JSON, blocks u16, heights i16, depth u8 (little-endian)
function blockData(res) {
  const pal = Buffer.from(JSON.stringify(res.palette));
  const head = Buffer.alloc(8); head.write('SMPR', 0); head.writeUInt32LE(pal.length, 4);
  const le = a => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  return zlib.gzipSync(Buffer.concat([head, pal, le(res.blocks), le(res.heights), le(res.depth)]), { level: 9 });
}

// ---- Render ----
const out = path.join(here, 'map');
fs.rmSync(out, { recursive: true, force: true });
const manifest = { name: nameArg || data.LevelName || path.basename(path.resolve(server)), version: data.Version?.Name || null, generated: new Date().toISOString(), dims: [] };
let totalBytes = 0;

for (const [key, label, kind, dirs] of candidates) {
  const dir = dirs.find(d => fs.existsSync(d));
  if (!dir) continue;
  const files = fs.readdirSync(dir).filter(f => /^r\.-?\d+\.-?\d+\.mca$/.test(f));
  const regions = [];
  fs.mkdirSync(path.join(out, key), { recursive: true });
  for (const [i, f] of files.entries()) {
    const [, rx, rz] = f.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/).map(Number);
    process.stdout.write(`\r${label}: ${i + 1}/${files.length} regions`);
    const res = await renderRegion(new Uint8Array(fs.readFileSync(path.join(dir, f))), kind);
    if (!res.stats.chunks) continue;
    const p = png(res.rgba, 512, 512), b = blockData(res);
    fs.writeFileSync(path.join(out, key, `r.${rx}.${rz}.png`), p);
    fs.writeFileSync(path.join(out, key, `r.${rx}.${rz}.bin.gz`), b);
    totalBytes += p.length + b.length;
    regions.push([rx, rz, res.stats.chunks]);
  }
  process.stdout.write('\n');
  if (regions.length) manifest.dims.push({ key, label, kind, spawn: kind === 'overworld' ? spawn : null, regions });
}

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
console.log(`Wrote map/ for "${manifest.name}": ${manifest.dims.map(d => `${d.label} ${d.regions.length}`).join(', ')} regions, ${(totalBytes / 1048576).toFixed(1)} MB`);

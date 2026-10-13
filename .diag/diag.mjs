// Diagnóstico temporal: Premetro en OSM y nombres de autopistas.
import { CAPAS } from '../src/capas.js';
const servidores = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function op(q) {
  for (let v = 0; v < 3; v++) for (const s of servidores) {
    try { const r = await fetch(s, { method: 'POST', body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(120000) }); if (r.ok) return r.json(); console.log('  ', s, r.status); } catch (e) { console.log('  ', s, e.message); }
    await new Promise((ok) => setTimeout(ok, 10000));
  }
  throw new Error('overpass no respondió');
}
const pre = await op('[out:json][timeout:120][bbox:-34.71,-58.54,-34.52,-58.33];(relation["route"~"^(light_rail|tram)$"];);out tags;');
console.log('### relaciones light_rail/tram');
for (const e of pre.elements) console.log('  ', e.id, JSON.stringify(e.tags));
const au = await op(CAPAS.find((c) => c.id === 'autopistas').overpass.replace('out geom;', 'out tags;'));
const cuenta = {};
for (const w of au.elements) { const k = `${w.tags.highway} | ${w.tags.name ?? '(sin nombre)'} | ref=${w.tags.ref ?? ''}`; cuenta[k] = (cuenta[k] ?? 0) + 1; }
console.log('### autopistas (highway | name | ref → cantidad)');
for (const [k, n] of Object.entries(cuenta).sort()) console.log('  ', n, k);

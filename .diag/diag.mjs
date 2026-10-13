// Diagnóstico temporal: calles y estaciones entre Plaza Italia y Pacífico (OSM).
const servidores = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function op(q) {
  for (let v = 0; v < 3; v++) for (const s of servidores) {
    try { const r = await fetch(s, { method: 'POST', body: new URLSearchParams({ data: `[out:json][timeout:60];${q}` }), signal: AbortSignal.timeout(90000) }); if (r.ok) return r.json(); console.log('  ', s, r.status); } catch (e) { console.log('  ', s, e.message); }
    await new Promise((ok) => setTimeout(ok, 10000));
  }
  throw new Error('overpass no respondió');
}
const bbox = '(-34.590,-58.440,-34.570,-58.410)';
const est = await op(`(node["railway"="station"]${bbox};node["public_transport"="station"]${bbox};node["station"="subway"]${bbox};);out;`);
console.log('### estaciones');
for (const e of est.elements) console.log(`  ${e.tags.name} | ${e.tags.station ?? e.tags.railway} | ${e.tags.line ?? e.tags.network ?? ''} | ${e.lat},${e.lon}`);
// Calles que pasan cerca de los últimos puntos de la traza F.
const ult = [[-58.411829, -34.58148], [-58.421027, -34.580905], [-58.42176, -34.580851], [-58.426093, -34.57811]];
for (const [lon, lat] of ult) {
  const r = await op(`way(around:25,${lat},${lon})["highway"]["name"];out tags;`);
  console.log(`### calles cerca de ${lat},${lon}:`, [...new Set(r.elements.map((w) => w.tags.name))].join(' | '));
}
// Geometría de las avenidas candidatas en el tramo.
for (const nombre of ['Avenida Santa Fe', 'Avenida Sarmiento', 'Avenida Las Heras', 'Avenida Juan Bautista Justo', 'Avenida Juan B. Justo']) {
  const r = await op(`way["name"="${nombre}"]${bbox};out geom;`);
  console.log(`### ${nombre}: ${r.elements.length} vías`);
  for (const w of r.elements) console.log('  ', w.id, JSON.stringify(w.geometry.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)])));
}

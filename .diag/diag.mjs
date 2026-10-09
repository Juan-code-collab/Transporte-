// Diagnóstico temporal 2: estructura de los GeoJSON nacionales.
const base = 'https://datos.transporte.gob.ar/dataset/f87b93d4-ade2-44fc-a409-d3736ba9f3ba/resource/';
const urls = {
  nacional: base + '84947471-9c1e-4a23-8a2e-03a8c87c056f/download/lineasbusrmbajurisdiccionnacional.geojson',
  provincial: base + 'f95e25bc-a6b2-4a78-a04b-35fa437be96b/download/lineasbusrmbajurisdiccionprovincial.geojson',
  subte: base + '9341189e-6f06-43d7-a5ed-a34f3435fbcc/download/reddesubterraneo1.geojson',
  trenes: base + '367a26af-c5b4-4361-b614-abd6ad743383/download/ambalineas.geojson',
};
const CABA = { w: -58.535, e: -58.335, s: -34.706, n: -34.526 };
const pts = (g) => { const o = []; const r = (c) => (typeof c[0] === 'number' ? o.push(c) : c.forEach(r)); r(g.coordinates); return o; };
for (const [k, u] of Object.entries(urls)) {
  try {
    const r = await fetch(u); const t = await r.text();
    const d = JSON.parse(t);
    console.log(`\n### ${k}: ${(t.length / 1e6).toFixed(1)} MB, ${d.features.length} features, crs=${JSON.stringify(d.crs)}`);
    console.log('tipos', [...new Set(d.features.map((f) => f.geometry?.type))]);
    console.log('props0', JSON.stringify(d.features[0].properties));
    console.log('coord0', JSON.stringify(pts(d.features[0].geometry)[0]));
    const enCaba = d.features.filter((f) => f.geometry && pts(f.geometry).some(([x, y]) => x > CABA.w && x < CABA.e && y > CABA.s && y < CABA.n));
    console.log('en CABA (bbox):', enCaba.length);
    const keys = Object.keys(d.features[0].properties);
    for (const key of keys.slice(0, 4)) console.log(`  ${key}:`, [...new Set(enCaba.map((f) => f.properties[key]))].slice(0, 160).join(' | '));
  } catch (e) { console.log('ERR', k, e.message); }
}

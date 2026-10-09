// Diagnóstico temporal: lista datasets de colectivos (nación y ciudad).
const j = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'transporte-caba-diag' } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
for (const base of ['https://datos.transporte.gob.ar', 'https://datos.gob.ar']) {
  for (const q of ['recorridos colectivos', 'colectivos gtfs', 'lineas colectivos amba']) {
    try {
      const { result } = await j(`${base}/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=8`);
      console.log(`\n### ${base} q="${q}" total=${result.count}`);
      for (const p of result.results) {
        console.log(`- ${p.name} | ${p.title} | ${p.organization?.title}`);
        for (const r of p.resources) console.log(`    * [${r.format}] ${r.name} -> ${r.url}`);
      }
    } catch (e) { console.log(`ERR ${base} ${q}: ${e.message}`); }
  }
}
try {
  const { result } = await j('https://data.buenosaires.gob.ar/api/3/action/package_show?id=colectivos-recorridos');
  console.log('\n### CABA colectivos-recorridos');
  for (const r of result.resources) console.log(`    * [${r.format}] ${r.name} -> ${r.url}`);
  const gj = result.resources.find((r) => /geojson/i.test(r.format));
  const d = await j(gj.url);
  console.log('features', d.features.length, 'props', JSON.stringify(d.features[0].properties));
  const ls = [...new Set(d.features.map((f) => JSON.stringify(Object.values(f.properties).slice(0, 3))))];
  console.log('muestras', ls.slice(0, 200).join(' '));
} catch (e) { console.log('ERR caba', e.message); }

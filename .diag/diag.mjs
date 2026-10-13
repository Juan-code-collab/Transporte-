// Diagnóstico temporal: campos de trenes, ciclovías y comunas.
const j = async (u) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(u); const t = await r.text(); return JSON.parse(t); } catch (e) { if (i === 2) throw e; await new Promise((ok) => setTimeout(ok, 4000)); } } };
const muestra = (d, n = 3) => d.features.slice(0, n).map((f) => JSON.stringify(f.properties)).join('\n    ');
for (const id of ['estaciones-ferrocarril', 'ciclovias', 'comunas']) {
  try {
    const { result } = await j(`https://data.buenosaires.gob.ar/api/3/action/package_show?id=${id}`);
    console.log(`\n### ${id}: ${result.title}`);
    for (const r of result.resources) console.log(`  * [${r.format}] ${r.name} -> ${r.url}`);
    for (const r of result.resources.filter((r) => /geojson/i.test(r.format))) {
      const d = await j(r.url);
      console.log(`  ${r.name}: ${d.features.length} features, tipos ${[...new Set(d.features.map((f) => f.geometry?.type))]}`);
      console.log('    ' + muestra(d));
      const claves = Object.keys(d.features[0].properties);
      for (const k of claves) {
        const v = [...new Set(d.features.map((f) => f.properties[k]))];
        if (v.length < 60) console.log(`    ${k} (${v.length}): ${v.slice(0, 60).join(' | ')}`);
        else console.log(`    ${k} (${v.length} distintos) ej: ${v.slice(0, 12).join(' | ')}`);
      }
    }
  } catch (e) { console.log('ERR', id, e.message); }
}

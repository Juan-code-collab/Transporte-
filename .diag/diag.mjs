const q = '[out:json][timeout:120][bbox:-33.70,-70.90,-33.25,-70.40];(relation["route"="subway"];relation["route"="light_rail"];);out tags;';
for (const s of ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
  try {
    const r = await fetch(s, { method: 'POST', headers: { 'User-Agent': 'transporte-caba/0.1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(120000) });
    if (!r.ok) { console.log(s, r.status); continue; }
    const d = await r.json();
    for (const e of d.elements) console.log(e.id, e.tags.ref, e.tags.name, e.tags.colour, e.tags.network);
    const b = await fetch(s, { method: 'POST', headers: { 'User-Agent': 'transporte-caba/0.1', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: q.replace(/relation\["route"="subway"\];relation\["route"="light_rail"\];/, 'relation["route"="bus"]["network"~"Red|Transantiago",i];').replace('out tags;', 'out count;') }), signal: AbortSignal.timeout(120000) });
    console.log('buses OSM:', JSON.stringify((await b.json()).elements?.[0]?.tags));
    break;
  } catch (e) { console.log(s, e.message); }
}

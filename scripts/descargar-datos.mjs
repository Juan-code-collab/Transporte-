#!/usr/bin/env node
// Descarga los recorridos de cada capa a public/data/<id>.geojson.
//
// Uso:
//   npm run datos                         # todas las capas
//   npm run datos -- --solo subte,trenes  # algunas capas
//   npm run datos -- --fuente overpass    # forzar OpenStreetMap
//   npm run datos -- --fuente ckan        # sólo portal de la Ciudad

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CAPAS, OVERPASS_APIS } from '../src/capas.js';
import { esWgs84, lineaDe, overpassAGeojson, pasaPorCaba, redondear, simplificar, soloLineas } from '../src/geo.js';

const DESTINO = fileURLToPath(new URL('../public/data/', import.meta.url));
const AGENTE = 'transporte-caba/0.1 (mapa de transporte de Buenos Aires)';

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function pedirJson(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { 'User-Agent': AGENTE, ...opciones.headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.json();
}

async function desdeCkan({ portal, dataset, recurso }) {
  const { result } = await pedirJson(`${portal}/api/3/action/package_show?id=${encodeURIComponent(dataset)}`);
  let candidatos = result.resources.filter((r) => /geojson/i.test(r.format) || /\.geojson(\?|$)/i.test(r.url));
  // Si hay recursos con el nombre esperado se usan sólo esos; si no, cualquiera.
  const esperados = candidatos.filter((r) => coincide(r, recurso));
  if (esperados.length) candidatos = esperados;
  if (!candidatos.length) throw new Error(`el dataset "${dataset}" no tiene recursos GeoJSON`);

  // Un dataset puede tener varios GeoJSON (p. ej. estaciones y líneas): se usa
  // el primero que traiga recorridos.
  for (const r of candidatos) {
    const geojson = soloLineas(await pedirJson(r.url));
    if (!geojson.features.length) {
      console.log(`  · ${r.name}: sin recorridos (sólo puntos), se descarta`);
      continue;
    }
    if (!esWgs84(geojson)) {
      console.log(`  · ${r.name}: no está en coordenadas WGS84, se descarta`);
      continue;
    }
    const gobierno = portal.includes('buenosaires') ? 'Gobierno de la Ciudad de Buenos Aires' : 'Ministerio de Transporte de la Nación';
    return { geojson, fuente: `${gobierno} — ${result.title} (${r.name})`, url: r.url };
  }
  throw new Error(`ningún GeoJSON de "${dataset}" trae recorridos`);
}

function coincide(r, recurso) {
  return Number(recurso.test(r.name) || recurso.test(r.url));
}

async function desdeOverpass(consulta) {
  let ultimoError;
  for (const servidor of OVERPASS_APIS) {
    try {
      const respuesta = await pedirJson(servidor, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: consulta }),
      });
      return {
        geojson: soloLineas(overpassAGeojson(respuesta)),
        fuente: '© colaboradores de OpenStreetMap (ODbL)',
        url: servidor,
      };
    } catch (e) {
      console.log(`  · ${e.message}`);
      ultimoError = e;
    }
  }
  throw ultimoError;
}

// Todas las fuentes CKAN de una capa, sumadas. Una línea que ya vino de una
// fuente anterior no se vuelve a agregar.
async function desdeCkanCombinado(fuentes, soloCaba) {
  const features = [];
  const usadas = [];
  const lineasVistas = new Set();
  for (const fuente of fuentes) {
    try {
      const res = await desdeCkan(fuente);
      const nuevas = new Set();
      let agregados = 0;
      for (const f of res.geojson.features) {
        const linea = lineaDe(f.properties);
        if (linea && lineasVistas.has(linea)) continue;
        if (soloCaba && !pasaPorCaba(f)) continue;
        if (linea) nuevas.add(linea);
        features.push(f);
        agregados++;
      }
      nuevas.forEach((l) => lineasVistas.add(l));
      console.log(`  · ${agregados} recorridos de ${res.fuente}`);
      usadas.push(res);
    } catch (e) {
      console.warn(`  ✗ ${fuente.dataset}: ${e.message}`);
    }
  }
  if (!usadas.length) throw new Error('ninguna fuente respondió');
  return {
    geojson: { type: 'FeatureCollection', features },
    fuente: usadas.map((u) => u.fuente).join('; '),
    url: usadas.map((u) => u.url).join(' '),
  };
}

async function descargar(capa, fuenteForzada) {
  const intentos = [];
  if (capa.ckan && fuenteForzada !== 'overpass') {
    if (capa.combinar) intentos.push(['ckan', () => desdeCkanCombinado(capa.ckan, capa.soloCaba)]);
    else for (const f of capa.ckan) intentos.push(['ckan', () => desdeCkan(f)]);
  }
  if (capa.overpass && fuenteForzada !== 'ckan') intentos.push(['overpass', () => desdeOverpass(capa.overpass)]);

  for (const [tipo, intento] of intentos) {
    try {
      const res = await intento();
      if (capa.soloCaba) res.geojson.features = res.geojson.features.filter(pasaPorCaba);
      if (!res.geojson.features?.length) throw new Error('respuesta sin elementos');
      return { ...res, tipo };
    } catch (e) {
      console.warn(`  ✗ ${capa.id} (${tipo}): ${e.message}`);
    }
  }
  return null;
}

const solo = argumento('solo')?.split(',');
const fuenteForzada = argumento('fuente');
const capas = CAPAS.filter((c) => !solo || solo.includes(c.id));

await mkdir(DESTINO, { recursive: true });
// Se conserva lo ya descargado de otras capas (útil con --solo).
const manifiesto = await readFile(`${DESTINO}manifest.json`, 'utf8').then(JSON.parse, () => ({}));
let fallidas = 0;

for (const capa of capas) {
  console.log(`→ ${capa.nombre}`);
  const res = await descargar(capa, fuenteForzada);
  if (!res) {
    fallidas++;
    continue;
  }
  const texto = JSON.stringify(redondear(simplificar(res.geojson)));
  await writeFile(`${DESTINO}${capa.id}.geojson`, texto);
  manifiesto[capa.id] = {
    fuente: res.fuente,
    url: res.url,
    tipo: res.tipo,
    elementos: res.geojson.features.length,
    descargado: new Date().toISOString(),
  };
  console.log(`  ✓ ${res.geojson.features.length} elementos (${(texto.length / 1e6).toFixed(1)} MB) — ${res.fuente}`);
}

await writeFile(`${DESTINO}manifest.json`, JSON.stringify(manifiesto, null, 2));
if (fallidas) {
  console.error(`\n${fallidas} capa(s) no se pudieron descargar.`);
  process.exitCode = 1;
}

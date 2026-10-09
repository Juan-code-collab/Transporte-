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
import { CAPAS, CKAN_API, OVERPASS_API } from '../src/capas.js';
import { esWgs84, overpassAGeojson, redondear } from '../src/geo.js';

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

async function desdeCkan({ dataset, recurso }) {
  const { result } = await pedirJson(`${CKAN_API}?id=${encodeURIComponent(dataset)}`);
  const candidatos = result.resources.filter(
    (r) => /geojson/i.test(r.format) || /\.geojson(\?|$)/i.test(r.url),
  );
  const elegido = candidatos.find((r) => recurso.test(r.name) || recurso.test(r.url)) ?? candidatos[0];
  if (!elegido) throw new Error(`el dataset "${dataset}" no tiene recursos GeoJSON`);
  const geojson = await pedirJson(elegido.url);
  if (!esWgs84(geojson)) throw new Error(`${elegido.url} no está en coordenadas WGS84`);
  return { geojson, fuente: `Gobierno de la Ciudad de Buenos Aires — ${result.title}`, url: elegido.url };
}

async function desdeOverpass(consulta) {
  const respuesta = await pedirJson(OVERPASS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: consulta }),
  });
  return {
    geojson: overpassAGeojson(respuesta),
    fuente: '© colaboradores de OpenStreetMap (ODbL)',
    url: OVERPASS_API,
  };
}

async function descargar(capa, fuenteForzada) {
  const intentos = [];
  if (capa.ckan && fuenteForzada !== 'overpass') intentos.push(['ckan', () => desdeCkan(capa.ckan)]);
  if (capa.overpass && fuenteForzada !== 'ckan') intentos.push(['overpass', () => desdeOverpass(capa.overpass)]);

  for (const [tipo, intento] of intentos) {
    try {
      const res = await intento();
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
  const texto = JSON.stringify(redondear(res.geojson));
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

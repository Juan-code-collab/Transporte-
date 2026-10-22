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
import { CAPAS, COMUNAS, OVERPASS_APIS } from '../src/capas.js';
import { abrirZip, gtfsAGeojson } from './gtfs.mjs';
import {
  arreglarPropiedades,
  comunasDe,
  esWgs84,
  kmlAGeojson,
  lineaDe,
  overpassAGeojson,
  pasaPorCaba,
  prepararComunas,
  redondear,
  simplificar,
  soloLineas,
} from '../src/geo.js';

const DESTINO = fileURLToPath(new URL('../public/data/', import.meta.url));
const AGENTE = 'transporte-caba/0.1 (mapa de transporte de Buenos Aires)';

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

// Los portales a veces responden con una página de error en vez de datos:
// se reintenta hasta 3 veces, esperando cada vez un poco más.
async function pedirJson(url, opciones = {}, intentos = 3) {
  for (let i = 1; ; i++) {
    try {
      // Límite de 2 minutos: un portal colgado no debe trabar toda la descarga.
      const r = await fetch(url, {
        ...opciones,
        headers: { 'User-Agent': AGENTE, ...opciones.headers },
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      const texto = await r.text();
      try {
        return JSON.parse(texto);
      } catch {
        throw new Error(`${url} no devolvió JSON`);
      }
    } catch (e) {
      if (i >= intentos) throw e;
      await new Promise((ok) => setTimeout(ok, 3000 * i));
    }
  }
}

async function desdeCkan(fuente) {
  try {
    return await desdeCkanApi(fuente);
  } catch (e) {
    if (!fuente.respaldo) throw e;
    console.log(`  · ${e.message}; se usa el archivo directo`);
    const geojson = soloLineas(arreglarPropiedades(await pedirJson(fuente.respaldo)));
    if (!geojson.features.length || !esWgs84(geojson)) throw e;
    return { geojson, fuente: `Gobierno de la Ciudad de Buenos Aires — ${fuente.dataset}`, url: fuente.respaldo };
  }
}

async function desdeCkanApi({ portal, dataset, recurso }) {
  const { result } = await pedirJson(`${portal}/api/3/action/package_show?id=${encodeURIComponent(dataset)}`);
  let candidatos = result.resources.filter((r) => /geojson/i.test(r.format) || /\.geojson(\?|$)/i.test(r.url));
  // Si hay recursos con el nombre esperado se usan sólo esos; si no, cualquiera.
  const esperados = candidatos.filter((r) => coincide(r, recurso));
  if (esperados.length) candidatos = esperados;
  if (!candidatos.length) throw new Error(`el dataset "${dataset}" no tiene recursos GeoJSON`);

  // Un dataset puede tener varios GeoJSON (p. ej. estaciones y líneas): se usa
  // el primero que traiga recorridos.
  for (const r of candidatos) {
    const geojson = soloLineas(arreglarPropiedades(await pedirJson(r.url)));
    if (!geojson.features?.length) {
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

// Los servidores públicos de Overpass se saturan seguido (504/500): se
// recorren todos, y si ninguno responde se espera y se hace otra vuelta.
async function desdeOverpass(consulta, vueltas = 3) {
  let ultimoError;
  for (let vuelta = 1; vuelta <= vueltas; vuelta++) {
    if (vuelta > 1) await new Promise((ok) => setTimeout(ok, 20000));
    for (const servidor of OVERPASS_APIS) {
      try {
        const respuesta = await pedirJson(
          servidor,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ data: consulta }),
          },
          1,
        );
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
  }
  throw ultimoError;
}

// Recorridos que los datasets oficiales no traen (p. ej. el Premetro) y se
// suman desde OpenStreetMap. Si Overpass no responde, se conservan los de la
// versión anterior del archivo (el deploy la trae antes de descargar).
async function sumarExtra(capa, res) {
  const { nombre, linea, filtro, overpass } = capa.sumar;
  let extra = [];
  try {
    const todos = (await desdeOverpass(overpass)).geojson.features;
    const elegidos = todos.filter((f) => filtro.test(`${f.properties.name ?? ''} ${f.properties.ref ?? ''}`));
    extra = (elegidos.length ? elegidos : todos).map((f) => ({ ...f, properties: { ...f.properties, linea, _extra: nombre } }));
  } catch (e) {
    const previo = await readFile(`${DESTINO}${capa.id}.geojson`, 'utf8').then(JSON.parse, () => null);
    extra = (previo?.features ?? []).filter((f) => f.properties?._extra === nombre);
    console.warn(`  ✗ ${nombre}: ${e.message}${extra.length ? ' (se usa la versión anterior)' : ''}`);
  }
  if (!extra.length) return;
  res.geojson.features.push(...extra);
  res.fuente += `; ${nombre}: © colaboradores de OpenStreetMap (ODbL)`;
  console.log(`  · ${extra.length} recorridos de ${nombre} (OpenStreetMap)`);
}

// GTFS: se busca el .zip vigente en la página del organismo (el más reciente
// por fecha en el nombre) o, si no, en el catálogo de Transitland. Se descarga
// una sola vez aunque lo usen varias capas.
const feedsGtfs = new Map();

async function urlGtfs({ pagina, patron, catalogo }) {
  try {
    const r = await fetch(pagina, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(60000) });
    const html = await r.text();
    const encontrados = [...html.matchAll(patron)].sort((a, b) => b[1].localeCompare(a[1]));
    if (encontrados.length) return new URL(encontrados[0][0], pagina).href;
  } catch {
    // se prueba el catálogo
  }
  const dmfr = await pedirJson(catalogo);
  const url = dmfr.feeds?.find((f) => f.spec === 'gtfs')?.urls?.static_current;
  if (!url) throw new Error('no se encontró el GTFS vigente');
  return url;
}

async function desdeGtfs(cfg) {
  const clave = cfg.pagina;
  if (!feedsGtfs.has(clave)) {
    feedsGtfs.set(
      clave,
      (async () => {
        const url = await urlGtfs(cfg);
        console.log(`  · GTFS: ${url}`);
        const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(300000) });
        if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
        return { url, leer: abrirZip(new Uint8Array(await r.arrayBuffer())) };
      })(),
    );
  }
  const { url, leer } = await feedsGtfs.get(clave);
  const nombreZip = url.split('/').pop();
  return { geojson: gtfsAGeojson(leer, cfg.tipos), fuente: `DTPM — GTFS ${nombreZip}`, url };
}

// Mapa de Google My Maps (u otro KML público).
async function desdeKml(url) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(120000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
      const texto = await r.text();
      if (!/<kml/i.test(texto)) throw new Error('la respuesta no es un KML (¿el mapa es público?)');
      return { geojson: kmlAGeojson(texto), fuente: 'Google My Maps', url };
    } catch (e) {
      if (i >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 3000 * i));
    }
  }
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
  if (capa.kml) intentos.push(['kml', () => desdeKml(capa.kml)]);
  if (capa.gtfs) intentos.push(['gtfs', () => desdeGtfs(capa.gtfs)]);
  if (capa.overpass && fuenteForzada !== 'ckan') intentos.push(['overpass', () => desdeOverpass(capa.overpass)]);

  for (const [tipo, intento] of intentos) {
    try {
      const res = await intento();
      if (capa.soloCaba) res.geojson.features = res.geojson.features.filter(pasaPorCaba);
      if (!res.geojson.features?.length) throw new Error('respuesta sin elementos');
      if (capa.sumar && tipo === 'ckan') await sumarExtra(capa, res);
      return { ...res, tipo };
    } catch (e) {
      console.warn(`  ✗ ${capa.id} (${tipo}): ${e.message}`);
    }
  }
  return null;
}

const solo = argumento('solo')?.split(',');
const fuenteForzada = argumento('fuente');
// Las capas con `archivo` se cargan a mano: no se descargan.
const capas = CAPAS.filter((c) => !c.archivo && (!solo || solo.includes(c.id)));

await mkdir(DESTINO, { recursive: true });
// Se conserva lo ya descargado de otras capas (útil con --solo).
const manifiesto = await readFile(`${DESTINO}manifest.json`, 'utf8').then(JSON.parse, () => ({}));
let fallidas = 0;

// Comunas: se guardan para el filtro y se usan para anotar en cada recorrido
// por qué comunas pasa (propiedad `_comunas`), así el navegador no lo calcula.
let comunas = [];
console.log('→ Comunas');
try {
  const geojson = await pedirComunas();
  comunas = prepararComunas(geojson);
  await writeFile(`${DESTINO}comunas.geojson`, JSON.stringify(redondear(geojson)));
  manifiesto.comunas = { fuente: 'Gobierno de la Ciudad de Buenos Aires — Comunas', descargado: new Date().toISOString() };
  console.log(`  ✓ ${comunas.length} comunas`);
} catch (e) {
  // Si ya había un archivo (p. ej. del deploy anterior), se usa ese.
  const previo = await readFile(`${DESTINO}comunas.geojson`, 'utf8').then(JSON.parse, () => null);
  if (previo) comunas = prepararComunas(previo);
  console.warn(`  ✗ comunas: ${e.message}${previo ? ' (se usa la versión anterior)' : ''}`);
}

async function pedirComunas() {
  try {
    const { result } = await pedirJson(`${COMUNAS.portal}/api/3/action/package_show?id=${COMUNAS.dataset}`);
    const r = result.resources.find((x) => /\.geojson$/i.test(x.url) && COMUNAS.recurso.test(x.name));
    if (r) return await pedirJson(r.url);
  } catch {
    // se prueba el archivo directo
  }
  return pedirJson(COMUNAS.respaldo);
}

for (const capa of capas) {
  console.log(`→ ${capa.nombre}`);
  const res = await descargar(capa, fuenteForzada);
  if (!res) {
    fallidas++;
    continue;
  }
  // Las comunas son de CABA: sólo se anotan en las capas de Buenos Aires.
  if (comunas.length && (capa.ciudad ?? 'ba') === 'ba') for (const f of res.geojson.features) f.properties = { ...f.properties, _comunas: comunasDe(f, comunas) };
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

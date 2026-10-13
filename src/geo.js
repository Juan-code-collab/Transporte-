// Utilidades puras sobre GeoJSON, compartidas entre la app y el script.

import { COLORES_SUBTE, LINEAS_JURISDICCION_CIUDAD } from './capas.js';

// Convierte la respuesta JSON de Overpass (`out geom`) en una FeatureCollection.
// Las relaciones (recorridos) se vuelven MultiLineString con sus vías; las vías
// sueltas (autopistas, ciclovías) se vuelven LineString.
export function overpassAGeojson(respuesta) {
  const features = [];
  for (const el of respuesta.elements ?? []) {
    let geometry = null;
    if (el.type === 'way' && el.geometry?.length > 1) {
      geometry = { type: 'LineString', coordinates: el.geometry.map(aCoord) };
    } else if (el.type === 'relation') {
      const tramos = (el.members ?? [])
        .filter((m) => m.type === 'way' && m.geometry?.length > 1 && !/platform|stop/.test(m.role))
        .map((m) => m.geometry.map(aCoord));
      if (tramos.length) geometry = { type: 'MultiLineString', coordinates: tramos };
    }
    if (geometry) {
      features.push({
        type: 'Feature',
        id: `${el.type}/${el.id}`,
        properties: { ...el.tags, osm_id: `${el.type}/${el.id}` },
        geometry,
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function aCoord({ lon, lat }) {
  return [lon, lat];
}

// Deja sólo los recorridos (líneas). Algunos datasets mezclan estaciones (puntos).
export function soloLineas(geojson) {
  const features = (geojson.features ?? []).filter((f) => /LineString$/.test(f.geometry?.type ?? ''));
  return { ...geojson, features };
}

// Contorno aproximado de la Ciudad (Av. General Paz, Riachuelo y costa del
// Río de la Plata), en [lon, lat]. Alcanza para saber si un recorrido entra.
export const CONTORNO_CABA = [
  [-58.4605, -34.5345], [-58.4140, -34.5520], [-58.3780, -34.5700],
  [-58.3500, -34.5950], [-58.3300, -34.6150], [-58.3480, -34.6370],
  [-58.3700, -34.6560], [-58.4000, -34.6560], [-58.4300, -34.6680],
  [-58.4620, -34.7050], [-58.4900, -34.6800], [-58.5290, -34.6450],
  [-58.5310, -34.6150], [-58.5050, -34.5800], [-58.4880, -34.5500],
];

export function dentro([x, y], poligono) {
  let adentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

// ¿Algún punto del recorrido cae dentro de la Ciudad?
export function pasaPorCaba(feature) {
  const puntos = [];
  const juntar = (a) => (typeof a[0] === 'number' ? puntos.push(a) : a.forEach(juntar));
  juntar(feature.geometry?.coordinates ?? []);
  return puntos.some((p) => dentro(p, CONTORNO_CABA));
}

// Simplifica las líneas (Douglas-Peucker) para achicar archivos y acelerar el
// dibujo. Tolerancia en grados: 0.00002 ≈ 2 m.
export function simplificarPuntos(pts, tolerancia = 0.00002) {
  if (pts.length < 3) return pts;
  const t2 = tolerancia * tolerancia;
  const marcar = new Uint8Array(pts.length);
  marcar[0] = marcar[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = distancia2(pts[i], pts[a], pts[b]);
      if (d > max) [max, idx] = [d, i];
    }
    if (max > t2) {
      marcar[idx] = 1;
      pila.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => marcar[i]);
}

export function simplificar(geojson, tolerancia = 0.00002) {
  for (const f of geojson.features ?? []) {
    const g = f.geometry;
    if (g?.type === 'LineString') g.coordinates = simplificarPuntos(g.coordinates, tolerancia);
    if (g?.type === 'MultiLineString') g.coordinates = g.coordinates.map((l) => simplificarPuntos(l, tolerancia));
  }
  return geojson;
}

function distancia2([x, y], [x1, y1], [x2, y2]) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  if (dx || dy) {
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    x1 += t * dx;
    y1 += t * dy;
  }
  dx = x - x1;
  dy = y - y1;
  return dx * dx + dy * dy;
}

// Redondea coordenadas a 6 decimales (~10 cm) para achicar los archivos.
export function redondear(geojson, decimales = 6) {
  const f = 10 ** decimales;
  // Además descarta la altura (z) si viene: sólo se usa lon/lat.
  const r = (c) => (typeof c[0] === 'number' ? c.slice(0, 2).map((n) => Math.round(n * f) / f) : c.map(r));
  for (const feat of geojson.features ?? []) {
    if (feat.geometry?.coordinates) feat.geometry.coordinates = r(feat.geometry.coordinates);
  }
  return geojson;
}

// Algunos archivos del Gobierno vienen en coordenadas planas (Gauss-Krüger
// Buenos Aires). Leaflet necesita lon/lat WGS84: verificamos con una muestra.
export function esWgs84(geojson) {
  for (const feat of geojson.features ?? []) {
    let c = feat.geometry?.coordinates;
    while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [lon, lat] = c;
      return Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
    }
  }
  return false;
}

const CAMPOS_LINEA = [
  'linea', 'LINEA', 'Linea', 'LINEASUB', 'lineas', 'LINEAS', 'line', 'LINE', 'ref',
  'route_short_name', 'nombre', 'NOMBRE', 'name',
];
const CAMPOS_JURISDICCION = [
  'jurisdiccion', 'JURISDICCION', 'Jurisdiccion', 'jurisdicci', 'JURISDICCI',
  'tipo_servicio', 'TIPO_SERVICIO', 'network', 'agency_name', 'operator',
];

function primerCampo(props, campos) {
  for (const c of campos) {
    const v = props?.[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

// Identificador de línea normalizado ("Línea 60" → "60", "Subte A" → "A").
export function lineaDe(props) {
  const v = primerCampo(props, CAMPOS_LINEA);
  if (!v) return null;
  const m = v.match(/\b(\d{1,3}|[A-HP])\b/);
  return normalizarLinea(m ? m[1] : v);
}

// "004" → "4", "a" → "A": así se busca la línea como se la conoce.
export function normalizarLinea(texto) {
  const t = String(texto).trim().toUpperCase();
  return /^\d+$/.test(t) ? String(Number(t)) : t;
}

// 'ciudad' | 'nacional' | 'provincial' | 'municipal' | null
export function jurisdiccionDe(props) {
  // Las líneas traspasadas a la Ciudad figuran como nacionales en el dataset
  // nacional: la lista de la Ciudad manda.
  const linea = lineaDe(props);
  if (linea && LINEAS_JURISDICCION_CIUDAD.includes(linea)) return 'ciudad';
  const v = primerCampo(props, CAMPOS_JURISDICCION);
  if (v) {
    const t = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/nac|\bjn\b/.test(t)) return 'nacional';
    if (/ciud|caba|autonoma/.test(t)) return 'ciudad';
    if (/prov|pba/.test(t)) return 'provincial';
    if (/muni/.test(t)) return 'municipal';
  }
  // Sin dato explícito (p. ej. OpenStreetMap): en el AMBA, las líneas 1–199
  // son nacionales y las de 200 en adelante, provinciales o municipales.
  if (linea && /^\d+$/.test(linea)) return Number(linea) < 200 ? 'nacional' : 'provincial';
  return null;
}

export function colorSubte(props) {
  const c = props?.colour ?? props?.color ?? props?.COLOR;
  if (c && /^#?[0-9a-f]{6}$/i.test(c)) return c.startsWith('#') ? c : `#${c}`;
  const linea = lineaDe(props);
  return COLORES_SUBTE[linea] ?? null;
}

// Algunos archivos vienen con los acentos rotos ("San MartÃ­n"): UTF-8 leído
// como Latin-1. Se recompone; si no se puede, queda igual.
export function arreglarTexto(texto) {
  if (typeof texto !== 'string' || !/[ÃÂ]/.test(texto)) return texto;
  try {
    return decodeURIComponent(escape(texto));
  } catch {
    return texto;
  }
}

export function arreglarPropiedades(geojson) {
  for (const f of geojson.features ?? []) {
    if (!f.properties) continue;
    f.properties = Object.fromEntries(Object.entries(f.properties).map(([k, v]) => [arreglarTexto(k), arreglarTexto(v)]));
  }
  return geojson;
}

const sinAcentos = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Líneas de tren del AMBA. Se buscan en el código de línea, la descripción y
// el nombre: el dataset nacional marca el Tren de la Costa como "Mitre" y un
// ramal del Roca como "Sarmiento", pero el código (IDLINEA) es correcto.
export const LINEAS_TREN = ['Belgrano Norte', 'Belgrano Sur', 'Mitre', 'Roca', 'San Martín', 'Sarmiento', 'Tren de la Costa', 'Urquiza'];

export function lineaTren(props) {
  const campos = ['IDLINEA', 'Descrip', 'Linea', 'linea_2', 'linea', 'name', 'ref'];
  // Primero los nombres más largos, para que "Belgrano Sur" no quede como "Mitre".
  const nombres = [...LINEAS_TREN].sort((a, b) => b.length - a.length);
  for (const campo of campos) {
    const v = props?.[campo];
    if (!v) continue;
    const t = sinAcentos(arreglarTexto(v));
    const encontrada = nombres.find((n) => t.includes(sinAcentos(n)));
    if (encontrada) return encontrada;
  }
  return null;
}

// "PERON, JUAN DOMINGO, TTE. GENERAL" → "Tte. General Juan Domingo Peron".
export function calleDe(props) {
  const v = props?.nombre ?? props?.NOMBRE ?? props?.name;
  if (!v) return null;
  const partes = String(v).split(/\s*,\s*/).filter(Boolean);
  const ordenado = [...partes.slice(1).reverse(), partes[0]].join(' ');
  return ordenado.toLowerCase().replace(/(^|[\s.(/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

// Nombre de una autopista (OpenStreetMap): el nombre, o si no tiene, la
// referencia (p. ej. "AU1").
export function autopistaDe(props) {
  const v = props?.name ?? props?.ref;
  return v ? String(v).trim() : null;
}

export function coincideTexto(texto, buscado) {
  return sinAcentos(texto ?? '').includes(sinAcentos(buscado));
}

// ------------------------------------------------------------------ comunas

// Prepara los polígonos de comunas para consultas rápidas.
export function prepararComunas(geojson) {
  return (geojson.features ?? [])
    .map((f) => {
      const g = f.geometry;
      const poligonos = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      const puntos = poligonos.flat(2);
      const xs = puntos.map((p) => p[0]);
      const ys = puntos.map((p) => p[1]);
      return {
        numero: Number(f.properties?.comuna ?? f.properties?.COMUNA),
        barrios: f.properties?.barrios ?? f.properties?.BARRIOS ?? '',
        poligonos,
        caja: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        feature: f,
      };
    })
    .filter((c) => c.numero && c.poligonos.length)
    .sort((a, b) => a.numero - b.numero);
}

function enComuna([x, y], comuna) {
  const [x0, y0, x1, y1] = comuna.caja;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  // Par/impar sobre todos los anillos de cada polígono (respeta huecos).
  return comuna.poligonos.some((anillos) => anillos.reduce((adentro, anillo) => (dentro([x, y], anillo) ? !adentro : adentro), false));
}

// Grilla de ~50 m sobre la Ciudad: cada celda guarda el número de comuna de
// su centro. Consultar un punto es instantáneo; cerca de un límite el error
// es de media celda (~25 m), suficiente para saber por dónde pasa un
// recorrido. Se arma una sola vez por conjunto de comunas.
const PASO = 0.0005;
const grillas = new WeakMap();

function grillaDe(comunas) {
  let g = grillas.get(comunas);
  if (g) return g;
  // Contornos simplificados (~5 m) para que armar la grilla sea rápido.
  const simples = comunas.map((c) => ({
    ...c,
    poligonos: c.poligonos.map((anillos) => anillos.map((a) => simplificarPuntos(a, 0.00005))),
  }));
  const x0 = Math.min(...comunas.map((c) => c.caja[0]));
  const y0 = Math.min(...comunas.map((c) => c.caja[1]));
  const ancho = Math.ceil((Math.max(...comunas.map((c) => c.caja[2])) - x0) / PASO) + 1;
  const alto = Math.ceil((Math.max(...comunas.map((c) => c.caja[3])) - y0) / PASO) + 1;
  const celdas = new Uint8Array(ancho * alto);
  for (const c of simples) {
    const [cx0, cy0, cx1, cy1] = c.caja;
    for (let j = Math.floor((cy0 - y0) / PASO); j <= Math.ceil((cy1 - y0) / PASO); j++) {
      for (let i = Math.floor((cx0 - x0) / PASO); i <= Math.ceil((cx1 - x0) / PASO); i++) {
        if (i < 0 || j < 0 || i >= ancho || j >= alto || celdas[j * ancho + i]) continue;
        if (enComuna([x0 + (i + 0.5) * PASO, y0 + (j + 0.5) * PASO], c)) celdas[j * ancho + i] = c.numero;
      }
    }
  }
  g = { x0, y0, ancho, alto, celdas };
  grillas.set(comunas, g);
  return g;
}

function comunaEn([x, y], g) {
  const i = Math.floor((x - g.x0) / PASO);
  const j = Math.floor((y - g.y0) / PASO);
  if (i < 0 || j < 0 || i >= g.ancho || j >= g.alto) return 0;
  return g.celdas[j * g.ancho + i];
}

// Números de las comunas por las que pasa un recorrido. Además de los
// vértices, prueba puntos intermedios cada ~25 m para no perder tramos largos
// que cruzan una comuna sin tener un vértice adentro.
export function comunasDe(feature, comunas) {
  const c = feature.geometry?.coordinates;
  if (!c?.length || !comunas.length) return [];
  const g = grillaDe(comunas);
  const tramos = [];
  const juntar = (a) => (typeof a[0][0] === 'number' ? tramos.push(a) : a.forEach(juntar));
  juntar(feature.geometry.type === 'LineString' ? [c] : c);
  const resultado = new Set();
  for (const tramo of tramos) {
    for (let i = 0; i < tramo.length; i++) {
      resultado.add(comunaEn(tramo[i], g));
      const sig = tramo[i + 1];
      if (!sig) continue;
      const pasos = Math.min(400, Math.ceil(Math.hypot(sig[0] - tramo[i][0], sig[1] - tramo[i][1]) / (PASO / 2)));
      for (let k = 1; k < pasos; k++) {
        resultado.add(comunaEn([tramo[i][0] + ((sig[0] - tramo[i][0]) * k) / pasos, tramo[i][1] + ((sig[1] - tramo[i][1]) * k) / pasos], g));
      }
    }
  }
  resultado.delete(0);
  return [...resultado].sort((a, b) => a - b);
}

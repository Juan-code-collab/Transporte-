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

function dentro([x, y], poligono) {
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
export function simplificar(geojson, tolerancia = 0.00002) {
  const t2 = tolerancia * tolerancia;
  const linea = (pts) => {
    if (pts.length < 3) return pts;
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
  };
  for (const f of geojson.features ?? []) {
    const g = f.geometry;
    if (g?.type === 'LineString') g.coordinates = linea(g.coordinates);
    if (g?.type === 'MultiLineString') g.coordinates = g.coordinates.map(linea);
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
  const v = primerCampo(props, CAMPOS_JURISDICCION);
  if (v) {
    const t = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/nac|\bjn\b/.test(t)) return 'nacional';
    if (/ciud|caba|autonoma/.test(t)) return 'ciudad';
    if (/prov|pba/.test(t)) return 'provincial';
    if (/muni/.test(t)) return 'municipal';
  }
  // Sin dato explícito: inferimos por número de línea. En el AMBA, las líneas
  // 1–199 son (o fueron) de jurisdicción nacional; las traspasadas a la Ciudad
  // figuran en LINEAS_JURISDICCION_CIUDAD.
  const linea = lineaDe(props);
  if (linea && /^\d+$/.test(linea)) {
    if (LINEAS_JURISDICCION_CIUDAD.includes(linea)) return 'ciudad';
    if (Number(linea) < 200) return 'nacional';
    return 'provincial';
  }
  return null;
}

export function colorSubte(props) {
  const c = props?.colour ?? props?.color ?? props?.COLOR;
  if (c && /^#?[0-9a-f]{6}$/i.test(c)) return c.startsWith('#') ? c : `#${c}`;
  const linea = lineaDe(props);
  return COLORES_SUBTE[linea] ?? null;
}

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

// Redondea coordenadas a 6 decimales (~10 cm) para achicar los archivos.
export function redondear(geojson, decimales = 6) {
  const f = 10 ** decimales;
  const r = (c) => (typeof c[0] === 'number' ? c.map((n) => Math.round(n * f) / f) : c.map(r));
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
  'linea', 'LINEA', 'Linea', 'lineas', 'LINEAS', 'line', 'LINE', 'ref',
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
  return m ? m[1].toUpperCase() : v;
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

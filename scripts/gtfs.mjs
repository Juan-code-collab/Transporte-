// Lectura de feeds GTFS (horarios y trazados de transporte público) para
// armar capas de recorridos: una línea por servicio y sentido, con el trazado
// (shape) que usan más viajes.

import { unzipSync, strFromU8 } from 'fflate';

// CSV simple con campos entre comillas (como los de GTFS).
export function leerCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else comillas = false;
      } else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      if (fila.length > 1 || fila[0] !== '') filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  const [cabecera, ...resto] = filas;
  const nombres = (cabecera ?? []).map((n) => n.trim().replace(/^﻿/, ''));
  return resto.map((f) => Object.fromEntries(nombres.map((n, i) => [n, (f[i] ?? '').trim()])));
}

// Archivos del .zip (algunos feeds traen otro .zip adentro).
export function abrirZip(datos) {
  let archivos = unzipSync(datos);
  const buscar = (nombre) => Object.keys(archivos).find((k) => k.split('/').pop() === nombre);
  if (!buscar('routes.txt')) {
    const interno = Object.keys(archivos).find((k) => k.endsWith('.zip'));
    if (interno) archivos = unzipSync(archivos[interno]);
  }
  return (nombre) => {
    const k = Object.keys(archivos).find((x) => x.split('/').pop() === nombre);
    return k ? strFromU8(archivos[k]) : null;
  };
}

// GeoJSON con un recorrido por servicio y sentido, para los tipos de ruta
// pedidos (route_type: 1 metro, 2 tren, 3 bus).
export function gtfsAGeojson(leer, tipos) {
  const rutas = new Map(
    leerCsv(leer('routes.txt') ?? '')
      .filter((r) => tipos.includes(Number(r.route_type)))
      .map((r) => [r.route_id, r]),
  );
  // Por cada servicio y sentido, el trazado que usan más viajes.
  const usos = new Map();
  for (const t of leerCsv(leer('trips.txt') ?? '')) {
    if (!rutas.has(t.route_id) || !t.shape_id) continue;
    const clave = `${t.route_id}|${t.direction_id ?? ''}`;
    const cuenta = usos.get(clave) ?? new Map();
    cuenta.set(t.shape_id, (cuenta.get(t.shape_id) ?? 0) + 1);
    usos.set(clave, cuenta);
  }
  const elegidos = new Map(); // shape_id → [route_id, direction_id]
  for (const [clave, cuenta] of usos) {
    const [shape] = [...cuenta].sort((a, b) => b[1] - a[1])[0];
    elegidos.set(shape, clave.split('|'));
  }
  // Puntos de esos trazados, en orden.
  const puntos = new Map();
  for (const p of leerCsv(leer('shapes.txt') ?? '')) {
    if (!elegidos.has(p.shape_id)) continue;
    const lista = puntos.get(p.shape_id) ?? [];
    lista.push([Number(p.shape_pt_sequence), Number(p.shape_pt_lon), Number(p.shape_pt_lat)]);
    puntos.set(p.shape_id, lista);
  }
  const features = [];
  for (const [shape, [routeId, sentido]] of elegidos) {
    const coords = (puntos.get(shape) ?? []).sort((a, b) => a[0] - b[0]).map(([, x, y]) => [x, y]);
    if (coords.length < 2) continue;
    const r = rutas.get(routeId);
    features.push({
      type: 'Feature',
      properties: {
        servicio: r.route_short_name || r.route_id,
        nombre: r.route_long_name || '',
        ...(sentido !== '' ? { sentido: sentido === '0' ? 'Ida' : 'Regreso' } : {}),
        ...(/^[0-9a-f]{6}$/i.test(r.route_color ?? '') ? { color: `#${r.route_color.toLowerCase()}` } : {}),
        ...(r.agency_id ? { agencia: r.agency_id } : {}),
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
  return { type: 'FeatureCollection', features };
}

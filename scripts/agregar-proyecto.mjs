#!/usr/bin/env node
// Convierte un shapefile de líneas (.shp) a GeoJSON y lo suma a la capa
// "Proyectos" (public/proyectos/proyectos.geojson).
//
// Uso:
//   npm run proyecto -- archivo.shp --nombre "Línea F" [--color "#8e44ad"]
//
// Coordenadas: si el archivo ya está en lon/lat se usa tal cual; si está en
// metros alrededor de 100.000 se asume Gauss-Krüger Buenos Aires (GKBA), el
// sistema que usa el GCBA. Si viene un .prj al lado, no se lee: revisar que el
// resultado caiga donde corresponde.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import proj4 from 'proj4';
import { redondear } from '../src/geo.js';

const DESTINO = fileURLToPath(new URL('../public/proyectos/proyectos.geojson', import.meta.url));

// GKBA del GCBA sobre POSGAR (equivalente a WGS84 a esta escala). Con la
// variante vieja sobre Campo Inchauspe la traza de la Línea F quedaba ~50 m
// corrida de Av. Entre Ríos/Callao.
const GKBA =
  '+proj=tmerc +lat_0=-34.629269 +lon_0=-58.4633 +k=0.9999980 +x_0=100000 +y_0=100000 ' +
  '+ellps=WGS84 +units=m +no_defs';

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

// Lee las polilíneas de un .shp (tipos 3, 13 y 23). Devuelve [[ [x, y], ... ], ...].
export function leerShp(buffer) {
  const dv = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (dv.getInt32(0) !== 9994) throw new Error('no es un shapefile (.shp)');
  const tramos = [];
  let off = 100;
  while (off + 8 <= buffer.byteLength) {
    const largo = dv.getInt32(off + 4) * 2;
    const r = off + 8;
    const tipo = dv.getInt32(r, true);
    if ([3, 13, 23].includes(tipo)) {
      const partes = dv.getInt32(r + 36, true);
      const puntos = dv.getInt32(r + 40, true);
      const inicios = [];
      for (let i = 0; i < partes; i++) inicios.push(dv.getInt32(r + 44 + 4 * i, true));
      const base = r + 44 + 4 * partes;
      for (let p = 0; p < partes; p++) {
        const fin = p + 1 < partes ? inicios[p + 1] : puntos;
        const tramo = [];
        for (let i = inicios[p]; i < fin; i++) {
          tramo.push([dv.getFloat64(base + 16 * i, true), dv.getFloat64(base + 16 * i + 8, true)]);
        }
        if (tramo.length > 1) tramos.push(tramo);
      }
    } else if (tipo !== 0) {
      throw new Error(`tipo de geometría ${tipo} no soportado (sólo líneas)`);
    }
    off = r + largo;
  }
  return tramos;
}

export function aLonLat(tramos) {
  const [x, y] = tramos[0][0];
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return tramos;
  if (x > 80000 && x < 130000 && y > 80000 && y < 130000) {
    const a = proj4(GKBA, 'WGS84');
    return tramos.map((t) => t.map((p) => a.forward(p)));
  }
  throw new Error(`no reconozco el sistema de coordenadas (primer punto: ${x}, ${y})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const archivo = process.argv[2];
  const nombre = argumento('nombre');
  if (!archivo || !nombre) {
    console.error('Uso: npm run proyecto -- archivo.shp --nombre "Nombre" [--color "#rrggbb"]');
    process.exit(1);
  }
  const tramos = aLonLat(leerShp(await readFile(archivo)));
  const feature = {
    type: 'Feature',
    properties: { nombre, ...(argumento('color') ? { color: argumento('color') } : {}) },
    geometry: { type: 'MultiLineString', coordinates: tramos },
  };
  await mkdir(dirname(DESTINO), { recursive: true });
  const actual = await readFile(DESTINO, 'utf8').then(JSON.parse, () => ({ type: 'FeatureCollection', features: [] }));
  // Si ya existe un proyecto con ese nombre, se reemplaza.
  actual.features = actual.features.filter((f) => f.properties.nombre !== nombre).concat(feature);
  await writeFile(DESTINO, `${JSON.stringify(redondear(actual))}\n`);
  console.log(`✓ "${nombre}": ${tramos.length} tramo(s), ${tramos.flat().length} puntos → ${DESTINO}`);
}

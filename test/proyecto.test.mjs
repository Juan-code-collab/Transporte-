import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aLonLat, leerShp } from '../scripts/agregar-proyecto.mjs';

// Arma un .shp mínimo con una polilínea de una parte.
function shp(puntos) {
  const contenido = 44 + 4 + 16 * puntos.length;
  const b = Buffer.alloc(100 + 8 + contenido);
  b.writeInt32BE(9994, 0);
  b.writeInt32BE(b.length / 2, 24);
  b.writeInt32LE(1000, 28);
  b.writeInt32LE(3, 32);
  b.writeInt32BE(1, 100);
  b.writeInt32BE(contenido / 2, 104);
  const r = 108;
  b.writeInt32LE(3, r);
  b.writeInt32LE(1, r + 36);
  b.writeInt32LE(puntos.length, r + 40);
  b.writeInt32LE(0, r + 44);
  puntos.forEach(([x, y], i) => {
    b.writeDoubleLE(x, r + 48 + 16 * i);
    b.writeDoubleLE(y, r + 56 + 16 * i);
  });
  return b;
}

test('leerShp lee polilíneas y aLonLat deja lon/lat tal cual', () => {
  const tramos = aLonLat(leerShp(shp([[-58.4, -34.6], [-58.41, -34.61]])));
  assert.deepEqual(tramos, [[[-58.4, -34.6], [-58.41, -34.61]]]);
});

test('aLonLat convierte GKBA: el origen cae en el centro de la Ciudad', () => {
  const [[[lon, lat]]] = aLonLat(leerShp(shp([[100000, 100000], [100100, 100100]])));
  assert.ok(Math.abs(lon + 58.4633) < 1e-4 && Math.abs(lat + 34.629269) < 1e-4, `${lon}, ${lat}`);
});

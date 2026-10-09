import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorSubte, esWgs84, jurisdiccionDe, lineaDe, overpassAGeojson, redondear, soloLineas } from '../src/geo.js';

test('overpassAGeojson convierte vías y relaciones, ignorando paradas', () => {
  const geo = overpassAGeojson({
    elements: [
      { type: 'way', id: 1, tags: { highway: 'motorway' }, geometry: [{ lat: -34.6, lon: -58.4 }, { lat: -34.61, lon: -58.41 }] },
      {
        type: 'relation',
        id: 2,
        tags: { route: 'subway', ref: 'A' },
        members: [
          { type: 'node', role: 'stop', lat: -34.6, lon: -58.4 },
          { type: 'way', role: 'platform', geometry: [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }] },
          { type: 'way', role: '', geometry: [{ lat: -34.6, lon: -58.4 }, { lat: -34.62, lon: -58.42 }] },
        ],
      },
      { type: 'node', id: 3, lat: -34.6, lon: -58.4 },
    ],
  });
  assert.equal(geo.features.length, 2);
  assert.deepEqual(geo.features[0].geometry, { type: 'LineString', coordinates: [[-58.4, -34.6], [-58.41, -34.61]] });
  assert.equal(geo.features[1].geometry.type, 'MultiLineString');
  assert.equal(geo.features[1].geometry.coordinates.length, 1);
  assert.equal(geo.features[1].properties.ref, 'A');
});

test('lineaDe normaliza distintos formatos', () => {
  assert.equal(lineaDe({ linea: 'Línea 60' }), '60');
  assert.equal(lineaDe({ LINEA: 152 }), '152');
  assert.equal(lineaDe({ ref: 'H' }), 'H');
  assert.equal(lineaDe({}), null);
});

test('jurisdiccionDe usa el campo explícito y si no infiere por número', () => {
  assert.equal(jurisdiccionDe({ linea: '60', jurisdiccion: 'Nacional' }), 'nacional');
  assert.equal(jurisdiccionDe({ linea: '60', JURISDICCION: 'Ciudad Autónoma' }), 'ciudad');
  assert.equal(jurisdiccionDe({ linea: '7' }), 'ciudad');
  assert.equal(jurisdiccionDe({ linea: '60' }), 'nacional');
  assert.equal(jurisdiccionDe({ linea: '338' }), 'provincial');
});

test('colorSubte prioriza el color del dato y si no usa el oficial', () => {
  assert.equal(colorSubte({ colour: '#123456', ref: 'A' }), '#123456');
  assert.equal(colorSubte({ linea: 'B' }), '#eb0909');
});

test('esWgs84 detecta coordenadas planas', () => {
  const punto = (c) => ({ features: [{ geometry: { type: 'LineString', coordinates: [c, c] } }] });
  assert.equal(esWgs84(punto([-58.4, -34.6])), true);
  assert.equal(esWgs84(punto([102000, 98000])), false);
});

test('redondear recorta decimales en geometrías anidadas', () => {
  const geo = redondear({ features: [{ geometry: { coordinates: [[[-58.123456789, -34.987654321]]] } }] });
  assert.deepEqual(geo.features[0].geometry.coordinates, [[[-58.123457, -34.987654]]]);
});

test('soloLineas descarta puntos (p. ej. estaciones)', () => {
  const geo = soloLineas({
    type: 'FeatureCollection',
    features: [
      { geometry: { type: 'Point', coordinates: [-58.4, -34.6] } },
      { geometry: { type: 'MultiLineString', coordinates: [[[-58.4, -34.6], [-58.5, -34.7]]] } },
    ],
  });
  assert.equal(geo.features.length, 1);
});

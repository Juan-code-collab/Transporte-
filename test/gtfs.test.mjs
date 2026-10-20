import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gtfsAGeojson, leerCsv } from '../scripts/gtfs.mjs';

test('leerCsv entiende comillas, BOM y fin de línea de Windows', () => {
  const filas = leerCsv('﻿a,b\r\n"x, y","dijo ""hola"""\r\n1,2');
  assert.deepEqual(filas, [{ a: 'x, y', b: 'dijo "hola"' }, { a: '1', b: '2' }]);
});

test('gtfsAGeojson arma un recorrido por servicio y sentido con el trazado más usado', () => {
  const archivos = {
    'routes.txt': 'route_id,route_short_name,route_long_name,route_type,route_color\nL1,L1,San Pablo - Los Dominicos,1,E1251B\n210,210,Estación Central - Puente Alto,3,\n',
    'trips.txt': 'route_id,trip_id,direction_id,shape_id\nL1,t1,0,s1\nL1,t2,0,s1\nL1,t3,0,s2\n210,t4,1,s3\n',
    'shapes.txt': 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\ns1,-33.4,-70.6,2\ns1,-33.5,-70.7,1\ns2,0,0,1\ns2,1,1,2\ns3,-33.6,-70.6,1\ns3,-33.61,-70.61,2\n',
  };
  const leer = (n) => archivos[n] ?? null;
  const metro = gtfsAGeojson(leer, [1]);
  assert.equal(metro.features.length, 1);
  assert.deepEqual(metro.features[0].properties, { servicio: 'L1', nombre: 'San Pablo - Los Dominicos', sentido: 'Ida', color: '#e1251b' });
  assert.deepEqual(metro.features[0].geometry.coordinates, [[-70.7, -33.5], [-70.6, -33.4]]);
  const buses = gtfsAGeojson(leer, [3]);
  assert.equal(buses.features[0].properties.sentido, 'Regreso');
  assert.equal(buses.features[0].properties.color, undefined);
});

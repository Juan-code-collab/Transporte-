// Configuración de las capas del mapa. La usan tanto la app (navegador) como
// el script de descarga (Node), por eso no depende del DOM ni de Leaflet.
//
// Cada capa se intenta obtener, en orden:
//   1. `ckan`: dataset del portal de datos abiertos de la Ciudad
//      (data.buenosaires.gob.ar). Se busca, dentro del dataset, el primer
//      recurso GeoJSON cuyo nombre o URL coincida con `recurso`.
//   2. `overpass`: consulta a OpenStreetMap vía Overpass API, como respaldo o
//      cuando el Gobierno no publica la geometría (p. ej. autopistas).

export const CKAN_API = 'https://data.buenosaires.gob.ar/api/3/action/package_show';
// Servidores públicos de Overpass: si uno está saturado (504), se prueba el siguiente.
export const OVERPASS_APIS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Área de la Ciudad Autónoma de Buenos Aires en OpenStreetMap.
const AREA_CABA =
  'area["boundary"="administrative"]["admin_level"="4"]["name"="Ciudad Autónoma de Buenos Aires"]->.caba;';

export function consultaOverpass(cuerpo) {
  return `[out:json][timeout:300];\n${AREA_CABA}\n(\n${cuerpo}\n);\nout geom;`;
}

// Colores oficiales de las líneas de subte (respaldo si el dato no trae color).
export const COLORES_SUBTE = {
  A: '#18cccc',
  B: '#eb0909',
  C: '#233aa8',
  D: '#02db2e',
  E: '#c618cc',
  H: '#ffdd00',
  P: '#ffa500', // Premetro
};

// Líneas de colectivo bajo jurisdicción de la Ciudad (traspasadas desde Nación
// en 2019). Sólo se usa cuando el dato no trae un campo de jurisdicción.
// Verificar contra la fuente oficial: la lista puede cambiar.
export const LINEAS_JURISDICCION_CIUDAD = [
  '4', '6', '7', '12', '25', '26', '34', '39', '42', '44', '47', '49', '50',
  '64', '65', '68', '76', '84', '90', '99', '102', '106', '107', '108', '109',
  '115', '118', '132', '146', '151', '158',
];

export const CAPAS = [
  {
    id: 'subte',
    nombre: 'Subte y Premetro',
    color: '#233aa8',
    grosor: 5,
    visible: true,
    ckan: { dataset: 'subte-estaciones', recurso: /l[ií]nea/i },
    overpass: consultaOverpass(
      [
        'relation["route"="subway"](area.caba);',
        'relation["route"="light_rail"](area.caba);',
        'relation["route"="tram"](area.caba);',
      ].join('\n'),
    ),
  },
  {
    id: 'trenes',
    nombre: 'Trenes',
    color: '#5a3e1b',
    grosor: 4,
    visible: true,
    ckan: { dataset: 'estaciones-ferrocarril', recurso: /red|l[ií]nea|recorrido/i },
    overpass: consultaOverpass('relation["route"="train"](area.caba);'),
  },
  {
    id: 'colectivos',
    nombre: 'Colectivos',
    color: '#e67e22',
    grosor: 2,
    visible: false, // es la capa más pesada; se activa a demanda
    ckan: { dataset: 'colectivos-recorridos', recurso: /recorrido/i },
    overpass: consultaOverpass('relation["route"="bus"](area.caba);'),
  },
  {
    id: 'autopistas',
    nombre: 'Autopistas',
    color: '#7f8c8d',
    grosor: 5,
    visible: true,
    // El portal de la Ciudad no publica el trazado de autopistas como GeoJSON,
    // así que se toma de OpenStreetMap.
    overpass: consultaOverpass(
      [
        'way["highway"="motorway"](area.caba);',
        'way["highway"="trunk"]["motorroad"="yes"](area.caba);',
      ].join('\n'),
    ),
  },
  {
    id: 'ciclovias',
    nombre: 'Ciclovías',
    color: '#27ae60',
    grosor: 3,
    visible: true,
    ckan: { dataset: 'ciclovias', recurso: /ciclov/i },
    overpass: consultaOverpass(
      [
        'way["highway"="cycleway"](area.caba);',
        'way["cycleway"~"^(lane|track)$"](area.caba);',
        'way["cycleway:left"~"^(lane|track)$"](area.caba);',
        'way["cycleway:right"~"^(lane|track)$"](area.caba);',
        'way["cycleway:both"~"^(lane|track)$"](area.caba);',
      ].join('\n'),
    ),
  },
];

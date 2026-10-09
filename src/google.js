// Mapas base de Google vía Map Tiles API (servicio oficial; requiere clave).
// La clave se toma de VITE_GOOGLE_MAPS_API_KEY al compilar. Sin clave, la app
// no ofrece estas capas.
//
// Documentación: https://developers.google.com/maps/documentation/tile/2d-tiles-overview

import L from 'leaflet';

const CLAVE = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const API = 'https://tile.googleapis.com';
const LOGO = 'https://developers.google.com/static/maps/documentation/images/google_on_white.png';

export const hayGoogle = Boolean(CLAVE);

async function crearSesion(mapType) {
  const r = await fetch(`${API}/v1/createSession?key=${CLAVE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType,
      language: 'es-AR',
      region: 'AR',
      ...(mapType === 'satellite' ? { layerTypes: ['layerRoadmap'] } : {}),
    }),
  });
  if (!r.ok) throw new Error(`Google Map Tiles respondió ${r.status}`);
  return (await r.json()).session;
}

// Devuelve { 'Google Maps': capa, 'Google Satélite': capa }, o {} si no hay
// clave o Google rechaza la sesión (clave inválida, API no habilitada, etc.).
export async function capasGoogle(mapa) {
  if (!hayGoogle) return {};
  const tipos = { 'Google Maps': 'roadmap', 'Google Satélite': 'satellite' };
  const capas = {};
  for (const [nombre, tipo] of Object.entries(tipos)) {
    try {
      const sesion = await crearSesion(tipo);
      const capa = L.tileLayer(`${API}/v1/2dtiles/{z}/{x}/{y}?session=${sesion}&key=${CLAVE}`, {
        maxZoom: 22,
        attribution: `<img src="${LOGO}" alt="Google" height="12" style="vertical-align:middle">`,
      });
      capa.sesion = sesion;
      capas[nombre] = capa;
    } catch (e) {
      console.warn(`${nombre} no disponible: ${e.message}`);
    }
  }
  if (Object.keys(capas).length) mantenerCopyright(mapa, Object.values(capas));
  return capas;
}

// Google exige mostrar el copyright de los datos del área visible.
function mantenerCopyright(mapa, capas) {
  let actual = '';
  const actualizar = async () => {
    const activa = capas.find((c) => mapa.hasLayer(c));
    let texto = '';
    if (activa) {
      const b = mapa.getBounds();
      const params = new URLSearchParams({
        session: activa.sesion,
        key: CLAVE,
        zoom: mapa.getZoom(),
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
      try {
        const r = await fetch(`${API}/tile/v1/viewport?${params}`);
        if (r.ok) texto = (await r.json()).copyright ?? '';
      } catch {
        // sin copyright actualizado: se deja el anterior
        return;
      }
    }
    if (texto === actual) return;
    if (actual) mapa.attributionControl.removeAttribution(actual);
    if (texto) mapa.attributionControl.addAttribution(texto);
    actual = texto;
  };
  mapa.on('moveend', actualizar);
  for (const c of capas) c.on('add remove', () => setTimeout(actualizar));
}

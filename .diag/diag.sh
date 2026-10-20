set -x
UA='transporte-caba/0.1 (mapa de transporte)'
for u in https://www.dtpm.cl/index.php/gtfs-vigente https://www.dtpm.cl/index.php/noticias/gtfs-vigente https://www.dtpm.cl/index.php/sistema-transporte-publico-santiago/gtfs-vigente; do
  curl -sSL -A "$UA" -m 60 "$u" -o pag.html -w "%{http_code} %{size_download}\n" || true
  grep -oiE 'href="[^"]*(gtfs|GTFS)[^"]*"' pag.html | sort -u | head -20
done
curl -sS "https://transit.land/api/v2/rest/feeds?search=santiago&apikey=" -m 30 | head -c 600; echo
# Transitland atlas (repositorio público) para el feed de DTPM
curl -sSL -m 30 https://raw.githubusercontent.com/transitland/transitland-atlas/main/feeds/dtpm.cl.dmfr.json | head -c 1500; echo

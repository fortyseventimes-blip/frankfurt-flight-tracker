const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const FRA = { lat: 50.0379, lon: 8.5622 };
const CACHE_MS = 10000;
const UPSTREAM = 'https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{dist}';
const GRID = (process.env.ADSB_GLOBAL_GRID || '-45:-150,-45:-90,-45:-30,-45:30,-45:90,-45:150,0:-150,0:-90,0:-30,0:30,0:90,0:150,45:-150,45:-90,45:-30,45:30,45:90,45:150')
  .split(',').map(pair => pair.split(':').map(Number));
let cache = { expires: 0, aircraft: [], updatedAt: null, errors: 0 };
let refreshPromise = null;
const DEMO_AIRCRAFT = [
  { hex: 'demo-fra', flight: 'FRA001', lat: 50.04, lon: 8.56, alt_baro: 36000, gs: 440, track: 82, category: 'A3' },
  { hex: 'demo-nyc', flight: 'NYC742', lat: 40.71, lon: -74.0, alt_baro: 38000, gs: 480, track: 95, category: 'A3' },
  { hex: 'demo-syd', flight: 'SYD118', lat: -33.87, lon: 151.2, alt_baro: 34000, gs: 460, track: 270, category: 'A3' },
  { hex: 'demo-tok', flight: 'TOK220', lat: 35.68, lon: 139.69, alt_baro: 32000, gs: 420, track: 180, category: 'A3' },
  { hex: 'demo-cap', flight: 'CAP404', lat: -33.92, lon: 18.42, alt_baro: 28000, gs: 390, track: 10, category: 'A3' },
  { hex: 'demo-sao', flight: 'SAO515', lat: -23.55, lon: -46.63, alt_baro: 30000, gs: 410, track: 220, category: 'A3' }
];

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function normalizeHeading(value) { return (number(value, 0) % 360 + 360) % 360; }
function normalizeView(query) {
  const hasLocation = Number.isFinite(Number(query.lat)) && Number.isFinite(Number(query.lon));
  return {
    center: {
      lat: clamp(number(query.lat, FRA.lat), -85, 85),
      lon: clamp(number(query.lon, FRA.lon), -180, 180)
    },
    heading: normalizeHeading(query.heading),
    zoom: Math.round(clamp(number(query.zoom, 1), 1, 8)),
    hasLocation
  };
}
function deduplicate(aircraft) {
  const unique = new Map();
  for (const item of aircraft) {
    if (item.lat == null || item.lon == null || !Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lon))) continue;
    const key = String(item.hex || item.flight || `${item.lat}:${item.lon}`).trim().toLowerCase();
    if (!unique.has(key)) unique.set(key, { ...item, lat: Number(item.lat), lon: Number(item.lon), hex: key });
  }
  return [...unique.values()];
}
function clusterAircraft(aircraft, zoom) {
  const cellLon = Math.max(2, 36 / 2 ** zoom);
  const cellLat = Math.max(2, 18 / 2 ** zoom);
  const groups = new Map();
  for (const item of aircraft) {
    const x = Math.floor((item.lon + 180) / cellLon);
    const y = Math.floor((item.lat + 90) / cellLat);
    const key = `${x}:${y}`;
    const group = groups.get(key) || { lat: 0, lon: 0, count: 0, aircraft: [] };
    group.lat += item.lat; group.lon += item.lon; group.count += 1;
    if (zoom >= 4) group.aircraft.push(item);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({
    lat: group.lat / group.count,
    lon: group.lon / group.count,
    count: group.count,
    hexes: group.aircraft.map(item => item.hex)
  }));
}
async function fetchRegion(lat, lon, dist = 250) {
  const url = UPSTREAM.replace('{lat}', lat).replace('{lon}', lon).replace('{dist}', dist);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`upstream ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.ac) ? data.ac : [];
  } finally { clearTimeout(timer); }
}
async function getAircraft() {
  if (process.env.RADAR_DEMO === '1') return { expires: Date.now() + CACHE_MS, aircraft: DEMO_AIRCRAFT, updatedAt: new Date().toISOString(), errors: 0 };
  if (cache.expires > Date.now()) return cache;
  if (refreshPromise) return refreshPromise;
  refreshPromise = Promise.allSettled(GRID.map(([lat, lon]) => fetchRegion(lat, lon)))
    .then(results => {
      const successful = results.filter(result => result.status === 'fulfilled');
      const aircraft = deduplicate(successful.flatMap(result => result.value));
      if (aircraft.length || !cache.aircraft.length) {
        cache = { expires: Date.now() + CACHE_MS, aircraft, updatedAt: new Date().toISOString(), errors: results.length - successful.length };
      } else cache.expires = Date.now() + 3000;
      return cache;
    }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
function radarPayload(view, snapshot) {
  const clusters = clusterAircraft(snapshot.aircraft, view.zoom);
  return {
    center: view.center,
    heading: view.heading,
    zoom: view.zoom,
    aircraft: view.zoom >= 4 ? snapshot.aircraft : [],
    clusters,
    updatedAt: snapshot.updatedAt,
    source: 'adsb.lol',
    stale: snapshot.errors > 0,
    upstreamErrors: snapshot.errors
  };
}
function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  response.end(JSON.stringify(body));
}
function serveStatic(request, response) {
  const requested = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return sendJson(response, 404, { error: 'Not found' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
  response.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}
const server = http.createServer(async (request, response) => {
  if (request.url.startsWith('/api/radar')) {
    try { sendJson(response, 200, radarPayload(normalizeView(Object.fromEntries(new URL(request.url, `http://${request.headers.host}`).searchParams)), await getAircraft())); }
    catch (error) { sendJson(response, 502, { error: 'Radar feed unavailable', detail: error.message }); }
    return;
  }
  serveStatic(request, response);
});
if (require.main === module) server.listen(PORT, () => console.log(`Global radar listening on http://localhost:${PORT}`));
module.exports = { FRA, clamp, normalizeHeading, normalizeView, deduplicate, clusterAircraft, radarPayload };

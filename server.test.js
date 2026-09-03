const test = require('node:test');
const assert = require('node:assert/strict');
const { FRA, normalizeHeading, normalizeView, deduplicate, clusterAircraft, radarPayload } = require('./server');

test('normalizes view coordinates, zoom and heading', () => {
  const view = normalizeView({ lat: 91, lon: -200, zoom: 99, heading: -45 });
  assert.deepEqual(view.center, { lat: 85, lon: -180 });
  assert.equal(view.zoom, 8);
  assert.equal(view.heading, 315);
});
test('falls back to FRA when no user position is supplied', () => {
  assert.deepEqual(normalizeView({}).center, FRA);
  assert.equal(normalizeView({}).hasLocation, false);
});
test('deduplicates aircraft by hex and ignores invalid positions', () => {
  const result = deduplicate([{ hex: 'ABC', lat: 1, lon: 2 }, { hex: 'abc', lat: 3, lon: 4 }, { hex: 'bad', lat: null, lon: 4 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].hex, 'abc');
});
test('clusters aircraft at global zoom and exposes individual hexes when close', () => {
  const aircraft = [{ hex: 'a', lat: 50, lon: 8 }, { hex: 'b', lat: 50.1, lon: 8.1 }, { hex: 'c', lat: -30, lon: 140 }];
  const low = clusterAircraft(aircraft, 1);
  assert.equal(low.reduce((sum, cluster) => sum + cluster.count, 0), 3);
  assert.equal(low.every(cluster => cluster.hexes.length === 0), true);
  const high = clusterAircraft(aircraft, 8);
  assert.equal(high.reduce((sum, cluster) => sum + cluster.count, 0), 3);
  assert.equal(high.some(cluster => cluster.hexes.includes('a')), true);
});
test('returns backend-owned map state and clustered data', () => {
  const payload = radarPayload(normalizeView({ lat: 10, lon: 20, zoom: 2, heading: 123 }), { aircraft: [{ hex: 'a', lat: 10, lon: 20 }], updatedAt: 'now', errors: 0 });
  assert.deepEqual(payload.center, { lat: 10, lon: 20 });
  assert.equal(payload.heading, 123);
  assert.equal(payload.aircraft.length, 0);
  assert.equal(payload.clusters[0].count, 1);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const routeGeo = JSON.parse(html.match(/const routeGeo = (\{.*?\});/)[1]);
const drive = routeGeo.coordinates.map(c => [c[1], c[0]]);

const sandbox = { setTimeout, clearTimeout, URL, URLSearchParams };
vm.runInNewContext(fs.readFileSync(new URL("../gas-prices.js", import.meta.url), "utf8"), sandbox);
const Feed = sandbox.CoastalPriceFeed;
assert.ok(Feed, "CoastalPriceFeed exports");

function fullBox(latLngs) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  latLngs.forEach(p => {
    minLat = Math.min(minLat, p[0]);
    maxLat = Math.max(maxLat, p[0]);
    minLon = Math.min(minLon, p[1]);
    maxLon = Math.max(maxLon, p[1]);
  });
  const pad = Feed.PRICE_PAD;
  return [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad];
}

function spans(box) {
  const q = box.map(n => Number(Number(n).toFixed(4)));
  return { lon: q[2] - q[0], lat: q[3] - q[1], q };
}

function covers(box, lat, lon) {
  return lon >= box[0] - 1e-9 && lon <= box[2] + 1e-9 && lat >= box[1] - 1e-9 && lat <= box[3] + 1e-9;
}

const routeBox = fullBox(drive);
const routeSpan = spans(routeBox);
assert.ok(routeSpan.lat > 8, "fixture is the full coastal route (lat)");
assert.ok(routeSpan.lon > 7.5, "fixture is the full coastal route (lon)");

assert.equal(Feed.PRICE_MAX_SPAN, 1.5);
assert.equal(Feed.PRICE_FETCH_CONCURRENCY, 2);
assert.equal(Feed.PRICE_MAX_REQUESTS, 15);
assert.equal(Feed.PRICE_FAILURE_BUDGET, 3);
assert.ok(Feed.PRICE_CACHE_TTL_MS >= 30 * 60 * 1000 && Feed.PRICE_CACHE_TTL_MS <= 60 * 60 * 1000);
assert.ok(Feed.PRICE_MAX_SPAN <= 1.5, "every price tile stays at or under 1.5°");
const maxRequestSpan = Feed.PRICE_MAX_SPAN + 0.01;

const tiles = Feed.boxesAlongRoute(drive);
assert.ok(tiles.length > 2, "full route produces multiple small price tiles");
tiles.forEach((box, i) => {
  const s = spans(box);
  assert.ok(s.lon <= maxRequestSpan, "tile " + i + " lon " + s.lon);
  assert.ok(s.lat <= maxRequestSpan, "tile " + i + " lat " + s.lat);
  assert.ok(s.lon <= Feed.PRICE_MAX_SPAN + 1e-6, "tile " + i + " lon " + s.lon + " exceeds " + Feed.PRICE_MAX_SPAN);
  assert.ok(s.lat <= Feed.PRICE_MAX_SPAN + 1e-6, "tile " + i + " lat " + s.lat + " exceeds " + Feed.PRICE_MAX_SPAN);
  assert.ok(s.lon < routeSpan.lon - 0.5 || s.lat < routeSpan.lat - 0.5, "tile " + i + " is not the full route box");
});

let uncovered = 0;
for (let i = 0; i < drive.length; i++) {
  if (!tiles.some(box => covers(box, drive[i][0], drive[i][1]))) uncovered++;
}
assert.equal(uncovered, 0, "every route vertex is inside a price tile");

let offsetMiss = 0;
for (let i = 0; i < drive.length; i += 400) {
  for (const [dLat, dLon] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
    const lat = drive[i][0] + dLat;
    const lon = drive[i][1] + dLon;
    if (!tiles.some(box => covers(box, lat, lon))) offsetMiss++;
  }
}
assert.equal(offsetMiss, 0, "points within the 0.3° pad stay inside a tile");

const grid = Feed.boxesFromBbox(routeBox);
assert.ok(grid.length >= 2);
grid.forEach(box => {
  const s = spans(box);
  assert.ok(s.lon <= Feed.PRICE_MAX_SPAN + 1e-6);
  assert.ok(s.lat <= Feed.PRICE_MAX_SPAN + 1e-6);
});
assert.ok(covers(grid[0], routeBox[1], routeBox[0]));
assert.ok(grid.some(box => covers(box, routeBox[3], routeBox[2])));

const tiny = Feed.boxesAlongRoute([[28, -82.5], [28.2, -82.2], [28.4, -81.9]]);
assert.equal(tiny.length, 1);

const jump = Feed.boxesAlongRoute([[27.9, -82.8], [35.9, -75.5]]);
assert.ok(jump.length >= 2);
jump.forEach(box => {
  const s = spans(box);
  assert.ok(s.lon <= maxRequestSpan && s.lat <= maxRequestSpan);
});
const midLat = (27.9 + 35.9) / 2;
const midLon = (-82.8 + -75.5) / 2;
assert.ok(jump.some(box => covers(box, midLat, midLon)), "a long sparse leg is still covered");

const duped = Feed.dedupePriceStations([
  { lat: 28.1, lon: -82.1, regular: 3.11, updated: "2026-09-23T00:00:00Z", name: "Old" },
  { lat: 28.10001, lon: -82.10001, regular: 3.49, updated: "2026-09-24T12:00:00Z", name: "New" }
]);
assert.equal(duped.length, 1);
assert.equal(duped[0].regular, 3.49);

assert.equal(
  Feed.priceUrl("https://gas.here2serve.us/gas", [-82, 27, -81, 28]),
  "https://gas.here2serve.us/gas?bbox=-82.0000,27.0000,-81.0000,28.0000&grade=regular"
);
assert.ok(Feed.priceUrl("https://pack.here2serve.us/gas/", [-82, 27, -81, 28]).startsWith("https://pack.here2serve.us/gas/?bbox="));
assert.ok(Feed.priceUrl("https://example.test/gas?x=1", [-82, 27, -81, 28]).includes("&bbox="));

function normalize(s) {
  const n = typeof s.regular === "string" ? parseFloat(s.regular) : s.regular;
  if (!Number.isFinite(n) || n <= 0 || n > 12) return null;
  return Object.assign({}, s, { regular: n });
}

const calls = [];
let inflight = 0;
let maxInflight = 0;
const loaded = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async (url) => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    calls.push(url);
    await new Promise(r => setTimeout(r, 15));
    inflight -= 1;
    const bbox = new URL(url).searchParams.get("bbox").split(",").map(Number);
    assert.ok(bbox[2] - bbox[0] <= maxRequestSpan);
    assert.ok(bbox[3] - bbox[1] <= maxRequestSpan);
    return {
      stations: [
        { name: "Priced", lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2, regular: "3.459", updated: "2026-09-24T00:00:00Z" },
        { name: "Blank", lat: bbox[1], lon: bbox[0], regular: null },
        { name: "Absurd", lat: bbox[3], lon: bbox[2], regular: 40 }
      ],
      meta: { cellErrors: 0 }
    };
  }
});
assert.ok(maxInflight >= 2 && maxInflight <= Feed.PRICE_FETCH_CONCURRENCY, "price tiles stay at or under " + Feed.PRICE_FETCH_CONCURRENCY + " in flight (saw " + maxInflight + ")");
assert.ok(calls.length >= 2);
assert.equal(loaded.stations.length, calls.length);
assert.ok(loaded.stations.every(s => s.regular === 3.459 && s.name === "Priced"));
assert.equal(Feed.priceFailureNote(loaded), "");
const loadedSummary = Feed.priceUpdateSummary(loaded, Date.parse("2026-09-24T01:30:00Z"));
assert.equal(loadedSummary.ok, true);
assert.equal(loadedSummary.priced, loaded.stations.length);
assert.equal(loadedSummary.newest, Date.parse("2026-09-24T00:00:00Z"));
assert.equal(loadedSummary.text, "");
const fullQuery = routeBox.map(n => n.toFixed(4)).join(",");
assert.ok(calls.every(url => !url.includes("bbox=" + fullQuery)), "no request uses the full-route bbox");

const failed = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas/",
  normalize,
  fetcher: async () => { throw new Error("Price feed HTTP 404"); }
});
assert.equal(failed.stations.length, 0);
assert.equal(Feed.priceFailureNote(failed), "Price feed HTTP 404.");

let partialCalls = 0;
const partial = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async () => {
    partialCalls++;
    if (partialCalls === 1) throw new Error("Price feed HTTP 404");
    return { stations: [{ name: "Ok", lat: 32.5, lon: -80.3, regular: 3.2, updated: "2026-09-24T00:00:00Z" }] };
  }
});
assert.equal(partial.partial, true);
assert.equal(partial.stations.length, 1);
assert.equal(partial.stations[0].regular, 3.2);
assert.equal(Feed.priceFailureNote(partial), "Some live pump prices did not load.");

let upstreamCalls = 0;
const upstream = await Feed.fetchTiledPrices([[28, -82], [28.2, -81.8]], {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async () => {
    upstreamCalls++;
    return { stations: [], meta: { cellErrors: 3 } };
  }
});
assert.equal(upstreamCalls, 1, "an empty tile with cell errors is not retried");
assert.equal(Feed.priceFailureNote(upstream), "Price feed failed — live pump prices did not load.");

const seen = new Set();
let retryInflight = 0;
let retryMax = 0;
const retried = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async (url) => {
    retryInflight += 1;
    retryMax = Math.max(retryMax, retryInflight);
    try {
      if (!seen.has(url)) {
        seen.add(url);
        throw new Error("Price feed HTTP 403");
      }
      const bbox = new URL(url).searchParams.get("bbox").split(",").map(Number);
      return {
        stations: [{ name: "Retried", lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2, regular: 3.11, midgrade: 0, updated: "2026-09-24T03:00:00Z" }]
      };
    } finally {
      retryInflight -= 1;
    }
  }
});
assert.ok(retryMax <= Feed.PRICE_FETCH_CONCURRENCY);
assert.equal(retried.failedTiles, 0);
assert.equal(retried.stations.length, tiles.length);
assert.ok(retried.stations.every(s => s.regular === 3.11));
const retriedSummary = Feed.priceUpdateSummary(retried, Date.parse("2026-09-24T03:05:00Z"));
assert.equal(retriedSummary.ok, true);
assert.equal(retriedSummary.text, "");

const denied = await Feed.fetchTiledPrices([[28, -82.5], [28.2, -82.2]], {
  base: "https://pack.here2serve.us/gas",
  retries: 1,
  normalize,
  fetcher: async () => { throw new Error("Price feed HTTP 403"); }
});
const deniedSummary = Feed.priceUpdateSummary(denied, Date.now());
assert.equal(denied.stations.length, 0);
assert.equal(deniedSummary.ok, false);
assert.equal(deniedSummary.priced, 0);
assert.equal(deniedSummary.loadedAt, null);
assert.match(deniedSummary.text, /HTTP 403/);
assert.doesNotMatch(deniedSummary.text, /Pump prices loaded/);

const timedOut = await Feed.fetchTiledPrices([[28, -82.5], [28.2, -82.2]], {
  base: "https://gas.here2serve.us/gas",
  retries: 0,
  normalize,
  fetcher: async () => { throw new Error("Price feed timed out"); }
});
assert.equal(Feed.priceFailureNote(timedOut), "Price feed timed out.");
const emptyBody = await Feed.fetchTiledPrices([[28, -82.5], [28.2, -82.2]], {
  base: "https://gas.here2serve.us/gas",
  retries: 0,
  normalize,
  fetcher: async () => { throw new Error("Price feed returned an empty response"); }
});
assert.equal(Feed.priceFailureNote(emptyBody), "Price feed returned an empty response.");

const blanks = Feed.priceUpdateSummary({
  stations: [
    { name: "No", lat: 28, lon: -82, regular: null, midgrade: 0 },
    { name: "Zero", lat: 28.1, lon: -82.1, regular: 0, midgrade: null }
  ],
  tiles: 1,
  failedTiles: 0
}, Date.now());
assert.equal(blanks.ok, false);
assert.equal(blanks.priced, 0);
assert.match(blanks.text, /No pump prices came back/);

function pageNormalize(s) {
  return Feed.normalizeWorkerStation(s);
}

const packTile = await Feed.fetchTiledPrices([[27.9, -82.8], [28.1, -82.4]], {
  base: "https://pack.here2serve.us/gas",
  normalize: pageNormalize,
  fetcher: async () => ({
    stations: [
      { name: "Shell", lat: 27.84321959749, lon: -82.79980993619, regular: 4.49, midgrade: 4.89, updated: "2026-09-23T22:15:46.913Z", source: "GasBuddy" },
      { name: "Old", lat: 27.91, lon: -82.5, regular: 4.19, midgrade: 0, updated: "2026-09-22T12:00:00.000Z", source: "GasBuddy" },
      { name: "Blank", lat: 27.95, lon: -82.2, regular: null, midgrade: null, updated: "2026-09-24T00:00:00Z" }
    ],
    meta: {
      count: 2,
      cache: "overlap-stale",
      source: "GasBuddy cache (overlap)",
      lastError: "HTTP Error 403: Forbidden"
    }
  })
});
assert.equal(packTile.stations.length, 2);
assert.equal(packTile.stations.find(s => s.name === "Shell").regular, 4.49);
assert.equal(packTile.stations.find(s => s.name === "Shell").updated, "2026-09-23T22:15:46.913Z");
assert.equal(packTile.stations.find(s => s.name === "Old").midgrade, null);
assert.equal(packTile.meta.stale, true);
assert.equal(packTile.meta.caches.length, 1);
assert.equal(packTile.meta.caches[0], "overlap-stale");
assert.equal(packTile.meta.sources[0], "GasBuddy cache (overlap)");
assert.match(packTile.meta.lastErrors[0], /403/);
const staleSummary = Feed.priceUpdateSummary(packTile, Date.parse("2026-09-24T02:13:00Z"));
assert.equal(staleSummary.ok, true);
assert.equal(staleSummary.stale, true);
assert.equal(staleSummary.priced, 2);
assert.equal(staleSummary.newest, Date.parse("2026-09-23T22:15:46.913Z"));
assert.equal(staleSummary.oldest, Date.parse("2026-09-22T12:00:00.000Z"));
assert.match(staleSummary.text, /Pack cache overlap-stale/);
assert.match(staleSummary.text, /GasBuddy cache \(overlap\)/);
assert.match(staleSummary.text, /upstream HTTP Error 403: Forbidden/);
const staleLine = Feed.priceNoteLine(staleSummary, {
  checked: "Sep 24, 2:13 AM",
  newest: "Sep 23, 10:15 PM",
  oldest: "Sep 22, 12:00 PM"
});
assert.match(staleLine, /Pack cache overlap-stale/);
assert.match(staleLine, /checked Sep 24, 2:13 AM/);
assert.match(staleLine, /newest report Sep 23, 10:15 PM/);
assert.match(staleLine, /oldest report Sep 22, 12:00 PM/);
assert.doesNotMatch(staleLine, /Pump prices loaded/);
const freshLine = Feed.priceNoteLine(
  Feed.priceUpdateSummary({ stations: [{ regular: 3.5, updated: "2026-09-24T01:00:00Z" }], meta: { caches: [], sources: [], lastErrors: [], cellErrors: 0, stale: false } }, Date.parse("2026-09-24T02:00:00Z")),
  { checked: "Sep 24, 2:00 AM", newest: "Sep 24, 1:00 AM", oldest: "Sep 24, 1:00 AM" }
);
assert.match(freshLine, /^Pump prices loaded Sep 24, 2:00 AM/);
assert.doesNotMatch(freshLine, /oldest report/);

assert.match(html, /const STATION_PRICE_API = "https:\/\/gas\.here2serve\.us\/gas"/);
assert.doesNotMatch(html, /const STATION_PRICE_API = "https:\/\/pack\.here2serve\.us\/gas"/);
assert.match(html, /localStorage\.getItem\("coastalGasPriceApi"\)/);
assert.match(html, /CoastalPriceFeed\.isDeadPackGasUrl/);
assert.match(html, /CoastalPriceFeed\.resolveStationPriceApi/);
assert.match(html, /CoastalPriceFeed\.gasLayerRequested/);
assert.match(html, /CoastalPriceFeed\.normalizeWorkerStation/);
assert.match(html, /concurrency:\s*2/);
assert.match(html, /gap:\s*450/);
assert.match(html, /Gas is off\. Turn Gas on to load street prices\./);
assert.match(html, /min-height:\s*44px/);
assert.match(html, /class="gas-toggle"/);
const workerDefault = "https://gas.here2serve.us/gas";
assert.equal(Feed.resolveStationPriceApi("", workerDefault), workerDefault);
assert.equal(Feed.resolveStationPriceApi(null, workerDefault), workerDefault);
assert.equal(Feed.resolveStationPriceApi("https://example.test/gas", workerDefault), "https://example.test/gas");
assert.equal(Feed.resolveStationPriceApi("https://pack.here2serve.us/gas", workerDefault), workerDefault);
assert.equal(Feed.resolveStationPriceApi("https://pack.here2serve.us/gas/", workerDefault), workerDefault);
assert.equal(Feed.resolveStationPriceApi("https://pack.here2serve.us/gas?bbox=1,2,3,4", workerDefault), workerDefault);
assert.equal(Feed.isDeadPackGasUrl("https://pack.here2serve.us/gas"), true);
assert.equal(Feed.isDeadPackGasUrl("https://gas.here2serve.us/gas"), false);
assert.equal(Feed.gasLayerRequested("?gas=1", ""), true);
assert.equal(Feed.gasLayerRequested("", "#gas"), true);
assert.equal(Feed.gasLayerRequested("?gas=0", ""), false);
assert.equal(Feed.gasLayerRequested("?foo=1", "#route"), false);
const circleK = Feed.normalizeWorkerStation({
  name: "Circle K",
  lat: 29.9201077,
  lon: -81.2936164,
  regular: 4.39,
  midgrade: 4.89,
  updated: "2026-09-23T20:24:37.856Z",
  source: "GasBuddy",
  city: "St Augustine",
  state: "FL",
  address: "2919 Coastal Hwy"
});
assert.equal(circleK.name, "Circle K");
assert.equal(circleK.lat, 29.9201077);
assert.equal(circleK.lon, -81.2936164);
assert.equal(circleK.regular, 4.39);
assert.equal(circleK.street, "2919 Coastal Hwy");
assert.equal(Feed.normalizeWorkerStation({ name: "Blank", lat: 29.9, lon: -81.2, regular: null }), null);
assert.equal(Feed.normalizeWorkerStation({ name: "Absurd", lat: 29.9, lon: -81.2, regular: 40 }), null);
assert.equal(Feed.normalizeWorkerStation({ name: "Text", lat: 29.9, lon: -81.2, regular: "nope" }), null);
assert.match(html, /CoastalPriceFeed\.fetchFocusedPrices/);
assert.match(html, /CoastalPriceFeed\.priceUpdateSummary/);
assert.match(html, /CoastalPriceFeed\.priceNoteLine/);
assert.match(html, /cache:\s*"no-store"/);
const gasFn = html.slice(html.indexOf("function setupGasLayer"));
const startLoadAt = gasFn.indexOf("async function startLoad");
const priceCallAt = gasFn.indexOf("fetchPrices(signal,", startLoadAt);
const cacheReadAt = gasFn.indexOf("const cached = bypass", startLoadAt);
assert.ok(priceCallAt > startLoadAt && priceCallAt < cacheReadAt, "price feed is requested even when OpenStreetMap locations are cached");
const writeCacheFn = gasFn.slice(gasFn.indexOf("function writeCache"), gasFn.indexOf("async function fetchUsAvg"));
assert.doesNotMatch(writeCacheFn, /regular/);
assert.match(gasFn, /startLoad\(true\)/);
assert.match(html, /src="gas-prices\.js\?v=/);
assert.match(html, /id="chkRestaurants">/);
assert.match(html, /id="chkGas" checked/);
assert.doesNotMatch(html, /id="chkRestaurants" checked/);
assert.match(html, /if \(chk\.checked\) startLoad\(false\)/);
assert.match(html, /function paintPrices\(/);
assert.match(html, /function priceNote\(/);
assert.match(html, /Price feed timed out/);

const lodging = JSON.parse(html.match(/const stops = (\[[\s\S]*?\]);/)[1]);
assert.equal(Feed.boxesForStops(tiles, lodging, 15).length, 0, "lodging stops already sit inside the route price tiles");
const farTiles = Feed.boxesForStops(tiles, [{ lat: 40.2, lon: -100.4 }], 15);
assert.equal(farTiles.length, 1, "a stop outside the route pad adds one tile");
farTiles.forEach(box => {
  const s = spans(box);
  assert.ok(s.lon <= Feed.PRICE_MAX_SPAN + 1e-6 && s.lat <= Feed.PRICE_MAX_SPAN + 1e-6);
  assert.ok(covers(box, 40.2, -100.4));
});
assert.match(html, /stops:\s*stops/);
assert.match(html, /stopRadiusMi:\s*15/);
assert.match(html, /Cheap near /);
assert.match(html, /const NEAR_STOP_MI = 15/);
assert.doesNotMatch(html, /id="chkRoad" checked/);
assert.match(html, /id="chkGas" checked/);
assert.doesNotMatch(html, /id="chkRest" checked/);
assert.doesNotMatch(html, /Botany Bay/);
assert.doesNotMatch(html, /Old Sheldon Church/);
assert.doesNotMatch(html, /Marshes of Glynn/);
assert.doesNotMatch(html, /Murphy USA/);
assert.match(html, /build:return-prelim-20261003/);
assert.doesNotMatch(html, /build:clayton-dock-20261001/);
assert.doesNotMatch(html, /build:thu-publix-20261001/);
assert.doesNotMatch(html, /build:thu-optional-20261001/);
assert.doesNotMatch(html, /build:thu-stops-20261001/);
assert.doesNotMatch(html, /build:gas-on-route-20261001/);
assert.doesNotMatch(html, /build:gas-picks-20261001/);
assert.doesNotMatch(html, /build:layers-scroll-20260929/);
assert.doesNotMatch(html, /build:ios-polish-20260929/);
assert.doesNotMatch(html, /build:gas-throttle-20260929/);
assert.doesNotMatch(html, /build:gas-picks-20260929/);
assert.doesNotMatch(html, /build:ios-stops-20260929/);
assert.doesNotMatch(html, /id="chkGasPicks" checked/);
assert.match(html, /id="layersScrim"/);
assert.match(html, /id="btnLayersAllOn"/);
assert.match(html, /id="btnLayersAllOff"/);
assert.match(html, /id="btnLayersDone"/);
assert.match(html, /coastalLayerChoices-v2/);
assert.match(html, /height:70vh/);
assert.match(html, /height:70dvh/);
assert.match(html, /max-height:70dvh/);
assert.match(html, /id="layerSheetList"/);
assert.match(html, /overflow-y:auto/);
assert.match(html, /-webkit-overflow-scrolling:touch/);
assert.match(html, /overscroll-behavior:contain/);
assert.match(html, /env\(safe-area-inset-bottom, 0px\)/);
assert.match(html, /L\.DomEvent\.disableScrollPropagation\(layersPanel\)/);
assert.match(html, /L\.DomEvent\.disableClickPropagation\(layersPanel\)/);
assert.match(html, /min-height:50px/);
assert.match(html, /class="layer-group">Gas</);
assert.match(html, /class="layer-group">Food</);
assert.match(html, /class="layer-group">Stops</);
assert.match(html, /class="layer-group">Safety \/ Signal</);
assert.match(html, /min-height:48px/);
assert.match(html, /Gas picks \(10\/1\)/);
assert.doesNotMatch(html, /Gas picks \(9\/29, 10\/1\)/);
assert.doesNotMatch(html, /id="chkGasPicks" checked/);
assert.doesNotMatch(html, /31\.214705/);
assert.doesNotMatch(html, /29\.915975/);
assert.match(html, /32\.7922991/);
assert.match(html, /-79\.9888917/);
assert.match(html, /32\.8076579/);
assert.match(html, /-79\.8786184/);
assert.match(html, /regular \$3\.85 per GasBuddy Wed 9\/30 evening/);
assert.match(html, /Backup gas Thu 10\/1: \$3\.94 per GasBuddy 9\/30/);
assert.doesNotMatch(html, /Costco/);
assert.match(html, /const ROUTE_GAS_MI = 1/);
assert.match(html, /distToRouteGasMi\(s\.lat, s\.lon\)/);
assert.match(html, /distToRouteGasMi\(p\.lat, p\.lon\) > ROUTE_GAS_MI/);
assert.match(html, /coastal-gas-osm-v4/);
assert.doesNotMatch(html, /coastal-gas-osm-v3/);
assert.doesNotMatch(html, /id="chkReturn" checked/);
assert.match(html, /Return \(old draft — being replanned\)/);
assert.doesNotMatch(html, /Return \(prelim\)/);
assert.match(html, /prelim, not booked/);
assert.match(html, /Uncle's, Hillsborough area/);
assert.match(html, /36\.0753964/);
assert.match(html, /-79\.0994106/);
assert.doesNotMatch(html, /Churton/);
assert.match(html, /Okefenokee State Park Eco-Lodge/);
assert.match(html, /30\.8232187/);
assert.match(html, /-82\.3647971/);
assert.match(html, /Eco Cottage \$165\/night \(open\)\. Silver Springs full\./);
assert.doesNotMatch(html, /name: "Silver Springs State Park"/);
assert.match(html, /dashArray: '14 10'/);
assert.match(html, /#7c3aed/);
assert.match(html, /Cabin 5, \$388 for 2 nights/);
assert.match(html, /Cottage 01 or 04, \$210\/night/);
assert.match(html, /Cottage 06 or 07, \$175\/night/);
assert.match(html, /Clayton boat dock \(park \+ boat pickup\)/);
assert.match(html, /33\.3098316/);
assert.match(html, /-79\.3025614/);
assert.match(html, /840 Commanders Island Rd, SC 29440/);
assert.match(html, /travelmode: "driving"/);
assert.match(html, /&travelmode=/);
assert.match(html, /the boat leaves from the dock at 840 Commanders Island Rd/);
assert.doesNotMatch(html, /landing TBD from Evolve/);
assert.match(html, /\[-79\.3025614,33\.3098316\]/);
assert.doesNotMatch(html, /\[-79\.4162,33\.2291\]/);
assert.match(html, /"lat": 33\.2291/);
assert.match(html, /"lon": -79\.4162/);
assert.match(html, /tel:\+18435560991/);
assert.match(html, /32\.7951111/);
assert.match(html, /-80\.0284682/);
assert.match(html, /32\.8546146/);
assert.match(html, /-79\.8012669/);
assert.match(html, /32\.9747027/);
assert.match(html, /-79\.6682955/);
assert.match(html, /33\.2011842/);
assert.match(html, /-79\.4345458/);
assert.match(html, /33\.2107398/);
assert.match(html, /-79\.3845822/);
assert.match(html, /Roadside Gullah sweetgrass basket stands/);
assert.match(html, /No house tours Thursday/);
assert.match(html, /32\.7170450/);
assert.match(html, /-80\.0804039/);
assert.match(html, /32\.7939963/);
assert.match(html, /-79\.8828958/);
assert.match(html, /32\.8583556/);
assert.match(html, /-79\.8231022/);
assert.match(html, /Optional: Huge centuries-old live oak, free\. Open Thu 9-5, last entrance 4:50/);
assert.match(html, /after the Ravenel Bridge\. Check hours\./);
assert.match(html, /Admission \$30 adult, open Thu 9-5/);
assert.match(html, /32\.8133883/);
assert.match(html, /-79\.8676148/);
assert.match(html, /Grocery \+ ice stop Thu 10\/1, last Publix before the boat\. Open 7 AM-9 PM\. \(843\) 856-3000\./);
assert.match(html, /32\.8048664/);
assert.match(html, /-79\.8871391/);
assert.match(html, /name: "Trader Joe's"/);
assert.match(html, /401 Johnnie Dodds Blvd, Mt Pleasant, SC 29464/);
assert.match(html, /Groceries, on US-17/);
assert.match(html, /encodeURIComponent\(p\.address\)/);
assert.match(html, /const todayET = easternDate\(tripNow\(\)\)/);
assert.match(html, /function tripNow\(\)/);
assert.match(html, /function lodgingStayDone\(end, today\)/);
assert.match(html, /return typeof end === 'string' && end < today/);
assert.match(html, /class="pin pin-done">✓</);
assert.match(html, /Done · /);
const stayFns = new Function(
  html.match(/function easternDate\(d\) \{[\s\S]*?\n\}/)[0] + "\n" +
  html.match(/function lodgingStayDone\(end, today\) \{[\s\S]*?\n\}/)[0] +
  "\nreturn { easternDate, lodgingStayDone };"
)();
assert.equal(stayFns.easternDate(new Date("2026-10-01T03:30:00Z")), "2026-09-30");
assert.equal(stayFns.easternDate(new Date("2026-10-01T04:00:00Z")), "2026-10-01");
assert.equal(stayFns.lodgingStayDone("2026-09-29", "2026-10-01"), true, "Anastasia is done on Oct 1");
assert.equal(stayFns.lodgingStayDone("2026-10-01", "2026-10-01"), false, "Edisto stays full on Oct 1");
assert.equal(stayFns.lodgingStayDone("2026-10-01", "2026-10-02"), true, "Edisto dims after Oct 1");
assert.doesNotMatch(html, /id="chkRoad" checked/);
assert.match(html, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
assert.match(html, /maps\.apple\.com\/\?daddr=/);
assert.doesNotMatch(html, /[?&]saddr=/);
assert.doesNotMatch(html, /3007 Bluffs/);
assert.match(html, /Home \(Largo\)/);
assert.match(html, /27\.9095/);
assert.match(html, /-82\.7873/);
assert.match(html, /serviceWorker\.register/);
assert.match(html, /manifest\.webmanifest/);
assert.match(html, /Check in at the Marina Store after 4 PM/);
assert.match(html, /840 Commanders Island Rd, Georgetown, SC 29440/);
assert.doesNotMatch(html, /google\.com\/maps\/search\/\?api=1/);
assert.match(html, /Prices loaded \(/);
assert.match(html, /some areas cached/);
assert.match(html, /backoffBase:\s*800/);
assert.match(html, /failureBudget:\s*3/);
assert.match(html, /bypassCache/);
assert.doesNotMatch(html, /Gas prices as of /);
assert.doesNotMatch(html, /build:road-stops-20260929/);

function milesOffRoute(lat, lon) {
  function hav(lat1, lon1, lat2, lon2) {
    const R = 3958.7613;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  let min = Infinity;
  for (let i = 0; i < drive.length - 1; i++) {
    const aLat = drive[i][0], aLon = drive[i][1], bLat = drive[i + 1][0], bLon = drive[i + 1][1];
    const mid = ((aLat + bLat) / 2) * Math.PI / 180;
    const kx = Math.max(0.01, 69.172 * Math.cos(mid));
    const ky = 69.172;
    const ax = aLon * kx, ay = aLat * ky, bx = bLon * kx, by = bLat * ky, px = lon * kx, py = lat * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-12) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const d = hav(lat, lon, (ay + t * dy) / ky, (ax + t * dx) / kx);
    if (d < min) min = d;
  }
  return min;
}
assert.ok(milesOffRoute(32.7922991, -79.9888917) <= 1, "West Ashley Circle K stays inside 1 mi");
assert.ok(milesOffRoute(32.8076579, -79.8786184) <= 1, "Johnnie Dodds Circle K stays inside 1 mi");
assert.ok(milesOffRoute(31.982049, -81.175621) > 1, "Savannah Murphy Express is off the route");
assert.ok(milesOffRoute(32.8546146, -79.8012669) <= 1, "sweetgrass stands sit on US-17");
assert.ok(milesOffRoute(32.9747027, -79.6682955) <= 1, "Sewee is on the US-17 drive");

const home = JSON.parse(html.match(/const home = (\{.*?\});/)[1]);
const today = "2026-09-29";
const focus = Feed.planPriceFetch({
  route: drive,
  home,
  stops: lodging,
  today,
  now: Date.parse("2026-09-29T16:00:00Z")
});
assert.ok(focus.boxes.length >= 3 && focus.boxes.length <= 15, "today's load stays under 15 requests (saw " + focus.boxes.length + ")");
focus.boxes.forEach((box, i) => {
  const s = spans(box);
  assert.ok(s.lon <= Feed.PRICE_MAX_SPAN + 1e-6 && s.lat <= Feed.PRICE_MAX_SPAN + 1e-6, "focus tile " + i);
});
assert.ok(focus.boxes.some(box => covers(box, 31.21, -81.49)), "Brunswick on today's I-95 leg is queried");
assert.ok(!focus.boxes.some(box => covers(box, 27.9095, -82.7873)), "central Largo is not queried on the St. Augustine → Edisto day");
lodging.forEach(s => {
  assert.ok(focus.boxes.some(box => covers(box, s.lat, s.lon)), "stop covered: " + s.short);
});
assert.ok(!focus.boxes.some(box => covers(box, 33.0, -79.7)), "highway between later stops is not queried today");
const withGps = Feed.planPriceFetch({
  route: drive,
  home,
  stops: lodging,
  today,
  gps: { lat: 36.1, lon: -75.7 },
  now: Date.parse("2026-09-29T16:00:00Z")
});
assert.equal(withGps.boxes.length, focus.boxes.length + 1);
assert.ok(withGps.boxes.length <= 15);
assert.ok(withGps.boxes.some(box => covers(box, 36.1, -75.7)));
const stay = Feed.planPriceFetch({
  route: drive,
  home,
  stops: lodging,
  today: "2026-10-02",
  now: Date.parse("2026-10-02T16:00:00Z")
});
assert.ok(stay.boxes.length <= lodging.length);
assert.ok(!stay.boxes.some(box => covers(box, 31.21, -81.49)), "a stay day does not query the whole I-95 corridor");
assert.equal(Feed.driveEndpoints(home, lodging, today).destination.lat, lodging[1].lat);
assert.equal(Feed.tripDate(Date.parse("2026-09-30T02:30:00Z")), "2026-09-29");

const mem = {
  data: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; },
  setItem(k, v) { this.data[k] = String(v); }
};
let focusCalls = 0;
const focusNow = Date.parse("2026-09-29T18:00:00Z");
const firstFocus = await Feed.fetchFocusedPrices({
  route: drive,
  home,
  stops: lodging,
  today,
  now: focusNow,
  storage: mem,
  gap: 0,
  backoffBase: 0,
  concurrency: 2,
  base: "https://gas.here2serve.us/gas",
  normalize,
  fetcher: async () => {
    focusCalls++;
    return {
      stations: [{ name: "Cached", lat: 31.2, lon: -81.49, regular: 3.56, updated: "2026-09-29T13:01:00Z", source: "GasBuddy" }],
      meta: { cellErrors: 0, source: "GasBuddy (unofficial)" }
    };
  }
});
assert.equal(focusCalls, focus.boxes.length);
assert.equal(firstFocus.requests, focus.boxes.length);
assert.equal(firstFocus.usedCache, false);
assert.ok(firstFocus.stations.length >= 1);
const againCalls = focusCalls;
const secondFocus = await Feed.fetchFocusedPrices({
  route: drive,
  home,
  stops: lodging,
  today,
  now: focusNow + 20 * 60 * 1000,
  storage: mem,
  gap: 0,
  backoffBase: 0,
  concurrency: 2,
  base: "https://gas.here2serve.us/gas",
  normalize,
  fetcher: async () => { focusCalls++; return { stations: [], meta: { cellErrors: 1 } }; }
});
assert.equal(focusCalls, againCalls, "a fresh cell cache is not refetched");
assert.equal(secondFocus.requests, 0);
assert.equal(secondFocus.fromCache, true);
assert.equal(secondFocus.usedCache, true);
assert.ok(secondFocus.stations.some(s => s.regular === 3.56));
const cachedSummary = Feed.priceUpdateSummary(secondFocus, focusNow + 20 * 60 * 1000);
assert.equal(cachedSummary.ok, true);
assert.match(cachedSummary.text, /Prices loaded \(1 station, some areas cached\)/);
assert.doesNotMatch(cachedSummary.text, /Price feed failed/);
assert.doesNotMatch(cachedSummary.text, /cell errors/);
assert.equal(cachedSummary.newest, Date.parse("2026-09-29T13:01:00Z"));

let boomCalls = 0;
const boomBoxes = [];
for (let i = 0; i < 8; i++) boomBoxes.push([-82, 28 + i * 0.4, -80.6, 28.4 + i * 0.4]);
const boom = await Feed.fetchTiledPrices([], {
  boxes: boomBoxes,
  retries: 0,
  gap: 0,
  backoffBase: 0,
  concurrency: 2,
  failureBudget: 3,
  base: "https://gas.here2serve.us/gas",
  normalize,
  fetcher: async () => {
    boomCalls++;
    throw new Error("Price feed HTTP 429");
  }
});
assert.ok(boomCalls < boomBoxes.length, "429s stop instead of fetching every cell (saw " + boomCalls + ")");
assert.ok(boomCalls <= 6, "saw " + boomCalls);
assert.ok(boomCalls >= 3);
assert.equal(boom.stations.length, 0);
assert.match(Feed.priceFailureNote(boom), /429/);
const boomSummary = Feed.priceUpdateSummary(boom, Date.now());
assert.equal(boomSummary.ok, false);
assert.match(boomSummary.text, /429/);

const mixed = Feed.priceUpdateSummary({
  stations: [
    { regular: 3.56, updated: "2026-09-29T13:01:00Z" },
    { regular: 3.89, updated: "2026-09-29T12:00:00Z" }
  ],
  partial: true,
  usedCache: true,
  failedTiles: 2,
  meta: { caches: [], sources: ["GasBuddy (unofficial)"], lastErrors: [], cellErrors: 4, stale: false }
}, Date.parse("2026-09-29T18:00:00Z"));
assert.equal(mixed.ok, true);
assert.equal(mixed.priced, 2);
assert.match(mixed.text, /Prices loaded \(2 stations, some areas cached\)/);
assert.doesNotMatch(mixed.text, /Price feed failed/);
assert.doesNotMatch(mixed.text, /cell errors/);
assert.match(Feed.priceNoteLine(mixed, { newest: "Sep 29, 9:01 AM", oldest: "Sep 29, 8:00 AM" }), /newest report Sep 29, 9:01 AM/);

console.log("gas price tile tests passed (" + tiles.length + " route tiles, " + calls.length + " simulated requests, max in flight " + maxInflight + ", focus boxes " + focus.boxes.length + ")");

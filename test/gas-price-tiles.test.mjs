import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const routeGeo = JSON.parse(html.match(/const routeGeo = (\{.*?\});/)[1]);
const drive = routeGeo.coordinates.map(c => [c[1], c[0]]);

const sandbox = {};
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

assert.equal(Feed.PRICE_MAX_SPAN, 1.2);
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
  Feed.priceUrl("https://pack.here2serve.us/gas", [-82, 27, -81, 28]),
  "https://pack.here2serve.us/gas?bbox=-82.0000,27.0000,-81.0000,28.0000&grade=regular"
);
assert.ok(Feed.priceUrl("https://pack.here2serve.us/gas/", [-82, 27, -81, 28]).startsWith("https://pack.here2serve.us/gas/?bbox="));
assert.ok(Feed.priceUrl("https://example.test/gas?x=1", [-82, 27, -81, 28]).includes("&bbox="));

function normalize(s) {
  const n = typeof s.regular === "string" ? parseFloat(s.regular) : s.regular;
  if (!Number.isFinite(n) || n <= 0 || n > 12) return null;
  return Object.assign({}, s, { regular: n });
}

const calls = [];
const loaded = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async (url) => {
    calls.push(url);
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
assert.ok(calls.length >= 2);
assert.equal(loaded.stations.length, calls.length);
assert.ok(loaded.stations.every(s => s.regular === 3.459 && s.name === "Priced"));
assert.equal(Feed.priceFailureNote(loaded), "");
const fullQuery = routeBox.map(n => n.toFixed(4)).join(",");
assert.ok(calls.every(url => !url.includes("bbox=" + fullQuery)), "no request uses the full-route bbox");

const failed = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas/",
  normalize,
  fetcher: async () => { throw new Error("Price feed HTTP 404"); }
});
assert.equal(failed.stations.length, 0);
assert.equal(Feed.priceFailureNote(failed), "Price feed failed — live pump prices did not load.");

let partialCalls = 0;
const partial = await Feed.fetchTiledPrices(drive, {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async () => {
    partialCalls++;
    if (partialCalls === 1) throw new Error("Price feed HTTP 500");
    return { stations: [{ name: "Ok", lat: 32.5, lon: -80.3, regular: 3.2, updated: "2026-09-24T00:00:00Z" }] };
  }
});
assert.equal(partial.partial, true);
assert.equal(partial.stations.length, 1);
assert.equal(partial.stations[0].regular, 3.2);
assert.equal(Feed.priceFailureNote(partial), "Some live pump prices did not load.");

const upstream = await Feed.fetchTiledPrices([[28, -82], [28.2, -81.8]], {
  base: "https://pack.here2serve.us/gas",
  normalize,
  fetcher: async () => ({ stations: [], meta: { cellErrors: 3 } })
});
assert.equal(Feed.priceFailureNote(upstream), "Price feed failed — live pump prices did not load.");

assert.match(html, /const STATION_PRICE_API = "https:\/\/pack\.here2serve\.us\/gas"/);
assert.match(html, /localStorage\.getItem\("coastalGasPriceApi"\)/);
assert.match(html, /CoastalPriceFeed\.fetchTiledPrices/);
assert.match(html, /CoastalPriceFeed\.priceFailureNote/);
assert.doesNotMatch(html, /const STATION_PRICE_API = "https:\/\/gas\.here2serve\.us"/);

console.log("gas price tile tests passed (" + tiles.length + " route tiles, " + calls.length + " simulated requests)");

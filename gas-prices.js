/* Focused gas price tiles.
   The Florida → North Carolina drive is one box about 8° × 8.6°.
   Asking the proxy for that whole box, or for every small cell along it,
   makes GasBuddy answer with a burst of cell errors.
   A direct probe of https://gas.here2serve.us/gas on 2026-09-29:
   a 1.5° box returned 200, 9 upstream cells, cellErrors 0;
   a 2.0° box returned 12 cells, all of them errors.
   So each request stays at or under 1.5° on a side, and a load only
   asks for the current drive leg, a small box at each lodging stop,
   and the phone's GPS fix when geolocation is granted.
   That is about 10 requests, capped at 15.
   Tiles are fetched two at a time with a gap. HTTP 403/429 and other
   retryable errors back off exponentially, and after a few failed tiles
   the rest of the load is skipped instead of hammering the proxy.
   Successful cells (and cells that failed) are cached in localStorage
   for 45 minutes. A layer toggle or a map pan does not refetch a fresh cell. */
(function (root) {
  "use strict";

  var PRICE_MAX_SPAN = 1.5;
  var PRICE_PAD = 0.3;
  var PRICE_OVERLAP = 0.35;
  var PRICE_FOCUS_PAD = 0.15;
  var PRICE_FETCH_CONCURRENCY = 2;
  var PRICE_FETCH_RETRIES = 2;
  var PRICE_FAILURE_BUDGET = 3;
  var PRICE_MAX_REQUESTS = 15;
  var PRICE_CACHE_TTL_MS = 45 * 60 * 1000;
  var PRICE_CACHE_KEY = "coastal-gas-cells-v1";

  function splitAxis(min, max, maxSpan, overlap) {
    var span = max - min;
    if (!(span > maxSpan)) return [[min, max]];
    if (!(overlap > 0) || overlap >= maxSpan) overlap = Math.min(0.35, maxSpan / 5);
    var count = Math.max(2, Math.ceil((span - overlap) / (maxSpan - overlap)));
    var step = (span - overlap) / count;
    var width = step + overlap;
    var parts = [];
    for (var i = 0; i < count; i++) {
      var a = min + i * step;
      var b = i === count - 1 ? max : a + width;
      parts.push([a, b]);
    }
    return parts;
  }

  function boxesFromBbox(box, maxSpan, overlap) {
    if (maxSpan == null) maxSpan = PRICE_MAX_SPAN;
    if (overlap == null) overlap = PRICE_OVERLAP;
    var lonParts = splitAxis(box[0], box[2], maxSpan, overlap);
    var latParts = splitAxis(box[1], box[3], maxSpan, overlap);
    var tiles = [];
    for (var r = 0; r < latParts.length; r++) {
      for (var c = 0; c < lonParts.length; c++) {
        tiles.push([lonParts[c][0], latParts[r][0], lonParts[c][1], latParts[r][1]]);
      }
    }
    return tiles;
  }

  function spanOf(latLngs, i0, i1, pad) {
    var minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (var i = i0; i <= i1; i++) {
      var lat = latLngs[i][0], lon = latLngs[i][1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
    return {
      box: [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad],
      lon: (maxLon - minLon) + 2 * pad,
      lat: (maxLat - minLat) + 2 * pad
    };
  }

  function fits(latLngs, i0, i1, pad, maxSpan) {
    if (i1 < i0) return false;
    var s = spanOf(latLngs, i0, i1, pad);
    return s.lon <= maxSpan + 1e-9 && s.lat <= maxSpan + 1e-9;
  }

  function pointInBox(box, lat, lon) {
    return lon >= box[0] - 1e-9 && lon <= box[2] + 1e-9 && lat >= box[1] - 1e-9 && lat <= box[3] + 1e-9;
  }

  function milesBox(lat, lon, miles) {
    var dLat = miles / 69.172;
    var cos = Math.cos(lat * Math.PI / 180);
    var dLon = miles / (69.172 * Math.max(0.2, cos));
    return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  }

  function radiusCovered(tiles, lat, lon, miles) {
    var box = milesBox(lat, lon, miles);
    var samples = [
      [lat, lon],
      [box[3], lon], [box[1], lon], [lat, box[2]], [lat, box[0]],
      [box[3], box[2]], [box[3], box[0]], [box[1], box[2]], [box[1], box[0]]
    ];
    for (var i = 0; i < samples.length; i++) {
      var hit = false;
      for (var t = 0; t < tiles.length; t++) {
        if (pointInBox(tiles[t], samples[i][0], samples[i][1])) { hit = true; break; }
      }
      if (!hit) return false;
    }
    return true;
  }

  // One small tile per stop whose 15-mile box is not already inside the route tiles.
  function boxesForStops(tiles, stops, miles, maxSpan) {
    if (miles == null) miles = 15;
    if (maxSpan == null) maxSpan = PRICE_MAX_SPAN;
    var extra = [];
    (stops || []).forEach(function (s) {
      var lat = +s.lat, lon = +s.lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      if (radiusCovered(tiles, lat, lon, miles)) return;
      boxesFromBbox(milesBox(lat, lon, miles), maxSpan, Math.min(0.15, maxSpan / 4)).forEach(function (b) {
        extra.push(b);
      });
    });
    return extra;
  }

  function priceCellKey(box) {
    return box.map(function (n) { return Number(n).toFixed(4); }).join(",");
  }

  function dedupeBoxes(boxes) {
    var seen = {};
    var out = [];
    (boxes || []).forEach(function (b) {
      if (!b || b.length < 4) return;
      var key = priceCellKey(b);
      if (seen[key]) return;
      seen[key] = true;
      out.push(b);
    });
    return out;
  }

  function tripDate(now, timeZone) {
    var d = now == null ? new Date() : new Date(now);
    if (Number.isNaN(d.getTime())) d = new Date();
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone || "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function driveEndpoints(home, stops, today) {
    var dest = -1;
    var list = stops || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].start === today) dest = i;
    }
    if (dest < 0) return null;
    var origin = dest === 0 ? home : list[dest - 1];
    var destination = list[dest];
    if (!origin || !destination) return null;
    if (!Number.isFinite(+origin.lat) || !Number.isFinite(+origin.lon)) return null;
    if (!Number.isFinite(+destination.lat) || !Number.isFinite(+destination.lon)) return null;
    return { origin: origin, destination: destination };
  }

  function nearestVertex(latLngs, lat, lon, minIndex) {
    var best = minIndex || 0;
    var bestD = Infinity;
    var start = minIndex || 0;
    for (var i = start; i < latLngs.length; i++) {
      var dLat = latLngs[i][0] - lat;
      var dLon = latLngs[i][1] - lon;
      var d = dLat * dLat + dLon * dLon;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function legLatLngs(route, origin, destination) {
    if (!origin || !destination || !route || route.length < 2) return [];
    var i0 = nearestVertex(route, +origin.lat, +origin.lon, 0);
    var i1 = nearestVertex(route, +destination.lat, +destination.lon, i0);
    if (i1 <= i0) return [[+origin.lat, +origin.lon], [+destination.lat, +destination.lon]];
    return route.slice(i0, i1 + 1);
  }

  function focusBoxes(opts) {
    opts = opts || {};
    if (opts.boxes && opts.boxes.length) {
      return dedupeBoxes(opts.boxes).slice(0, PRICE_MAX_REQUESTS);
    }
    var maxSpan = opts.maxSpan == null ? PRICE_MAX_SPAN : opts.maxSpan;
    var pad = opts.pad == null ? PRICE_FOCUS_PAD : opts.pad;
    var overlap = opts.overlap == null ? 0.2 : opts.overlap;
    var stopRadius = opts.stopRadiusMi == null ? 15 : opts.stopRadiusMi;
    var today = opts.today || tripDate(opts.now || Date.now());
    var boxes = [];
    var endpoints = driveEndpoints(opts.home, opts.stops, today);
    if (endpoints && opts.route && opts.route.length) {
      var leg = legLatLngs(opts.route, endpoints.origin, endpoints.destination);
      boxesAlongRoute(leg, maxSpan, pad, overlap).forEach(function (b) { boxes.push(b); });
    }
    boxesForStops(boxes, opts.stops, stopRadius, maxSpan).forEach(function (b) { boxes.push(b); });
    if (opts.gps && Number.isFinite(+opts.gps.lat) && Number.isFinite(+opts.gps.lon)) {
      boxesForStops(boxes, [{ lat: +opts.gps.lat, lon: +opts.gps.lon }], stopRadius, maxSpan).forEach(function (b) {
        boxes.push(b);
      });
    }
    return dedupeBoxes(boxes).slice(0, PRICE_MAX_REQUESTS);
  }

  function loadPriceStore(storage) {
    try {
      if (!storage || typeof storage.getItem !== "function") return { cells: {} };
      var raw = storage.getItem(PRICE_CACHE_KEY);
      if (!raw) return { cells: {} };
      var js = JSON.parse(raw);
      if (!js || typeof js.cells !== "object" || !js.cells) return { cells: {} };
      return { cells: js.cells };
    } catch (e) {
      return { cells: {} };
    }
  }

  function cellIsFresh(rec, now, ttl) {
    if (!rec || !(rec.at > 0) || !Array.isArray(rec.stations)) return false;
    return (now - rec.at) < ttl;
  }

  function stationsFromCell(rec) {
    if (!rec || !Array.isArray(rec.stations)) return [];
    return rec.stations;
  }

  function planPriceFetch(opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var ttl = opts.ttl == null ? PRICE_CACHE_TTL_MS : opts.ttl;
    var boxes = focusBoxes(opts);
    var store = loadPriceStore(opts.storage);
    var staleBoxes = [];
    var paint = [];
    var freshCount = 0;
    var freshErrors = 0;
    var lastError = "";
    boxes.forEach(function (box) {
      var rec = store.cells[priceCellKey(box)];
      var fresh = cellIsFresh(rec, now, ttl) && !opts.bypassCache;
      if (fresh) {
        freshCount++;
        if (rec.error && !stationsFromCell(rec).length) {
          freshErrors++;
          lastError = rec.error;
        }
      } else {
        staleBoxes.push(box);
      }
      paint = paint.concat(stationsFromCell(rec));
    });
    return {
      boxes: boxes,
      staleBoxes: staleBoxes,
      cachedStations: dedupePriceStations(paint),
      freshCount: freshCount,
      freshErrors: freshErrors,
      lastError: lastError,
      store: store,
      today: opts.today || tripDate(now)
    };
  }

  function savePriceCells(storage, boxes, tileResults, now) {
    if (!storage || typeof storage.setItem !== "function") return;
    var store = loadPriceStore(storage);
    var t = now || Date.now();
    (boxes || []).forEach(function (box, i) {
      var r = tileResults && tileResults[i];
      if (!r || r.skipped) return;
      store.cells[priceCellKey(box)] = {
        at: t,
        stations: r.error ? [] : (r.stations || []),
        error: r.error || "",
        meta: r.meta || null
      };
    });
    var cutoff = t - 6 * 60 * 60 * 1000;
    Object.keys(store.cells).forEach(function (k) {
      if (!(store.cells[k] && store.cells[k].at > cutoff)) delete store.cells[k];
    });
    try { storage.setItem(PRICE_CACHE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function boxesAlongRoute(latLngs, maxSpan, pad, overlap) {
    if (maxSpan == null) maxSpan = PRICE_MAX_SPAN;
    if (pad == null) pad = PRICE_PAD;
    if (overlap == null) overlap = PRICE_OVERLAP;
    var tiles = [];
    var n = latLngs ? latLngs.length : 0;
    if (!n) return tiles;
    var left = 0;
    var guard = 0;
    while (left < n && guard++ < n + 5) {
      if (left < n - 1 && !fits(latLngs, left, left + 1, pad, maxSpan)) {
        var jump = spanOf(latLngs, left, left + 1, pad);
        var splitOverlap = Math.min(overlap, maxSpan / 4);
        boxesFromBbox(jump.box, maxSpan, splitOverlap).forEach(function (box) { tiles.push(box); });
        left += 1;
        continue;
      }
      var right = left;
      while (right + 1 < n && fits(latLngs, left, right + 1, pad, maxSpan)) right++;
      var span = spanOf(latLngs, left, right, pad);
      if (span.lon > maxSpan + 1e-9 || span.lat > maxSpan + 1e-9) {
        boxesFromBbox(span.box, maxSpan, Math.min(overlap, maxSpan / 4)).forEach(function (box) { tiles.push(box); });
      } else {
        tiles.push(span.box);
      }
      if (right >= n - 1) break;
      var newLeft = right;
      while (newLeft - 1 > left && fits(latLngs, newLeft - 1, right + 1, pad, maxSpan)) {
        newLeft--;
        var dLat = Math.abs(latLngs[newLeft][0] - latLngs[right][0]);
        var dLon = Math.abs(latLngs[newLeft][1] - latLngs[right][1]);
        if (dLat >= overlap || dLon >= overlap) break;
      }
      if (newLeft <= left) newLeft = left + 1;
      left = newLeft;
    }
    return tiles;
  }

  function dedupePriceStations(list) {
    var map = new Map();
    list.forEach(function (s) {
      if (!s || !Number.isFinite(+s.lat) || !Number.isFinite(+s.lon)) return;
      var key = (+s.lat).toFixed(4) + "," + (+s.lon).toFixed(4);
      var prev = map.get(key);
      if (!prev) { map.set(key, s); return; }
      var prevT = Date.parse(prev.updated) || 0;
      var nextT = Date.parse(s.updated) || 0;
      if (nextT > prevT) map.set(key, s);
      else if (nextT === prevT && !(+prev.regular > 0) && +s.regular > 0) map.set(key, s);
    });
    return Array.from(map.values());
  }

  function metaFromPayload(js) {
    if (!js || !js.meta || typeof js.meta !== "object") return null;
    return {
      cache: js.meta.cache != null ? String(js.meta.cache) : "",
      source: js.meta.source != null ? String(js.meta.source) : "",
      lastError: js.meta.lastError != null ? String(js.meta.lastError) : "",
      cellErrors: Number(js.meta.cellErrors) || 0
    };
  }

  function summarizePriceMeta(metas) {
    var caches = [];
    var sources = [];
    var errors = [];
    var cellErrors = 0;
    (metas || []).forEach(function (m) {
      if (!m) return;
      if (m.cache && caches.indexOf(m.cache) < 0) caches.push(m.cache);
      if (m.source && sources.indexOf(m.source) < 0) sources.push(m.source);
      if (m.lastError && errors.indexOf(m.lastError) < 0) errors.push(m.lastError);
      cellErrors += Number(m.cellErrors) || 0;
    });
    return {
      caches: caches,
      sources: sources,
      lastErrors: errors,
      cellErrors: cellErrors,
      stale: caches.some(function (c) { return /stale/i.test(c); })
    };
  }

  function combineTileResults(results) {
    results = (results || []).map(function (r) { return r || { stations: [], skipped: true }; });
    var failed = results.filter(function (r) { return r && r.error; });
    var skipped = results.filter(function (r) { return r && r.skipped && !r.error; });
    var stations = dedupePriceStations(results.reduce(function (acc, r) {
      return acc.concat((r && !r.error && r.stations) || []);
    }, []));
    var meta = summarizePriceMeta(results.map(function (r) { return r && r.meta; }));
    var okCount = results.length - failed.length - skipped.length;
    var fetched = results.length - skipped.length;
    if (!results.length || okCount === 0) {
      return {
        stations: [],
        error: (failed[0] && failed[0].error) || "Price feed failed",
        tiles: results.length,
        failedTiles: failed.length,
        requests: fetched,
        meta: meta,
        tileResults: results
      };
    }
    if (failed.length || skipped.length) {
      return {
        stations: stations,
        partial: true,
        tiles: results.length,
        failedTiles: failed.length + skipped.length,
        requests: fetched,
        meta: meta,
        tileResults: results
      };
    }
    return { stations: stations, tiles: results.length, failedTiles: 0, requests: fetched, meta: meta, tileResults: results };
  }

  function priceUrl(base, box) {
    var join = String(base).indexOf("?") >= 0 ? "&" : "?";
    var bbox = box.map(function (n) { return Number(n).toFixed(4); }).join(",");
    return base + join + "bbox=" + bbox + "&grade=regular";
  }

  function stationsFromPayload(js) {
    if (Array.isArray(js)) return js;
    if (js && Array.isArray(js.stations)) return js.stations;
    if (js && Array.isArray(js.results)) return js.results;
    return [];
  }

  function classifyPriceError(message) {
    var s = String(message || "");
    if (/timed out|timeout/i.test(s)) return "Price feed timed out.";
    var http = s.match(/HTTP\s+(\d{3})/);
    if (http) return "Price feed HTTP " + http[1] + ".";
    if (/empty response|invalid json|unexpected token|unexpected end/i.test(s)) return "Price feed returned an empty response.";
    if (/network|failed to fetch|load failed/i.test(s)) return "Price feed failed — network error.";
    return "Price feed failed — live pump prices did not load.";
  }

  function priceFailureNote(result) {
    if (!result || result.skipped || result.aborted) return "";
    if (result.partial) return "Some live pump prices did not load.";
    if (result.error) return classifyPriceError(result.error);
    return "";
  }

  function numPrice(v) {
    var n = typeof v === "string" ? parseFloat(v) : v;
    if (!Number.isFinite(n) || n <= 0 || n > 12) return null;
    return n;
  }

  function normalizeWorkerStation(s) {
    if (!s || typeof s !== "object") return null;
    var lat = +s.lat;
    var lon = +s.lon;
    var regular = numPrice(s.regular != null ? s.regular : (s.price != null ? s.price : s.regularPrice));
    var midgrade = numPrice(s.midgrade != null ? s.midgrade : s.midgradePrice);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (regular == null && midgrade == null) return null;
    return {
      name: s.name || s.brand || "Fuel station",
      brand: s.brand || "",
      lat: lat,
      lon: lon,
      city: s.city || "",
      state: s.state || "",
      street: s.address || s.street || "",
      regular: regular,
      midgrade: midgrade,
      updated: s.updated || s.postedTime || s.lastUpdated || "",
      priceSource: s.source || "price feed"
    };
  }

  function isDeadPackGasUrl(url) {
    try {
      var u = new URL(String(url));
      return u.protocol === "https:" && u.hostname === "pack.here2serve.us" && /^\/gas\/?$/.test(u.pathname);
    } catch (e) {
      return false;
    }
  }

  function resolveStationPriceApi(saved, fallback) {
    if (saved && /^https:\/\//i.test(String(saved)) && !isDeadPackGasUrl(saved)) return String(saved);
    return fallback;
  }

  function gasLayerRequested(search, hash) {
    var query = String(search || "");
    var qIndex = query.indexOf("?");
    if (qIndex >= 0) query = query.slice(qIndex + 1);
    var gas = "";
    try {
      gas = new URLSearchParams(query).get("gas") || "";
    } catch (e) {
      gas = "";
    }
    if (gas === "1") return true;
    var h = String(hash || "");
    if (h.charAt(0) === "#") h = h.slice(1);
    return h === "gas";
  }

  function hasPumpPrice(s) {
    if (!s) return false;
    return Number(s.regular) > 0 || Number(s.midgrade) > 0;
  }

  function packMetaText(meta, hideCellErrors) {
    if (!meta) return "";
    var bits = [];
    if (meta.caches && meta.caches.length) bits.push("Pack cache " + meta.caches.join(", "));
    if (meta.sources && meta.sources.length) bits.push(meta.sources.join(", "));
    if (meta.lastErrors && meta.lastErrors.length) bits.push("upstream " + meta.lastErrors[0]);
    if (!hideCellErrors && meta.cellErrors > 0) bits.push(meta.cellErrors + " cell errors");
    return bits.join(" · ");
  }

  function priceUpdateSummary(result, loadedAt) {
    if (!result) {
      return {
        ok: false,
        stale: false,
        partial: false,
        priced: 0,
        newest: null,
        oldest: null,
        loadedAt: null,
        text: "Price feed failed — live pump prices did not load."
      };
    }
    if (result.skipped || result.aborted) {
      return { ok: false, stale: false, partial: false, priced: 0, newest: null, oldest: null, loadedAt: null, text: "" };
    }
    var failure = priceFailureNote(result);
    var stale = !!(result.meta && result.meta.stale);
    var priced = (result.stations || []).filter(hasPumpPrice);
    var metaText = packMetaText(result.meta, priced.length > 0);
    if (!priced.length) {
      var failText = failure || "No pump prices came back for this route.";
      if (metaText) failText += " · " + metaText;
      return {
        ok: false,
        stale: stale,
        partial: !!result.partial,
        usedCache: !!result.usedCache,
        priced: 0,
        newest: null,
        oldest: null,
        loadedAt: null,
        text: failText
      };
    }
    var newest = 0;
    var oldest = 0;
    priced.forEach(function (s) {
      var t = Date.parse(s.updated || "");
      if (!(t > 0)) return;
      if (!newest || t > newest) newest = t;
      if (!oldest || t < oldest) oldest = t;
    });
    var text = metaText;
    // A partial load or a cached cell still has pump prices. Say so calmly.
    // "Price feed failed" is only for a load that came back with nothing.
    if (result.partial || result.usedCache) {
      var noun = priced.length === 1 ? "station" : "stations";
      var calm = "Prices loaded (" + priced.length + " " + noun + ", some areas cached)";
      text = text ? (calm + " · " + text) : calm;
    }
    return {
      ok: true,
      stale: stale,
      partial: !!result.partial,
      usedCache: !!result.usedCache,
      priced: priced.length,
      newest: newest || null,
      oldest: oldest || null,
      loadedAt: loadedAt || null,
      text: text
    };
  }

  function priceNoteLine(summary, dates) {
    dates = dates || {};
    if (!summary || summary.skipped || summary.aborted) return "";
    if (!summary.ok) return summary.text || "";
    if (summary.text && /Prices loaded \(/.test(summary.text)) {
      var calmBits = [summary.text];
      if (dates.newest) calmBits.push("newest report " + dates.newest);
      if (dates.oldest && dates.oldest !== dates.newest) calmBits.push("oldest report " + dates.oldest);
      return calmBits.join(" · ");
    }
    var bits = [];
    if (summary.stale) {
      if (summary.text) bits.push(summary.text);
      if (dates.checked) bits.push("checked " + dates.checked);
    } else {
      bits.push("Pump prices loaded" + (dates.checked ? " " + dates.checked : ""));
      if (summary.text) bits.push(summary.text);
    }
    if (dates.newest) bits.push("newest report " + dates.newest);
    if (dates.oldest && dates.oldest !== dates.newest) bits.push("oldest report " + dates.oldest);
    return bits.join(" · ");
  }

  function abortError() {
    var e = new Error("aborted");
    e.name = "AbortError";
    return e;
  }

  function retryDelayMs(attempt, err, opts) {
    var base = opts && opts.backoffBase != null ? +opts.backoffBase : 400;
    if (!(base > 0)) return 0;
    var msg = String((err && err.message) || "");
    var factor = /HTTP\s+429\b/.test(msg) ? 2 : 1;
    return Math.round(base * factor * Math.pow(2, attempt));
  }

  function retryablePriceError(e) {
    var msg = String((e && e.message) || "");
    if (/HTTP\s+(400|401|404|410|422)\b/.test(msg)) return false;
    if (/HTTP\s+(403|408|409|425|429|500|502|503|504)\b/.test(msg)) return true;
    if (/failed to fetch|network|timeout|load failed/i.test(msg)) return true;
    return false;
  }

  function sleep(ms, signal) {
    return new Promise(function (resolve, reject) {
      if (signal && signal.aborted) {
        reject(abortError());
        return;
      }
      var timer = setTimeout(function () {
        if (signal) signal.removeEventListener("abort", onAbort);
        if (signal && signal.aborted) reject(abortError());
        else resolve();
      }, ms);
      function onAbort() {
        clearTimeout(timer);
        reject(abortError());
      }
      if (signal) signal.addEventListener("abort", onAbort);
    });
  }

  async function fetchOneTile(box, opts, normalize) {
    var url = priceUrl(opts.base, box);
    var attempts = opts.retries == null ? PRICE_FETCH_RETRIES : opts.retries;
    var lastErr = null;
    for (var attempt = 0; attempt <= attempts; attempt++) {
      if (opts.signal && opts.signal.aborted) throw abortError();
      if (attempt === 0 && opts.gap) await sleep(opts.gap, opts.signal);
      try {
        var js = await opts.fetcher(url, opts.signal, box);
        var stations = stationsFromPayload(js).map(normalize).filter(Boolean);
        var meta = metaFromPayload(js);
        var cellErrors = meta ? meta.cellErrors : 0;
        if (js && js.error && !stations.length) return { stations: [], error: String(js.error), meta: meta };
        // Empty plus cell errors is an upstream miss. Retrying it multiplies
        // GasBuddy calls and keeps the rest of the route empty, so record it once.
        if (!stations.length && cellErrors > 0) return { stations: [], error: "Price feed cell errors", meta: meta };
        return { stations: stations, meta: meta };
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        lastErr = e;
        if (attempt >= attempts || !retryablePriceError(e)) break;
        if (opts.shouldStop && opts.shouldStop()) break;
        var delay = retryDelayMs(attempt, e, opts);
        if (delay) await sleep(delay, opts.signal);
      }
    }
    return { stations: [], error: (lastErr && lastErr.message) || "Price feed failed", meta: lastErr && lastErr.meta };
  }

  async function fetchTiledPrices(latLngs, opts) {
    opts = opts || {};
    var boxes = (opts.boxes && opts.boxes.length)
      ? opts.boxes.slice()
      : boxesAlongRoute(latLngs, opts.maxSpan, opts.pad, opts.overlap);
    if (!(opts.boxes && opts.boxes.length) && opts.stops && opts.stops.length) {
      boxesForStops(boxes, opts.stops, opts.stopRadiusMi == null ? 15 : opts.stopRadiusMi, opts.maxSpan).forEach(function (b) {
        boxes.push(b);
      });
    }
    var normalize = opts.normalize || function (s) { return s; };
    var limit = opts.concurrency == null ? PRICE_FETCH_CONCURRENCY : Math.max(1, opts.concurrency | 0);
    var budget = opts.failureBudget == null ? PRICE_FAILURE_BUDGET : opts.failureBudget;
    var results = new Array(boxes.length);
    var next = 0;
    var failures = 0;
    var stop = false;
    opts.shouldStop = function () { return stop; };
    if (boxes.length) {
      var workers = Math.max(1, Math.min(limit, boxes.length));
      async function worker() {
        while (!stop) {
          var i = next++;
          if (i >= boxes.length) return;
          if (stop) {
            results[i] = { stations: [], skipped: true };
            return;
          }
          var r = await fetchOneTile(boxes[i], opts, normalize);
          results[i] = r;
          if (r && r.error) {
            failures++;
            if (budget > 0 && failures >= budget) stop = true;
          }
        }
      }
      var jobs = [];
      for (var w = 0; w < workers; w++) jobs.push(worker());
      await Promise.all(jobs);
    }
    for (var i = 0; i < results.length; i++) {
      if (!results[i]) results[i] = { stations: [], skipped: true };
    }
    var combined = combineTileResults(results);
    combined.boxes = boxes;
    return combined;
  }

  async function fetchFocusedPrices(opts) {
    opts = opts || {};
    var plan = planPriceFetch(opts);
    if (typeof opts.onCached === "function") {
      try {
        opts.onCached({
          stations: plan.cachedStations,
          usedCache: plan.cachedStations.length > 0,
          boxes: plan.boxes,
          staleBoxes: plan.staleBoxes
        });
      } catch (e) {}
    }
    if (!plan.staleBoxes.length) {
      var cachedOnly = {
        stations: plan.cachedStations,
        tiles: plan.boxes.length,
        failedTiles: plan.freshErrors,
        requests: 0,
        usedCache: true,
        fromCache: true,
        partial: plan.freshErrors > 0 && plan.cachedStations.length > 0,
        boxes: plan.boxes,
        meta: summarizePriceMeta([])
      };
      if (!plan.cachedStations.length) {
        cachedOnly.error = plan.lastError || "Price feed failed";
        cachedOnly.partial = false;
      }
      return cachedOnly;
    }
    var live = await fetchTiledPrices(opts.route || [], Object.assign({}, opts, {
      boxes: plan.staleBoxes,
      stops: null
    }));
    savePriceCells(opts.storage, plan.staleBoxes, live.tileResults, opts.now || Date.now());
    var liveByKey = {};
    plan.staleBoxes.forEach(function (box, i) {
      liveByKey[priceCellKey(box)] = (live.tileResults || [])[i] || { stations: [], skipped: true };
    });
    var stations = [];
    var failedTiles = 0;
    var usedCache = plan.freshCount > 0;
    plan.boxes.forEach(function (box) {
      var key = priceCellKey(box);
      var liveR = liveByKey[key];
      var stored = stationsFromCell(plan.store.cells[key]);
      if (!liveR) {
        stations = stations.concat(stored);
        return;
      }
      if (liveR.skipped || liveR.error) {
        failedTiles++;
        if (stored.length) usedCache = true;
        stations = stations.concat(stored);
        return;
      }
      stations = stations.concat(liveR.stations || []);
    });
    stations = dedupePriceStations(stations);
    var out = {
      stations: stations,
      tiles: plan.boxes.length,
      failedTiles: failedTiles,
      requests: live.requests || 0,
      usedCache: usedCache,
      fromCache: false,
      partial: failedTiles > 0 && stations.length > 0,
      boxes: plan.boxes,
      meta: live.meta || summarizePriceMeta([])
    };
    if (!stations.length) out.error = live.error || plan.lastError || "Price feed failed";
    return out;
  }

  root.CoastalPriceFeed = {
    PRICE_MAX_SPAN: PRICE_MAX_SPAN,
    PRICE_PAD: PRICE_PAD,
    PRICE_OVERLAP: PRICE_OVERLAP,
    PRICE_FOCUS_PAD: PRICE_FOCUS_PAD,
    PRICE_FETCH_CONCURRENCY: PRICE_FETCH_CONCURRENCY,
    PRICE_FAILURE_BUDGET: PRICE_FAILURE_BUDGET,
    PRICE_MAX_REQUESTS: PRICE_MAX_REQUESTS,
    PRICE_CACHE_TTL_MS: PRICE_CACHE_TTL_MS,
    PRICE_CACHE_KEY: PRICE_CACHE_KEY,
    splitAxis: splitAxis,
    boxesFromBbox: boxesFromBbox,
    boxesAlongRoute: boxesAlongRoute,
    boxesForStops: boxesForStops,
    radiusCovered: radiusCovered,
    dedupePriceStations: dedupePriceStations,
    combineTileResults: combineTileResults,
    priceUrl: priceUrl,
    priceCellKey: priceCellKey,
    tripDate: tripDate,
    driveEndpoints: driveEndpoints,
    legLatLngs: legLatLngs,
    focusBoxes: focusBoxes,
    planPriceFetch: planPriceFetch,
    priceFailureNote: priceFailureNote,
    classifyPriceError: classifyPriceError,
    normalizeWorkerStation: normalizeWorkerStation,
    isDeadPackGasUrl: isDeadPackGasUrl,
    resolveStationPriceApi: resolveStationPriceApi,
    gasLayerRequested: gasLayerRequested,
    priceUpdateSummary: priceUpdateSummary,
    priceNoteLine: priceNoteLine,
    fetchTiledPrices: fetchTiledPrices,
    fetchFocusedPrices: fetchFocusedPrices
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

/* Route-scoped gas price tiling.
   The Florida → North Carolina drive is one box about 8° × 8.6°.
   Requests stay at or under 1.2° on a side. Boxes near 7° time out
   or fail against the price feed, so pump prices never reach the pins.
   Tiles overlap; duplicate stations collapse to the newer price.
   Tiles are fetched a few at a time. Firing the whole route at once
   (~46 requests) is answered HTTP 403, every tile fails, and the
   pins stay blank. */
(function (root) {
  "use strict";

  var PRICE_MAX_SPAN = 1.2;
  var PRICE_PAD = 0.3;
  var PRICE_OVERLAP = 0.35;
  var PRICE_FETCH_CONCURRENCY = 4;
  var PRICE_FETCH_RETRIES = 2;

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

  function combineTileResults(results) {
    var failed = results.filter(function (r) { return r && r.error; });
    var stations = dedupePriceStations(results.reduce(function (acc, r) {
      return acc.concat((r && r.stations) || []);
    }, []));
    if (!results.length || failed.length === results.length) {
      return {
        stations: [],
        error: (failed[0] && failed[0].error) || "Price feed failed",
        tiles: results.length,
        failedTiles: failed.length
      };
    }
    if (failed.length) {
      return { stations: stations, partial: true, tiles: results.length, failedTiles: failed.length };
    }
    return { stations: stations, tiles: results.length, failedTiles: 0 };
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

  function priceFailureNote(result) {
    if (!result || result.skipped || result.aborted) return "";
    if (result.partial) return "Some live pump prices did not load.";
    if (result.error) return "Price feed failed — live pump prices did not load.";
    return "";
  }

  function hasPumpPrice(s) {
    if (!s) return false;
    return Number(s.regular) > 0 || Number(s.midgrade) > 0;
  }

  function priceUpdateSummary(result, loadedAt) {
    if (!result) {
      return {
        ok: false,
        partial: false,
        priced: 0,
        newest: null,
        loadedAt: null,
        text: "Price feed failed — live pump prices did not load."
      };
    }
    if (result.skipped || result.aborted) {
      return { ok: false, partial: false, priced: 0, newest: null, loadedAt: null, text: "" };
    }
    var failure = priceFailureNote(result);
    var priced = (result.stations || []).filter(hasPumpPrice);
    if (!priced.length) {
      return {
        ok: false,
        partial: !!result.partial,
        priced: 0,
        newest: null,
        loadedAt: null,
        text: failure || "No pump prices came back for this route."
      };
    }
    var newest = 0;
    priced.forEach(function (s) {
      var t = Date.parse(s.updated || "");
      if (t > newest) newest = t;
    });
    return {
      ok: true,
      partial: !!result.partial,
      priced: priced.length,
      newest: newest || null,
      loadedAt: loadedAt || null,
      text: failure || ""
    };
  }

  function abortError() {
    var e = new Error("aborted");
    e.name = "AbortError";
    return e;
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
      try {
        var js = await opts.fetcher(url, opts.signal, box);
        var stations = stationsFromPayload(js).map(normalize).filter(Boolean);
        var cellErrors = js && js.meta ? Number(js.meta.cellErrors) : 0;
        if (js && js.error && !stations.length) return { stations: [], error: String(js.error) };
        if (!stations.length && cellErrors > 0) return { stations: [], error: "Price feed failed" };
        return { stations: stations };
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        lastErr = e;
        if (attempt >= attempts || !retryablePriceError(e)) break;
        await sleep(400 * (attempt + 1), opts.signal);
      }
    }
    return { stations: [], error: (lastErr && lastErr.message) || "Price feed failed" };
  }

  async function mapPool(items, limit, fn) {
    var results = new Array(items.length);
    var next = 0;
    var workers = Math.max(1, Math.min(limit, items.length));
    async function worker() {
      while (next < items.length) {
        var i = next++;
        results[i] = await fn(items[i], i);
      }
    }
    var jobs = [];
    for (var w = 0; w < workers; w++) jobs.push(worker());
    await Promise.all(jobs);
    return results;
  }

  async function fetchTiledPrices(latLngs, opts) {
    opts = opts || {};
    var boxes = boxesAlongRoute(latLngs, opts.maxSpan, opts.pad, opts.overlap);
    var normalize = opts.normalize || function (s) { return s; };
    var limit = opts.concurrency == null ? PRICE_FETCH_CONCURRENCY : Math.max(1, opts.concurrency | 0);
    var results = await mapPool(boxes, limit, function (box) {
      return fetchOneTile(box, opts, normalize);
    });
    var combined = combineTileResults(results);
    combined.boxes = boxes;
    return combined;
  }

  root.CoastalPriceFeed = {
    PRICE_MAX_SPAN: PRICE_MAX_SPAN,
    PRICE_PAD: PRICE_PAD,
    PRICE_OVERLAP: PRICE_OVERLAP,
    PRICE_FETCH_CONCURRENCY: PRICE_FETCH_CONCURRENCY,
    splitAxis: splitAxis,
    boxesFromBbox: boxesFromBbox,
    boxesAlongRoute: boxesAlongRoute,
    dedupePriceStations: dedupePriceStations,
    combineTileResults: combineTileResults,
    priceUrl: priceUrl,
    priceFailureNote: priceFailureNote,
    priceUpdateSummary: priceUpdateSummary,
    fetchTiledPrices: fetchTiledPrices
  };
})(typeof globalThis !== "undefined" ? globalThis : this);

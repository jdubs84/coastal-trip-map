# Coastal trip map

Static GitHub Pages map for the Sep–Oct 2026 coastal drive (Largo FL north to the Outer Banks). The site is `index.html`.

## Gas layer

The **Gas** checkbox loads fuel stations along the driving route. **Refresh gas** loads them again.

Pins stay within about 1 mile of the driving route. A station farther off the line is not shown, including the Gas picks and the cheap stations near overnight stops. Each lodging stop still keeps up to three cheapest regular-price stations within 15 miles, but only when those stations are also within about 1 mile of the route.

### Where the data comes from

| What you see | Source | How it refreshes |
| --- | --- | --- |
| Station name, brand, approximate location | [OpenStreetMap](https://www.openstreetmap.org) via the public [Overpass](https://overpass-api.de) API | When the Gas layer turns on, and when you press **Refresh gas**. A load is cached in this browser for 12 hours so a reload does not hammer Overpass. If a stretch fails, the pins that did load are still saved, and the note says so. |
| US average regular and midgrade | [FuelEconomy.gov fuel prices](https://www.fueleconomy.gov/ws/rest/fuelprices) | Fetched on each Gas load. This is a **national average**, not the price at a pin. |
| Live pump price on a pin | `https://gas.here2serve.us/gas` | Fetched when Gas is turned on, and again on **Refresh gas**, for today's drive leg, each lodging stop, and the phone's location if geolocation is on. Fresh cells stay in this browser for 45 minutes, so turning Gas off and on, or panning the map, does not ask again. A `$` chip is printed only for a price the feed returned. |

No street price is invented. OpenStreetMap does not publish live pump prices. GasBuddy, Costco, and retailer price pages are not usable from a static GitHub Pages site: they either block browser requests (CORS or Cloudflare) or need a key. The map only prints a dollar amount on a pin when a price feed actually returns one.

### Optional station-price API

The default `STATION_PRICE_API` in `index.html` is `https://gas.here2serve.us/gas` (JSON, CORS `*`). The Worker root `https://gas.here2serve.us` answers the same JSON. A trailing slash on that URL is fine.

`https://pack.here2serve.us/gas` is the old Pack tunnel. It currently hangs with no bytes. The map does not use it. A phone that still has that exact URL saved under `coastalGasPriceApi` drops the override and uses the Worker instead.

The Florida → North Carolina drive is one box about 8° wide and 8.6° tall. The map does not send that box, and it does not split the whole drive into a hundred small cells. A direct check of the price proxy on 2026-09-29: a 1.5° box returned prices with `cellErrors: 0` (9 upstream cells), and a 2° box came back with every cell in error. Each request stays at or under 1.5° on a side (`gas-prices.js`). One load asks only for the current drive leg (from the stop dates, in Eastern time), a 15-mile box at each lodging stop, and one box around the GPS fix when location is allowed. That is under 15 requests. Two run at a time, with a short gap. HTTP 403, 429, and other retryable errors wait exponentially longer, and after a few failed cells the rest of the load stops. Stations that appear in more than one cell collapse to the newer price. Those prices are matched to nearby OpenStreetMap stations the same way as before.

Each cell is stored in this browser for 45 minutes (`coastal-gas-cells-v1`). The pins from that cache show up immediately, with the station report time. Only a stale cell is requested again. **Refresh gas** ignores the 45-minute clock and asks again, still only for those same cells. If some cells fail and any prices are already on hand, the note says prices loaded and that some areas are cached. It says the feed failed only when there are no prices at all. Pins from OpenStreetMap stay up, and a missing price is left blank.

Restaurant and Gas both start off. Nothing from those layers is requested until the box is ticked, unless the page is opened with `?gas=1` or `#gas`, which turns Gas on. While Gas is off, the note under the checkbox says so. Turning Gas on uses the 45-minute price cache. **Refresh gas** loads prices again. OpenStreetMap locations can stay cached for 12 hours; pump prices are kept separately, one cell at a time. The note under Gas is one line on a phone, with report times and source behind Details. If the feed times out, returns an HTTP error, or comes back with no prices at all, the note says that. It does not leave the pins blank with no explanation. Cached prices still show the dollar amounts and the time they were reported. They are not described as a brand-new fetch.

To point the map at a different backend, change `STATION_PRICE_API` in `index.html`, or in the browser you use for the trip:

```js
localStorage.setItem("coastalGasPriceApi", "https://your-host.example/gas");
```

Then press **Refresh gas**. The page requests:

```
GET {url}?bbox=minLon,minLat,maxLon,maxLat&grade=regular
```

and expects JSON like:

```json
{
  "stations": [
    {
      "name": "Example Fuel",
      "lat": 29.89,
      "lon": -81.31,
      "regular": 3.199,
      "midgrade": 3.599,
      "updated": "2026-09-23T15:04:00Z",
      "source": "your feed",
      "city": "St. Augustine",
      "state": "FL",
      "address": "100 Example Rd"
    }
  ]
}
```

Prices are matched to nearby OpenStreetMap stations (or shown on their own if nothing is close). Within each stretch of the route the cheaper regular is preferred, and the lowest regular in the load is marked on the map. Values that are missing, not numeric, or outside $0–$12 per gallon are ignored.

Do not put a secret in `index.html`. Anything in that file is public on GitHub Pages. Prefer a price URL that does not need a key, or keep the URL in `localStorage` on your own browser.

## Signal gaps layer

The **Signal gaps** checkbox starts off. When it is on, the map shades places within about 5 miles of the route where the chosen carrier (AT&T, Verizon or T-Mobile) reports no 4G LTE or 5G coverage. The source is the FCC National Broadband Map (Broadband Data Collection), filing as of Dec 31, 2025. FCC provider-reported coverage; real signal can be worse. The data, source and rebuild steps are in [`signal/README.md`](signal/README.md). The same panel has Starlink notes: service covers this whole coast, so the risk is tree canopy blocking the dish, not a coverage gap. It also covers T-Mobile T-Satellite, which sends texts where no cell signal reaches.

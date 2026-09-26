# Signal / dead zones layer

`deadzones-att.geojson`, `deadzones-vzw.geojson`, `deadzones-tmo.geojson` feed the **Signal gaps** toggle in `index.html`. It is off by default. `?signal=1` turns it on, and so do `?signal=att`, `?signal=vzw`, `?signal=tmo` and `#signal`.

## What the red shading means

The carrier reports **no 4G LTE (5/1 Mbps) and no 5G-NR (7/1 Mbps)** mobile broadband coverage there, outdoor stationary. **FCC provider-reported coverage; real signal can be worse.**

## Source

- [FCC National Broadband Map](https://broadbandmap.fcc.gov/data-download/nationwide-data), Broadband Data Collection (BDC). The filing is **as of December 31, 2025**, the latest one published when these files were downloaded on 2026-09-26.
- Provider files use the H3 resolution-9 hexagon format: `bdc_{12,13,37,45}_{provider}_4GLTE_mobile_broadband_h3_D25_*` and `..._5GNR_7_1_...`. The provider IDs are 130077 = AT&T, 131425 = Verizon, 130403 = T-Mobile. The states are FL (12), GA (13), NC (37) and SC (45).
- Land mask: US Census TIGER/Line 2024 counties minus TIGER 2024 AREAWATER.

## Processing (`build_deadzones.py`)

1. The corridor is 5 miles on each side of the OSRM driving route (`routeGeo`) plus 3 miles around each stop and home. Each corridor cell is an H3 res-9 hexagon.
2. A cell counts as covered if it appears in the carrier's 4G LTE file or its 5G-NR 7/1 file. Every other cell is a gap.
3. Gaps are clipped to land. AT&T and T-Mobile do not report coverage over open water, so water and bridges would otherwise look like dead zones.
4. Gaps under 0.5 km² are dropped. Shapes are simplified by about 60 m and coordinates are rounded to 5 decimals.

## Known limits

- Coverage is provider-modeled, not measured. Indoors, under trees, or at the edge of a cell, the signal can be weaker or missing.
- Bridges and causeways fall outside the land mask, so they are not shaded. Along this route those are the Howard Frankland Bridge (I-275), the Ravenel Bridge, the Alligator River Bridge, the Virginia Dare Bridge, the Washington Baum Bridge, the Basnight Bridge and the Jug Handle Bridge.
- On very narrow barrier islands such as Pea Island, a hexagon whose center falls in the water can show up as a small gap next to real coverage.

"""Rebuild signal/deadzones-{att,vzw,tmo}.geojson for the coastal trip map.

Source: FCC National Broadband Map, Broadband Data Collection (BDC), filing as of
Dec 31, 2025. Provider mobile broadband H3 (res-9) shapefiles, downloaded from
https://broadbandmap.fcc.gov/data-download/nationwide-data on 2026-09-26:
  bdc_{12,13,37,45}_{130077,131425,130403}_4GLTE_mobile_broadband_h3_D25_*.shp.zip
  bdc_{12,13,37,45}_{130077,131425,130403}_5GNR_7_1_mobile_broadband_h3_D25_*.shp.zip
  (130077 = AT&T, 131425 = Verizon, 130403 = T-Mobile; FL, GA, NC, SC)
Every hex in those files has coverage (environmnt 0 = outdoor stationary, 1 = in-vehicle),
so "covered" = the hex appears in the carrier's 4G LTE or 5G-NR (7/1) file.
Land mask: US Census TIGER/Line 2024 counties minus TIGER 2024 AREAWATER.
Put the downloads in raw/ as {st}_{car}.shp.zip and {st}_{car}5g.shp.zip,
raw/tl_county.zip, raw/aw/*.zip; route.json is routeGeo from index.html.
Needs: geopandas pyogrio shapely h3>=4 pyproj
"""
import glob, json
import geopandas as gpd, h3, pandas as pd, pyogrio, pyproj, shapely
from shapely.geometry import LineString, Point, mapping, shape, MultiPolygon
from shapely.ops import transform, unary_union

MI = 1609.344
to_m = pyproj.Transformer.from_crs(4326, 5070, always_xy=True).transform
to_ll = pyproj.Transformer.from_crs(5070, 4326, always_xy=True).transform
STOPS = [(29.8792288, -81.2835277), (32.5117018, -80.3019843), (33.3768, -79.2945),
         (34.0501778, -77.9191689), (34.670439, -77.1430219), (35.2407085, -75.6226642),
         (27.911904, -82.817489)]
CARRIERS = {'att': 'AT&T', 'vzw': 'Verizon', 'tmo': 'T-Mobile'}

route_m = transform(to_m, LineString(json.load(open('route.json'))['coordinates']))
corr_m = unary_union([route_m.simplify(50).buffer(5 * MI, resolution=8)] +
                     [Point(to_m(lo, la)).buffer(3 * MI) for la, lo in STOPS]).simplify(100)
corr = transform(to_ll, corr_m)
cells = set(h3.geo_to_cells(mapping(corr), 9))

# land = counties - area water, inside the corridor
C = corr.buffer(0.02)
cty = gpd.read_file('/vsizip/raw/tl_county.zip', bbox=C.bounds)
cty = cty[cty.intersects(C)]
aw = pd.concat([gpd.read_file('/vsizip/' + f) for f in glob.glob('raw/aw/*.zip')])
aw = aw[aw.intersects(C)]
land = shapely.make_valid(
    shapely.union_all(shapely.make_valid(cty.geometry.values)).intersection(C).difference(
        shapely.union_all(shapely.make_valid(aw.geometry.values)).intersection(C)))

def hexes(path):
    layer = pyogrio.list_layers('/vsizip/' + path)[0][0]
    df = pyogrio.read_dataframe(f'/vsizip/{path}/{layer}.shp', read_geometry=False, columns=['h3_res9_id'])
    return set(df.h3_res9_id.values)

for car, name in CARRIERS.items():
    cov = set()
    for f in glob.glob(f'raw/*_{car}.shp.zip') + glob.glob(f'raw/*_{car}5g.shp.zip'):
        cov |= hexes(f) & cells
    dead = cells - cov
    g = shape(h3.cells_to_h3shape(list(dead)).__geo_interface__).buffer(0).intersection(land)
    parts = [p for p in getattr(g, 'geoms', [g]) if p.geom_type == 'Polygon'
             and transform(to_m, p).area >= 0.5e6]            # drop gaps < 0.5 km2
    mp = unary_union(parts).simplify(0.0006, preserve_topology=True)   # ~60 m
    mp = shapely.set_precision(mp, 1e-5).buffer(0)
    feats = []
    for p in getattr(mp, 'geoms', [mp]):
        if p.is_empty or p.geom_type != 'Polygon':
            continue
        gj = mapping(p)
        gj['coordinates'] = [[[round(x, 5), round(y, 5)] for x, y in r] for r in gj['coordinates']]
        feats.append({'type': 'Feature', 'properties': {'sqmi': round(transform(to_m, p).area / MI / MI, 2)}, 'geometry': gj})
    feats.sort(key=lambda f: -f['properties']['sqmi'])
    fc = {'type': 'FeatureCollection', 'metadata': {
        'carrier': name,
        'source': 'FCC National Broadband Map (Broadband Data Collection), provider-reported mobile broadband coverage, H3 res-9 hexagon files',
        'source_url': 'https://broadbandmap.fcc.gov/data-download/nationwide-data',
        'filing': 'As of December 31, 2025 (BDC filing; downloaded 2026-09-26, files bdc_{12,13,37,45}_*_mobile_broadband_h3_D25)',
        'meaning': 'Shaded = the carrier reports neither 4G LTE (5/1 Mbps) nor 5G-NR (7/1 Mbps) coverage, outdoor stationary',
        'processing': 'Within 5 mi of the driving route and 3 mi of each stop; land only (US Census TIGER 2024 county minus area-water); gaps under 0.5 km2 dropped; simplified ~60 m',
        'caveat': 'FCC provider-reported coverage; real signal can be worse.'}, 'features': feats}
    open(f'deadzones-{car}.geojson', 'w').write(json.dumps(fc, separators=(',', ':')))
    print(car, len(feats), 'features')

/* Rest areas, service areas, and welcome centers along the coastal drive.
   Baked from OpenStreetMap on 2026-09-27. The page does not call Overpass.
   Interpreter: https://overpass.openstreetmap.fr/api/interpreter

   Highway centerlines (3 km corridor is applied locally to these ways):
   [out:json][timeout:120];
   way["ref"~"(^|;)I[- ]?4(;|$)"]["highway"~"^(motorway|trunk)$"](27.88,-82.80,29.32,-80.90);
   out tags geom;

   [out:json][timeout:120];
   way["ref"~"(^|;)I[- ]?95(;|$)"]["highway"~"^(motorway|trunk)$"](29.00,-81.75,33.12,-80.15);
   out tags geom;
   I-95 vertices north of latitude 33.00 were dropped so the corridor stops
   about Walterboro, SC (the Colleton pair near 32.80 stays; St. George does not).

   [out:json][timeout:120];
   way["ref"~"(^|;)US[- ]?17(;|$)"]["highway"~"^(motorway|trunk|primary)$"](32.05,-81.45,33.98,-78.35);
   out tags geom;

   [out:json][timeout:120];
   way["ref"~"(^|;)US[- ]?17(;|$)"]["highway"~"^(motorway|trunk|primary)$"](33.75,-78.90,35.75,-76.55);
   out tags geom;

   [out:json][timeout:120];
   way["ref"~"(^|;)NC[- ]?12(;|$)"]["highway"~"^(motorway|trunk|primary|secondary)$"](35.10,-75.95,36.10,-75.35);
   out tags geom;

   Places (same bboxes as the highways above):
   [out:json][timeout:120];
   (
     node["highway"="rest_area"]({{bbox}});
     way["highway"="rest_area"]({{bbox}});
     relation["highway"="rest_area"]({{bbox}});
     node["highway"="services"]({{bbox}});
     way["highway"="services"]({{bbox}});
     relation["highway"="services"]({{bbox}});
     node["tourism"="information"]["information"="office"]({{bbox}});
     way["tourism"="information"]["information"="office"]({{bbox}});
     relation["tourism"="information"]["information"="office"]({{bbox}});
   );
   out center tags;

   A place is kept when its center is within 3 km of one of those highways.
   Welcome centers (tourism=information + information=office) are kept only
   when the name is a welcome center, not a private attraction or town office.
   Features with no name, operator, ref, or amenity tags are kept only within
   800 m of the highway. Duplicate drawings of one site within 180 m are one pin.
   A 15 m unnamed NC-12 services polygon beside a boat ramp was left out.
   Direction is the OSM name or direction tag when present. Otherwise it is the
   carriageway the pin sits on (I-4 / I-95 route relations, else the way bearing),
   and only when the pin is within 700 m of that carriageway.
   State is from addr:state or Nominatim (zoom 5) on these coordinates.
   Seminole County I-4 refs 50221 (EB) and 50222 (WB) are included as tagged.
   OSM does not mark 50221 truck-only, so this file does not add that label.
*/
var REST_AREAS = [
  {
    "id": "way/226885967",
    "name": "Flying J Travel Center",
    "lat": 28.009729,
    "lon": -82.303569,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "WB",
    "directionSource": "carriageway",
    "ref": "625",
    "amenities": {
      "toilets": "yes",
      "hgv": "yes"
    }
  },
  {
    "id": "way/226886059",
    "name": "TA",
    "lat": 28.00998,
    "lon": -82.300621,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "WB",
    "directionSource": "carriageway",
    "ref": "0158",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1079278538",
    "name": "I-4 Westbound weighing station",
    "lat": 28.017098,
    "lon": -82.272023,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "WB",
    "directionSource": "name",
    "operator": "Florida Department of Transportation",
    "opening_hours": "24/7"
  },
  {
    "id": "way/1079278537",
    "name": "I-4 Eastbound weighing station",
    "lat": 28.015216,
    "lon": -82.267174,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "EB",
    "directionSource": "name",
    "operator": "Florida Department of Transportation",
    "opening_hours": "24/7"
  },
  {
    "id": "way/1478895947",
    "name": "",
    "lat": 28.133879,
    "lon": -81.902271,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "EB",
    "directionSource": "carriageway",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1236821869",
    "name": "",
    "lat": 28.155154,
    "lon": -81.80288,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "EB",
    "directionSource": "carriageway",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/224604083",
    "name": "Love's Travel Stop",
    "lat": 28.155597,
    "lon": -81.800179,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "direction": "EB",
    "directionSource": "carriageway",
    "ref": "228",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "node/13728758601",
    "name": "Rest Area",
    "lat": 28.167433,
    "lon": -81.770868,
    "highway": "I-4",
    "kind": "rest_area",
    "state": "FL",
    "direction": "EB",
    "directionSource": "carriageway",
    "ref": "10201",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    },
    "also": [
      "node/772357076"
    ]
  },
  {
    "id": "node/772356988",
    "name": "",
    "lat": 28.173991,
    "lon": -81.766835,
    "highway": "I-4",
    "kind": "rest_area",
    "state": "FL",
    "direction": "WB",
    "directionSource": "carriageway",
    "ref": "10202",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1222403125",
    "name": "Love's Travel Stop",
    "lat": 28.243732,
    "lon": -81.65779,
    "highway": "I-4",
    "kind": "services",
    "state": "FL",
    "ref": "627",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1036015058",
    "name": "",
    "lat": 28.701826,
    "lon": -81.384579,
    "highway": "I-4",
    "kind": "rest_area",
    "state": "FL",
    "direction": "WB",
    "directionSource": "carriageway",
    "ref": "50222",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1415732777",
    "name": "",
    "lat": 28.724748,
    "lon": -81.37392,
    "highway": "I-4",
    "kind": "rest_area",
    "state": "FL",
    "direction": "EB",
    "directionSource": "carriageway",
    "ref": "50221",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1332579850",
    "name": "Buc-ee's",
    "lat": 29.223371,
    "lon": -81.100053,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "NB",
    "directionSource": "carriageway",
    "amenities": {
      "toilets": "yes",
      "hgv": "no"
    }
  },
  {
    "id": "way/1325271264",
    "name": "Love's Travel Stop",
    "lat": 29.339994,
    "lon": -81.134446,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "316",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "node/1724808019",
    "name": "",
    "lat": 29.702012,
    "lon": -81.327097,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "FL",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "20331",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "node/1724808030",
    "name": "",
    "lat": 29.715498,
    "lon": -81.334514,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "FL",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "20332",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1365984792",
    "name": "Love's Travel Stop",
    "lat": 29.74544,
    "lon": -81.349258,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "894",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/230492226",
    "name": "Flying J Travel Center",
    "lat": 29.750159,
    "lon": -81.344835,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "626",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1412098183",
    "name": "Buc-ee's",
    "lat": 29.983774,
    "lon": -81.463897,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "SB",
    "directionSource": "carriageway",
    "amenities": {
      "hgv": "no"
    }
  },
  {
    "id": "way/226884512",
    "name": "Pilot Travel Center",
    "lat": 30.065882,
    "lon": -81.49421,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "91",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/226884195",
    "name": "TA",
    "lat": 30.066424,
    "lon": -81.496398,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "0248",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/466038771",
    "name": "Saint Johns County Rest Area I-95 Northbound",
    "lat": 30.09138,
    "lon": -81.496446,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "FL",
    "direction": "NB",
    "directionSource": "name"
  },
  {
    "id": "way/466038770",
    "name": "Saint Johns County Rest Area I-95 Southbound",
    "lat": 30.094659,
    "lon": -81.499445,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "FL",
    "direction": "SB",
    "directionSource": "name",
    "ref": "20322",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1259760540",
    "name": "Love's Travel Stop",
    "lat": 30.462079,
    "lon": -81.674525,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "ref": "828",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/408944359",
    "name": "Love's Travel Stop",
    "lat": 30.516347,
    "lon": -81.632847,
    "highway": "I-95",
    "kind": "services",
    "state": "FL",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "603",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/661040199",
    "name": "Official Florida Welcome Center",
    "lat": 30.697205,
    "lon": -81.67815,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "FL",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "20310",
    "operator": "Florida Department of Transportation",
    "amenities": {
      "toilets": "yes"
    },
    "also": [
      "node/7233604904"
    ]
  },
  {
    "id": "way/349598590",
    "name": "Georgia Visitor Information Center",
    "lat": 30.754433,
    "lon": -81.64954,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway",
    "also": [
      "node/7233604903"
    ]
  },
  {
    "id": "way/235562662",
    "name": "Pilot Travel Center",
    "lat": 30.760329,
    "lon": -81.655923,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "4562",
    "amenities": {
      "fuel:diesel": "yes",
      "fuel:octane_87": "yes",
      "fuel:octane_89": "yes",
      "fuel:octane_91": "yes",
      "toilets": "yes",
      "hgv": "yes"
    }
  },
  {
    "id": "way/235562392",
    "name": "Pilot Travel Center",
    "lat": 30.762735,
    "lon": -81.650621,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "575",
    "amenities": {
      "fuel:diesel": "yes",
      "fuel:e10": "yes",
      "fuel:e15_octane_88": "yes",
      "fuel:octane_87": "yes",
      "fuel:octane_89": "yes",
      "fuel:octane_91": "yes",
      "toilets": "yes",
      "hgv": "yes"
    }
  },
  {
    "id": "way/219430577",
    "name": "Petro Stopping Centers",
    "lat": 30.794808,
    "lon": -81.666119,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "0344",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1104205215",
    "name": "",
    "lat": 30.823632,
    "lon": -81.663295,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/1104205217",
    "name": "",
    "lat": 30.825968,
    "lon": -81.661683,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/146211352",
    "name": "Circle K",
    "lat": 30.849372,
    "lon": -81.669088,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/1098702948",
    "name": "",
    "lat": 30.947786,
    "lon": -81.689464,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/1415333266",
    "name": "QuikTrip",
    "lat": 31.136485,
    "lon": -81.569738,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "7136",
    "amenities": {
      "compressed_air": "yes",
      "hgv": "yes"
    }
  },
  {
    "id": "way/223478773",
    "name": "TA",
    "lat": 31.137665,
    "lon": -81.57987,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "0258",
    "amenities": {
      "toilets": "yes",
      "hgv": "yes"
    }
  },
  {
    "id": "way/223435251",
    "name": "Love's Travel Stop",
    "lat": 31.138141,
    "lon": -81.571252,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "405",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1098947284",
    "name": "",
    "lat": 31.13855,
    "lon": -81.581475,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/223436883",
    "name": "Flying J Travel Center",
    "lat": 31.140379,
    "lon": -81.578377,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "627",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/472272351",
    "name": "",
    "lat": 31.279759,
    "lon": -81.490198,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1099758297",
    "name": "",
    "lat": 31.399491,
    "lon": -81.449536,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/1233648519",
    "name": "",
    "lat": 31.78132,
    "lon": -81.382632,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/226931517",
    "name": "TA",
    "lat": 31.924189,
    "lon": -81.332065,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "0177",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1325270049",
    "name": "Love's Travel Stop",
    "lat": 31.959963,
    "lon": -81.331953,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "338",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/236500107",
    "name": "Pilot Travel Center",
    "lat": 32.188277,
    "lon": -81.195523,
    "highway": "I-95",
    "kind": "services",
    "state": "GA",
    "direction": "NB",
    "directionSource": "carriageway",
    "ref": "71",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/474114145",
    "name": "Georgia Visitor Information Center",
    "lat": 32.21657,
    "lon": -81.174406,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "GA",
    "direction": "SB",
    "directionSource": "carriageway",
    "amenities": {
      "hgv": "yes"
    },
    "also": [
      "node/4762748974"
    ]
  },
  {
    "id": "way/475431162",
    "name": "South Carolina Welcome Center - Hardeeville",
    "lat": 32.266938,
    "lon": -81.086455,
    "highway": "I-95",
    "kind": "services",
    "state": "SC",
    "direction": "NB",
    "directionSource": "carriageway",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/1091376514",
    "name": "Love's Travel Stop",
    "lat": 32.705084,
    "lon": -80.874894,
    "highway": "I-95",
    "kind": "services",
    "state": "SC",
    "direction": "SB",
    "directionSource": "carriageway",
    "ref": "740",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/477230286",
    "name": "",
    "lat": 32.800208,
    "lon": -80.772788,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "SC",
    "direction": "SB",
    "directionSource": "carriageway",
    "amenities": {
      "bin": "yes",
      "drinking_water": "yes",
      "picnic_table": "yes",
      "toilets": "yes"
    }
  },
  {
    "id": "way/477230288",
    "name": "",
    "lat": 32.800915,
    "lon": -80.770686,
    "highway": "I-95",
    "kind": "rest_area",
    "state": "SC",
    "direction": "NB",
    "directionSource": "carriageway",
    "amenities": {
      "bin": "yes",
      "drinking_water": "yes",
      "picnic_table": "yes",
      "toilets": "yes"
    }
  },
  {
    "id": "way/1317853171",
    "name": "Pilot Travel Center",
    "lat": 32.269011,
    "lon": -81.081893,
    "highway": "US-17",
    "kind": "services",
    "state": "SC",
    "direction": "both",
    "directionSource": "carriageway",
    "ref": "4569",
    "amenities": {
      "hgv": "yes"
    }
  },
  {
    "id": "way/1415416302",
    "name": "QuikTrip",
    "lat": 32.270513,
    "lon": -81.079026,
    "highway": "US-17",
    "kind": "services",
    "state": "SC",
    "direction": "both",
    "directionSource": "carriageway",
    "ref": "7135",
    "amenities": {
      "compressed_air": "yes",
      "hgv": "yes"
    }
  },
  {
    "id": "way/753698986",
    "name": "South Carolina Welcome Center",
    "lat": 33.884744,
    "lon": -78.600126,
    "highway": "US-17",
    "kind": "services",
    "state": "SC",
    "direction": "SB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/1464952839",
    "name": "",
    "lat": 33.974985,
    "lon": -78.405345,
    "highway": "US-17",
    "kind": "rest_area",
    "state": "NC",
    "direction": "EB",
    "directionSource": "carriageway",
    "amenities": {
      "bin": "yes",
      "toilets": "yes"
    },
    "opening_hours": "24/7"
  },
  {
    "id": "node/7549510095",
    "name": "US 70 Craven County",
    "lat": 35.136145,
    "lon": -77.170975,
    "highway": "US-17",
    "kind": "rest_area",
    "state": "NC",
    "amenities": {
      "toilets": "yes"
    }
  },
  {
    "id": "way/640422527",
    "name": "Beaufort County Rest Area",
    "lat": 35.492012,
    "lon": -77.105959,
    "highway": "US-17",
    "kind": "rest_area",
    "state": "NC",
    "direction": "NB",
    "directionSource": "carriageway"
  },
  {
    "id": "way/318279679",
    "name": "Hatteras Welcome Center",
    "lat": 35.220269,
    "lon": -75.690426,
    "highway": "NC-12",
    "kind": "welcome",
    "state": "NC",
    "direction": "both",
    "directionSource": "carriageway",
    "operator": "Outer Banks Visitors Bureau",
    "opening_hours": "Jan, Feb, Dec closed; Mar-Nov 09:00-17:00"
  }
];

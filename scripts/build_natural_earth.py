#!/usr/bin/env python3
"""Build the offline Natural Earth basemap data in frontend/public/basemaps.

Downloads Natural Earth 1:50m land, lakes and country borders (public domain)
from a pinned release, drops their attributes and rounds coordinates to two
decimals (~1 km, below the 1:50m data's own resolution), and writes minified
GeoJSON. The frontend draws it as the default basemap (frontend/src/lib/
basemaps.ts); `pnpm build` copies it into frontend/dist, which the extension
embeds gzip-compressed, so the map works with no network.

Only needs re-running to change the release, layers or precision; commit the
output together with the rebuilt frontend/dist.
"""
import argparse
import json
import os
import sys
import urllib.request

RELEASE = "v5.1.2"
BASE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{RELEASE}/geojson"
# Output name -> Natural Earth layer.
LAYERS = {
    "land": "ne_50m_land",
    "lakes": "ne_50m_lakes",
    "borders": "ne_50m_admin_0_boundary_lines_land",
}
PRECISION = 2


def round_coords(coords, precision):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], precision), round(coords[1], precision)]
    return [round_coords(c, precision) for c in coords]


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        default=os.path.join(root, "frontend", "public", "basemaps", "natural-earth"),
    )
    args = parser.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)

    for name, layer in LAYERS.items():
        url = f"{BASE}/{layer}.geojson"
        with urllib.request.urlopen(url) as resp:
            source = json.load(resp)
        features = [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {
                    "type": f["geometry"]["type"],
                    "coordinates": round_coords(f["geometry"]["coordinates"], PRECISION),
                },
            }
            for f in source["features"]
            if f.get("geometry")
        ]
        out = os.path.join(args.out_dir, f"{name}.json")
        with open(out, "w") as f:
            json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))
        print(f"{out}: {len(features)} features, {os.path.getsize(out) // 1024} KB", file=sys.stderr)


if __name__ == "__main__":
    main()

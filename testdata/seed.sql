-- testdata/seed.sql — deterministic generator for the persistent test database.
--
-- Produces a set of layers that exercise every render path in the frontend
-- (GeoArrow point / line / polygon, plus a dense point table for the ST_AsMVT
-- tile path and the Arrow benchmark). Geometry columns are all named `geom`,
-- matching the frontend's convention and duckgl's name-based detection.
--
-- Rebuild with:  testdata/build.sh   (wraps this into testdata/demo.duckdb)

INSTALL spatial;
LOAD spatial;

-- Deterministic randomness so the dense point layer is byte-stable across rebuilds.
SELECT setseed(0.42);

-- 1) POINT layer — a handful of world cities with real attributes.
CREATE OR REPLACE TABLE cities AS
SELECT * FROM (VALUES
  ('Tokyo',    'JP', 37400068, ST_Point(139.6917,  35.6895)),
  ('Delhi',    'IN', 28514000, ST_Point( 77.1025,  28.7041)),
  ('Shanghai', 'CN', 25582000, ST_Point(121.4737,  31.2304)),
  ('São Paulo','BR', 21650000, ST_Point(-46.6333, -23.5505)),
  ('New York', 'US', 18819000, ST_Point(-74.0060,  40.7128)),
  ('London',   'GB',  9046000, ST_Point( -0.1276,  51.5074)),
  ('Zürich',   'CH',   434000, ST_Point(  8.5417,  47.3769)),
  ('Berlin',   'DE',  3669000, ST_Point( 13.4050,  52.5200))
) AS t(name, country, population, geom);

-- 2) POLYGON layer — a couple of bounding-box "regions".
CREATE OR REPLACE TABLE regions AS
SELECT * FROM (VALUES
  ('Alpine box', ST_GeomFromText('POLYGON((6 45.8, 10.5 45.8, 10.5 47.8, 6 47.8, 6 45.8))')),
  ('Rhine box',  ST_GeomFromText('POLYGON((7.5 47, 8.8 47, 8.8 47.8, 7.5 47.8, 7.5 47))'))
) AS t(name, geom);

-- 3) LINESTRING layer — a few routes.
CREATE OR REPLACE TABLE roads AS
SELECT * FROM (VALUES
  ('A1', ST_GeomFromText('LINESTRING(8.30 47.20, 8.45 47.28, 8.55 47.37, 8.70 47.45)')),
  ('A3', ST_GeomFromText('LINESTRING(8.32 47.48, 8.50 47.40, 8.66 47.30, 8.78 47.22)'))
) AS t(name, geom);

-- 4) Dense POINT layer — ~60k points in a Zürich-area bbox (8.3–8.8 lon,
--    47.2–47.5 lat). Feeds the ST_AsMVT tile path (tile-check.mjs jumps to
--    [8.5, 47.25] z10) and the Arrow render/benchmark. `id` + `name` props.
CREATE OR REPLACE TABLE pts AS
SELECT
  i                                   AS id,
  'p' || i                            AS name,
  ST_Point(8.3 + random() * 0.5,
           47.2 + random() * 0.3)     AS geom
FROM range(1, 60001) AS t(i);

-- Quick sanity summary when run interactively.
SELECT 'cities'  AS layer, count(*) AS n FROM cities
UNION ALL SELECT 'regions', count(*) FROM regions
UNION ALL SELECT 'roads',   count(*) FROM roads
UNION ALL SELECT 'pts',     count(*) FROM pts
ORDER BY layer;

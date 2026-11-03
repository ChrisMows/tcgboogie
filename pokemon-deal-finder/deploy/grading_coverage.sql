-- How many cards in the shared price store (catalog_cache) have a raw price and PSA 10 sales: the coverage a
-- "grading gap" finder would have with no extra price-service calls. Read-only (the transaction is rolled back).
-- Run on the VPS:  sudo -u postgres psql -d tcgboogie -f grading_coverage.sql
-- full   = a card's own page data (asks for graded sales);  search = the bot's lighter search lookups.
BEGIN READ ONLY;
WITH c AS (
  SELECT CASE WHEN key ~ '/cards/[0-9]+' THEN 'full' WHEN key ~ '/cards\?' THEN 'search' ELSE 'other' END AS src,
         (key ~ 'language=japanese') AS jp, e AS card
  FROM catalog_cache,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(data->'data') = 'array' THEN data->'data'
                                         WHEN jsonb_typeof(data->'data') = 'object' THEN jsonb_build_array(data->'data')
                                         ELSE '[]'::jsonb END) e
  WHERE key ~ '/cards'
), d AS (
  SELECT src, jp, card->>'tcgPlayerId' AS id,
         (card->'prices'->>'market') IS NOT NULL OR card->'variants' IS NOT NULL AS has_raw,
         coalesce(card->'ebay'->'salesByGrade' ? 'psa10', false) AS has_psa10,
         coalesce((card->'ebay'->'salesByGrade'->'psa10'->>'count')::int, 0) AS psa10_n,
         card->'ebay'->'salesByGrade'->'psa10'->'smartMarketPrice'->>'confidence' AS conf
  FROM c
)
SELECT src, jp AS japanese, count(DISTINCT id) AS cards,
       count(DISTINCT id) FILTER (WHERE has_raw) AS with_raw,
       count(DISTINCT id) FILTER (WHERE has_psa10) AS with_psa10,
       count(DISTINCT id) FILTER (WHERE has_psa10 AND (conf IN ('high', 'medium') OR psa10_n >= 3)) AS psa10_solid
FROM d GROUP BY 1, 2 ORDER BY 1, 2;
ROLLBACK;

-- ============================================================================
-- 0044 - Library content update (idempotent / safe to re-run)
--   1. Seven new global stitch_type items, appended after the 0010 fourteen in
--      the same shape: guarded insert, properties {spi_range, thread_weight,
--      iso_code, use_case} (left null rather than invented for these
--      seam-appearance types), and an inline SVG diagram in image_url as a
--      pre-computed base64 data URI. The approved artwork was authored on a
--      120x90 canvas; it is stored here rescaled to the library's 120x80
--      convention (a pure y-5 translation — geometry and stroke weights
--      untouched, seam line on y=40 like every 0010 diagram) so all stitch
--      diagrams share one coordinate system.
--   2. Category rename print_type -> embellishment: a REAL enum value rename
--      (key and label), not display-only. Postgres carries existing rows —
--      the nine 0010 print items resolve under 'embellishment' automatically.
--      The retired 'print' value of canvas_layer_type is deliberately NOT
--      touched (out of app use; renaming it would be a second pointless enum
--      migration).
--   3. Four new global embellishment items. No diagrams and empty properties:
--      the existing print items carry no images, and their artwork-spec
--      fields (artwork_format, colour_mode...) are left for real values
--      rather than guessed ones.
-- ============================================================================

-- ---- 1. Seven stitch & seam types (SVG diagrams in image_url) ----------------
insert into public.library_items (category, source, workspace_id, name, description, properties, image_url, is_active, created_by)
select v.cat, v.src, v.ws, v.name, v.description, v.props, v.image_url, true, null
from (values
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'No Visible Stitch',
   'Clean seam with no stitching visible on the outside.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjIyIiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjI0IiB5PSIzMyIgd2lkdGg9IjcyIiBoZWlnaHQ9IjE0IiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjI0IiB5MT0iNDAiIHgyPSI5NiIgeTI9IjQwIiBzdHJva2U9IiMxQTFBMkUiIHN0cm9rZS13aWR0aD0iMSIvPjwvc3ZnPg=='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Single-Needle Topstitch',
   'One visible stitch line positioned beside the seam.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjIyIiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjI0IiB5PSIzMyIgd2lkdGg9IjcyIiBoZWlnaHQ9IjE0IiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjI0IiB5MT0iNDAiIHgyPSI5NiIgeTI9IjQwIiBzdHJva2U9IiMxQTFBMkUiIHN0cm9rZS13aWR0aD0iMSIvPjxsaW5lIHgxPSIyNiIgeTE9IjQ0IiB4Mj0iOTQiIHkyPSI0NCIgc3Ryb2tlPSIjM0EzQTRBIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWRhc2hhcnJheT0iNSAzIi8+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Twin-Needle Topstitch, One Side',
   'Two parallel stitch lines positioned together on one side of the seam.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjIyIiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjI0IiB5PSIzMyIgd2lkdGg9IjcyIiBoZWlnaHQ9IjE0IiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjI0IiB5MT0iNDAiIHgyPSI5NiIgeTI9IjQwIiBzdHJva2U9IiMxQTFBMkUiIHN0cm9rZS13aWR0aD0iMSIvPjxsaW5lIHgxPSIyNiIgeTE9IjQzIiB4Mj0iOTQiIHkyPSI0MyIgc3Ryb2tlPSIjM0EzQTRBIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWRhc2hhcnJheT0iNSAzIi8+PGxpbmUgeDE9IjI2IiB5MT0iNDYiIHgyPSI5NCIgeTI9IjQ2IiBzdHJva2U9IiMzQTNBNEEiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtZGFzaGFycmF5PSI1IDMiLz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Twin-Needle Topstitch, Straddling Seam',
   'One visible stitch line positioned on either side of the seam.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjIyIiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjI0IiB5PSIzMyIgd2lkdGg9IjcyIiBoZWlnaHQ9IjE0IiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjI0IiB5MT0iNDAiIHgyPSI5NiIgeTI9IjQwIiBzdHJva2U9IiMxQTFBMkUiIHN0cm9rZS13aWR0aD0iMSIvPjxsaW5lIHgxPSIyNiIgeTE9IjM2IiB4Mj0iOTQiIHkyPSIzNiIgc3Ryb2tlPSIjM0EzQTRBIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWRhc2hhcnJheT0iNSAzIi8+PGxpbmUgeDE9IjI2IiB5MT0iNDQiIHgyPSI5NCIgeTI9IjQ0IiBzdHJva2U9IiMzQTNBNEEiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtZGFzaGFycmF5PSI1IDMiLz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Flatlock',
   'A flat seam with visible stitching running across the fabric join.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjE2IiB5PSIyNSIgd2lkdGg9Ijg4IiBoZWlnaHQ9IjMwIiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjIyIiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjIwIiB5MT0iNDAiIHgyPSIxMDAiIHkyPSI0MCIgc3Ryb2tlPSIjMUExQTJFIiBzdHJva2Utd2lkdGg9IjEiIHN0cm9rZS1kYXNoYXJyYXk9IjIgMiIvPjxsaW5lIHgxPSIyNCIgeTE9IjM1IiB4Mj0iOTYiIHkyPSIzNSIgc3Ryb2tlPSIjMUExQTJFIiBzdHJva2Utd2lkdGg9IjEuMyIvPjxsaW5lIHgxPSIyNCIgeTE9IjQ1IiB4Mj0iOTYiIHkyPSI0NSIgc3Ryb2tlPSIjMUExQTJFIiBzdHJva2Utd2lkdGg9IjEuMyIvPjxnIHN0cm9rZT0iIzFBMUEyRSIgc3Ryb2tlLXdpZHRoPSIxIj48bGluZSB4MT0iMjYiIHkxPSIzNSIgeDI9IjI2IiB5Mj0iNDAiLz48bGluZSB4MT0iMzQiIHkxPSIzNSIgeDI9IjM0IiB5Mj0iNDAiLz48bGluZSB4MT0iNDIiIHkxPSIzNSIgeDI9IjQyIiB5Mj0iNDAiLz48bGluZSB4MT0iNTAiIHkxPSIzNSIgeDI9IjUwIiB5Mj0iNDAiLz48bGluZSB4MT0iNTgiIHkxPSIzNSIgeDI9IjU4IiB5Mj0iNDAiLz48bGluZSB4MT0iNjYiIHkxPSIzNSIgeDI9IjY2IiB5Mj0iNDAiLz48bGluZSB4MT0iNzQiIHkxPSIzNSIgeDI9Ijc0IiB5Mj0iNDAiLz48bGluZSB4MT0iODIiIHkxPSIzNSIgeDI9IjgyIiB5Mj0iNDAiLz48bGluZSB4MT0iOTAiIHkxPSIzNSIgeDI9IjkwIiB5Mj0iNDAiLz48bGluZSB4MT0iMzAiIHkxPSI0NSIgeDI9IjMwIiB5Mj0iNDAiLz48bGluZSB4MT0iMzgiIHkxPSI0NSIgeDI9IjM4IiB5Mj0iNDAiLz48bGluZSB4MT0iNDYiIHkxPSI0NSIgeDI9IjQ2IiB5Mj0iNDAiLz48bGluZSB4MT0iNTQiIHkxPSI0NSIgeDI9IjU0IiB5Mj0iNDAiLz48bGluZSB4MT0iNjIiIHkxPSI0NSIgeDI9IjYyIiB5Mj0iNDAiLz48bGluZSB4MT0iNzAiIHkxPSI0NSIgeDI9IjcwIiB5Mj0iNDAiLz48bGluZSB4MT0iNzgiIHkxPSI0NSIgeDI9Ijc4IiB5Mj0iNDAiLz48bGluZSB4MT0iODYiIHkxPSI0NSIgeDI9Ijg2IiB5Mj0iNDAiLz48bGluZSB4MT0iOTQiIHkxPSI0NSIgeDI9Ijk0IiB5Mj0iNDAiLz48L2c+PC9zdmc+'),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Turned Hem, Single Stitch',
   'The fabric edge is folded inside and secured with one visible stitch line.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjM0IiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjI0IiB5PSIzMyIgd2lkdGg9IjcyIiBoZWlnaHQ9IjI2IiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjI0IiB5MT0iNTkiIHgyPSI5NiIgeTI9IjU5IiBzdHJva2U9IiMxQTFBMkUiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGxpbmUgeDE9IjI2IiB5MT0iNTEiIHgyPSI5NCIgeTI9IjUxIiBzdHJva2U9IiMzQTNBNEEiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtZGFzaGFycmF5PSI1IDMiLz48L3N2Zz4='),
  ('stitch_type'::public.library_category,
   'global'::public.library_source,
   null::uuid,
   'Turned Hem, Twin Stitch',
   'The fabric edge is folded inside and secured with two visible parallel stitch lines.',
   '{"spi_range":null,"thread_weight":null,"iso_code":null,"use_case":null}'::jsonb,
   'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMjAgODAiIHdpZHRoPSIxMjAiIGhlaWdodD0iODAiPjxyZWN0IHg9IjIwIiB5PSIyOSIgd2lkdGg9IjgwIiBoZWlnaHQ9IjM0IiByeD0iMyIgZmlsbD0iIzNBM0E0QSIvPjxyZWN0IHg9IjI0IiB5PSIzMyIgd2lkdGg9IjcyIiBoZWlnaHQ9IjI2IiBmaWxsPSIjQzhGMDAwIi8+PGxpbmUgeDE9IjI0IiB5MT0iNTkiIHgyPSI5NiIgeTI9IjU5IiBzdHJva2U9IiMxQTFBMkUiIHN0cm9rZS13aWR0aD0iMi41Ii8+PGxpbmUgeDE9IjI2IiB5MT0iNDgiIHgyPSI5NCIgeTI9IjQ4IiBzdHJva2U9IiMzQTNBNEEiIHN0cm9rZS13aWR0aD0iMS41IiBzdHJva2UtZGFzaGFycmF5PSI1IDMiLz48bGluZSB4MT0iMjYiIHkxPSI1MyIgeDI9Ijk0IiB5Mj0iNTMiIHN0cm9rZT0iIzNBM0E0QSIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1kYXNoYXJyYXk9IjUgMyIvPjwvc3ZnPg==')
) as v(cat, src, ws, name, description, props, image_url)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global'
    and li.category = 'stitch_type'::public.library_category
    and li.name = v.name
);

-- ---- 2. Enum value rename: print_type -> embellishment -----------------------
-- RENAME VALUE (unlike ADD VALUE) is transaction-safe and rewrites nothing:
-- existing library_items rows keep their enum OID and simply read back as
-- 'embellishment'. Guarded so a re-run (value already renamed) is a no-op.
do $$ begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'library_category'
      and e.enumlabel = 'print_type'
  ) then
    alter type public.library_category rename value 'print_type' to 'embellishment';
  end if;
end $$;

-- ---- 3. Four new embellishment items -----------------------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'embellishment'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, '{}'::jsonb, true, null
from (values
  ('Direct Embroidery','Thread embroidery stitched directly onto the garment panel.'),
  ('Blockout DTF','Direct-to-film heat transfer with an opaque blockout layer.'),
  ('Sublimated Patch','Sublimation-printed patch applied to the garment.'),
  ('Screen Print Sticker','Screen-printed transfer applied as a sticker.')
) as v(name, description)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global'
    and li.category = 'embellishment'::public.library_category
    and li.name = v.name
);

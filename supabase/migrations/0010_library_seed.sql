-- ============================================================================
-- 0010 — Master Library global seed (idempotent / safe to re-run)
-- Seeds the activewear default catalogue: every row is source='global',
-- workspace_id=null, is_active=true, created_by=null. Each insert is guarded by
-- `where not exists (... source='global' and category=… and name=…)` so
-- re-running never duplicates.
--
-- Colourways: fabrics/trims/zips/buttons/elastics/drawcords/thread carry a
-- `colours` array of {name, pantone_tcx, hex} under properties.colours (the
-- single standardized colour key — the seed list's per-category `colour_options`
-- field is folded into this). Seeded with the four common defaults
-- (Black / White / Navy / Volt); workspaces layer their own colourways on top.
--
-- Stitch types: the 14 stitch_type rows store a distinct 2-colour SVG diagram
-- (fabric #6B7280, stitch path #C8F000, 120x80 viewBox) inline in image_url as a
-- base64 data URI, built in-SQL from a dollar-quoted SVG literal via
-- encode(convert_to(...,'UTF8'),'base64') with newlines stripped.
-- ============================================================================

-- ---- Category 1 — Fabrics (all carry colours) --------------------------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'fabric'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('Performance Poly Jersey','Moisture-wicking 4-way stretch single jersey for performance base and mid layers.','{"composition":"92% Polyester / 8% Elastane","gsm":180,"width_cm":150,"construction":"Single Jersey Knit","finish":"Moisture-wicking","stretch":"4-way"}'),
  ('Double Knit Scuba','Structured 2-way stretch double knit with body for moulded silhouettes.','{"composition":"95% Polyester / 5% Elastane","gsm":280,"width_cm":150,"construction":"Double Knit","finish":"Structured","stretch":"2-way"}'),
  ('Brushed Back Fleece','Cotton-rich loopback fleece with a brushed interior for warmth.','{"composition":"80% Cotton / 20% Polyester","gsm":320,"width_cm":180,"construction":"Loopback Fleece","finish":"Brushed interior","stretch":"None"}'),
  ('Tech Fleece Bonded','Bonded 3-layer technical fleece, warm and water-resistant.','{"composition":"100% Polyester","gsm":300,"width_cm":150,"construction":"Bonded 3-layer","finish":"Water-resistant","stretch":"None"}'),
  ('Power Mesh','Breathable 4-way stretch warp-knit mesh for panels and linings.','{"composition":"80% Nylon / 20% Elastane","gsm":130,"width_cm":150,"construction":"Warp Knit Mesh","finish":"Breathable","stretch":"4-way"}'),
  ('Birdseye Mesh','Quick-dry birdseye knit for breathable performance tops.','{"composition":"100% Polyester","gsm":140,"width_cm":160,"construction":"Birdseye Knit","finish":"Quick-dry","stretch":"None"}'),
  ('Ripstop Nylon','Lightweight DWR-coated ripstop woven for shells and outerwear.','{"composition":"100% Nylon","gsm":70,"width_cm":145,"construction":"Ripstop Woven","finish":"DWR coated","stretch":"None"}'),
  ('4-Way Stretch Woven','DWR-coated 4-way stretch woven for shorts and bottoms.','{"composition":"88% Polyester / 12% Elastane","gsm":200,"width_cm":145,"construction":"Plain Weave","finish":"DWR coated","stretch":"4-way"}'),
  ('Single Jersey Cotton','Combed 100% cotton single jersey for soft everyday tees.','{"composition":"100% Cotton","gsm":160,"width_cm":180,"construction":"Single Jersey","finish":"Combed","stretch":"None"}'),
  ('French Terry','Soft 2-way stretch French terry for joggers and crews.','{"composition":"95% Cotton / 5% Elastane","gsm":280,"width_cm":180,"construction":"French Terry Knit","finish":"Soft handle","stretch":"2-way"}'),
  ('Rib Knit 2x2','Tubular 2x2 rib for cuffs, collars and waistbands.','{"composition":"95% Cotton / 5% Elastane","gsm":240,"width_cm":90,"construction":"2x2 Rib","finish":"Tubular","stretch":"2-way"}'),
  ('Softshell 3-Layer','Wind- and water-resistant bonded softshell with 2-way stretch.','{"composition":"94% Polyester / 6% Elastane","gsm":310,"width_cm":150,"construction":"Bonded Softshell","finish":"Wind/water-resistant","stretch":"2-way"}'),
  ('Recycled Poly Jersey','GRS-certified recycled polyester single jersey, moisture-wicking.','{"composition":"100% Recycled Polyester (GRS)","gsm":175,"width_cm":150,"construction":"Single Jersey","finish":"Moisture-wicking","stretch":"None"}'),
  ('Honeycomb Knit','Textured 4-way stretch honeycomb knit with surface interest.','{"composition":"90% Polyester / 10% Elastane","gsm":220,"width_cm":150,"construction":"Honeycomb Knit","finish":"Textured","stretch":"4-way"}'),
  ('Interlock Smooth','Smooth-face 4-way stretch interlock for premium activewear.','{"composition":"92% Polyester / 8% Elastane","gsm":200,"width_cm":160,"construction":"Interlock Knit","finish":"Smooth face","stretch":"4-way"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'fabric'::public.library_category and li.name = v.name
);

-- ---- Category 2 — Trims & Tapes (textile trims carry colours) -----------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'trim'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description,
       case when v.wc then v.props::jsonb || jsonb_build_object('colours', cols.c) else v.props::jsonb end,
       true, null
from (values
  ('Branded Woven Neck Tape','Logo-printable woven neck tape for interior branding.','{"width_mm":20,"composition":"100% Polyester"}', true),
  ('Herringbone Twill Tape','Cotton herringbone twill tape for seam reinforcement.','{"width_mm":15,"composition":"100% Cotton"}', true),
  ('Fold-Over Binding','Stretch nylon fold-over binding for clean edges.','{"width_mm":20,"composition":"96% Nylon / 4% Elastane"}', true),
  ('Reflective Tape','Hi-vis TPU reflective tape with glass-bead surface.','{"width_mm":10,"composition":"TPU / Glass bead"}', false),
  ('Elastic Bias Binding','Stretch bias binding for neckline and armhole finishing.','{"width_mm":18,"composition":"90% Polyester / 10% Elastane"}', true),
  ('Grosgrain Ribbon','Polyester grosgrain ribbon for zip facing and detailing.','{"width_mm":25,"composition":"100% Polyester"}', true)
) as v(name, description, props, wc)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'trim'::public.library_category and li.name = v.name
);

-- ---- Category 3 — Fasteners & Hardware: zips + buttons/snaps (carry colours) --
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'fastener'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('YKK Coil Auto-Lock #3','YKK #3 nylon coil zip with auto-lock slider, matte finish.','{"brand":"YKK","zip_type":"Nylon Coil","gauge":"#3","pull_type":"Auto-lock slider","finish":"Matte"}'),
  ('YKK Coil Auto-Lock #5','YKK #5 nylon coil zip with auto-lock slider, matte finish.','{"brand":"YKK","zip_type":"Nylon Coil","gauge":"#5","pull_type":"Auto-lock slider","finish":"Matte"}'),
  ('YKK Vislon Moulded #5','YKK #5 Vislon moulded plastic zip, gloss finish.','{"brand":"YKK","zip_type":"Moulded Plastic","gauge":"#5","pull_type":"Auto-lock slider","finish":"Gloss"}'),
  ('YKK AquaGuard #5','YKK #5 AquaGuard water-resistant coil zip, matte finish.','{"brand":"YKK","zip_type":"Water-resistant Coil","gauge":"#5","pull_type":"Auto-lock slider","finish":"Matte"}'),
  ('YKK Metal Brass #5','YKK #5 metal brass zip with DA slider, antique brass finish.','{"brand":"YKK","zip_type":"Metal","gauge":"#5","pull_type":"DA slider","finish":"Antique brass"}'),
  ('YKK Two-Way Separating #5','YKK #5 two-way separating coil zip with dual auto-lock sliders.','{"brand":"YKK","zip_type":"Nylon Coil","gauge":"#5","pull_type":"Dual auto-lock","finish":"Matte"}'),
  ('RiRi Metal #6','RiRi #6 premium metal zip with polished puller.','{"brand":"RiRi","zip_type":"Metal","gauge":"#6","pull_type":"Premium puller","finish":"Polished"}'),
  ('Shank Button 18L','18-ligne nylon shank button, matte finish.','{"ligne":"18L","button_type":"Shank","material":"Nylon","finish":"Matte"}'),
  ('Sew-Through 24L','24-ligne 4-hole corozo button, natural finish.','{"ligne":"24L","button_type":"4-hole","material":"Corozo","finish":"Natural"}'),
  ('Ring Snap 15mm','15mm brass ring press stud, nickel-free.','{"size_mm":15,"button_type":"Press stud","material":"Brass","finish":"Nickel-free"}'),
  ('Jersey Snap 12mm','12mm brass jersey press stud, matte black.','{"size_mm":12,"button_type":"Press stud","material":"Brass","finish":"Matte black"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'fastener'::public.library_category and li.name = v.name
);

-- ---- Category 3 — Other hardware (no colours) --------------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'fastener'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Cord Lock Toggle','20mm acetal cord-lock toggle, black.','{"size_mm":20,"material":"Acetal","finish":"Black"}'),
  ('Tri-Glide Adjuster','25mm acetal tri-glide strap adjuster, black.','{"size_mm":25,"material":"Acetal","finish":"Black"}'),
  ('D-Ring','25mm zinc-alloy D-ring, matte black.','{"size_mm":25,"material":"Zinc alloy","finish":"Matte black"}'),
  ('Ladder Lock Buckle','25mm acetal ladder-lock buckle, black.','{"size_mm":25,"material":"Acetal","finish":"Black"}'),
  ('Metal Eyelet','5mm brass eyelet, gunmetal finish.','{"size_mm":5,"material":"Brass","finish":"Gunmetal"}'),
  ('Drawcord End Aglet','4mm metal drawcord aglet, silver.','{"size_mm":4,"material":"Metal","finish":"Silver"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'fastener'::public.library_category and li.name = v.name
);

-- ---- Category 4 — Elastics & Cords (all carry colours) -----------------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'elastic'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('Flat Waistband Elastic 30mm','30mm flat woven waistband elastic, 130% stretch.','{"width_mm":30,"elastic_type":"Flat woven","stretch_pct":130,"composition":"65% Polyester / 35% Rubber"}'),
  ('Flat Waistband Elastic 40mm','40mm flat woven waistband elastic, 130% stretch.','{"width_mm":40,"elastic_type":"Flat woven","stretch_pct":130,"composition":"65% Polyester / 35% Rubber"}'),
  ('Branded Jacquard Elastic','35mm logo-knittable jacquard waistband elastic, 120% stretch.','{"width_mm":35,"elastic_type":"Jacquard woven","stretch_pct":120,"composition":"Logo-knittable"}'),
  ('Fold-Over Elastic (FOE)','15mm fold-over elastic for edge finishing, 140% stretch.','{"width_mm":15,"elastic_type":"Fold-over","stretch_pct":140,"composition":"90% Poly / 10% Elastane"}'),
  ('Braided Cord Elastic','3mm braided cord elastic, 150% stretch.','{"width_mm":3,"elastic_type":"Braided","stretch_pct":150,"composition":"Polyester wrapped"}'),
  ('Round Drawcord 6mm','6mm round drawcord with metal aglet tips.','{"diameter_mm":6,"cord_type":"Round","composition":"Polyester","tip_type":"Metal aglet"}'),
  ('Round Drawcord 4mm','4mm round drawcord, heat-sealed tips.','{"diameter_mm":4,"cord_type":"Round","composition":"Polyester","tip_type":"Heat-sealed"}'),
  ('Flat Drawcord 8mm','8mm flat woven drawcord, heat-sealed tips.','{"diameter_mm":8,"cord_type":"Flat woven","composition":"Polyester","tip_type":"Heat-sealed"}'),
  ('Hollow Drawcord 5mm','5mm hollow-braid drawcord with metal aglet tips.','{"diameter_mm":5,"cord_type":"Hollow braid","composition":"Polyester","tip_type":"Metal aglet"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'elastic'::public.library_category and li.name = v.name
);

-- ---- Category 5 — Stitch & Seam Types (distinct SVG diagrams in image_url) ----
-- Each image_url is built as: 'data:image/svg+xml;base64,' || <base64 of SVG>.
insert into public.library_items (category, source, workspace_id, name, description, properties, image_url, is_active, created_by)
select 'stitch_type'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb,
       'data:image/svg+xml;base64,' || replace(encode(convert_to(v.svg, 'UTF8'), 'base64'), E'\n', ''),
       true, null
from (values
  ('Overlock (3-thread)','3-thread overlock for edge finishing and seams on knits.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"504","use_case":"Edge finishing, seams"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="8" y="33" width="74" height="14" rx="1" fill="#6B7280"/><g stroke="#C8F000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M82 30 C100 30 100 50 82 50"/><path d="M64 30 L82 50 M64 50 L82 30"/></g></svg>$svg$),
  ('Overlock (4-thread)','4-thread overlock with safety stitch for durable stretch seams.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"514","use_case":"Stretch seams"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="8" y="33" width="74" height="14" rx="1" fill="#6B7280"/><g stroke="#C8F000" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M82 30 C100 30 100 50 82 50"/><path d="M64 30 L82 50 M64 50 L82 30"/><path d="M14 40 L60 40" stroke-dasharray="5 4"/></g></svg>$svg$),
  ('Flatlock (top)','Flatlock top stitch joining butted edges flat for athletic seams.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"607","use_case":"Flat seams, athletic"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="30" width="50" height="20" fill="#6B7280"/><rect x="64" y="30" width="50" height="20" fill="#6B7280"/><g stroke="#C8F000" stroke-width="2.5" fill="none" stroke-linecap="round"><path d="M46 36 L74 36 M46 44 L74 44 M50 36 L50 44 M58 36 L58 44 M62 36 L62 44 M70 36 L70 44"/></g></svg>$svg$),
  ('Coverstitch (2-needle)','2-needle coverstitch with looper underside for hems and necklines.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"406","use_case":"Hems, necklines"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="28" width="108" height="24" fill="#6B7280"/><g stroke="#C8F000" fill="none" stroke-linecap="round"><line x1="12" y1="36" x2="108" y2="36" stroke-width="2.5"/><line x1="12" y1="44" x2="108" y2="44" stroke-width="2.5"/><path d="M12 44 L24 36 L36 44 L48 36 L60 44 L72 36 L84 44 L96 36 L108 44" stroke-width="1.5" stroke-opacity="0.5"/></g></svg>$svg$),
  ('Coverstitch (3-needle)','3-needle coverstitch for wide hems and binding.',
   '{"spi_range":"10-12","thread_weight":120,"iso_code":"407","use_case":"Wide hems, binding"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="26" width="108" height="28" fill="#6B7280"/><g stroke="#C8F000" fill="none" stroke-linecap="round"><line x1="12" y1="33" x2="108" y2="33" stroke-width="2.5"/><line x1="12" y1="40" x2="108" y2="40" stroke-width="2.5"/><line x1="12" y1="47" x2="108" y2="47" stroke-width="2.5"/><path d="M12 47 L24 33 L36 47 L48 33 L60 47 L72 33 L84 47 L96 33 L108 47" stroke-width="1.5" stroke-opacity="0.5"/></g></svg>$svg$),
  ('Single Needle Lockstitch','Single-needle lockstitch for topstitching and general construction.',
   '{"spi_range":"8-12","thread_weight":80,"iso_code":"301","use_case":"Topstitch, general"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="30" width="108" height="20" fill="#6B7280"/><line x1="12" y1="40" x2="108" y2="40" stroke="#C8F000" stroke-width="3" stroke-dasharray="8 5" stroke-linecap="round"/></svg>$svg$),
  ('Double Needle Lockstitch','Twin-needle lockstitch producing two parallel topstitch rows.',
   '{"spi_range":"8-12","thread_weight":80,"iso_code":"301x2","use_case":"Parallel topstitch"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="28" width="108" height="24" fill="#6B7280"/><g stroke="#C8F000" stroke-width="3" stroke-dasharray="8 5" stroke-linecap="round"><line x1="12" y1="35" x2="108" y2="35"/><line x1="12" y1="45" x2="108" y2="45"/></g></svg>$svg$),
  ('Bartack','Dense bartack reinforcement at stress points such as pocket corners.',
   '{"spi_range":"42 stitches","thread_weight":80,"iso_code":"304","use_case":"Stress points"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="30" width="108" height="20" fill="#6B7280"/><g stroke="#C8F000" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M40 35 L80 35 M40 45 L80 45" stroke-width="2.5"/><path d="M42 35 L46 45 L50 35 L54 45 L58 35 L62 45 L66 35 L70 45 L74 35 L78 45" stroke-width="2.5"/></g></svg>$svg$),
  ('Chainstitch','Single-thread chainstitch loop chain for seams and decorative rows.',
   '{"spi_range":"8-10","thread_weight":80,"iso_code":"401","use_case":"Seams, decorative"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="30" width="108" height="20" fill="#6B7280"/><path d="M14 40 c4 -7 14 -7 18 0 c4 7 14 7 18 0 c4 -7 14 -7 18 0 c4 7 14 7 18 0 c4 -7 14 -7 18 0" fill="none" stroke="#C8F000" stroke-width="2.5" stroke-linecap="round"/></svg>$svg$),
  ('Zigzag','Zigzag stitch used to attach elastic and for stretch seams.',
   '{"spi_range":"6-8","thread_weight":80,"iso_code":"304","use_case":"Elastic attach"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="6" y="28" width="108" height="24" fill="#6B7280"/><path d="M12 48 L24 32 L36 48 L48 32 L60 48 L72 32 L84 48 L96 32 L108 48" fill="none" stroke="#C8F000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>$svg$),
  ('French Seam','Enclosed French seam hiding raw edges inside a folded bundle.',
   '{"spi_range":"10-12","thread_weight":80,"iso_code":null,"use_case":"Enclosed seam"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><path d="M10 36 H74 a14 14 0 0 1 14 14 a14 14 0 0 1 -14 14 H44" fill="none" stroke="#6B7280" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><line x1="78" y1="34" x2="64" y2="66" stroke="#C8F000" stroke-width="2.5" stroke-dasharray="6 4" stroke-linecap="round"/></svg>$svg$),
  ('Flat Felled Seam','Durable flat felled seam with two parallel topstitch rows.',
   '{"spi_range":"8-10","thread_weight":80,"iso_code":null,"use_case":"Durable, denim/outerwear"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="8" y="34" width="84" height="7" fill="#6B7280"/><rect x="28" y="43" width="84" height="7" fill="#6B7280"/><g stroke="#C8F000" stroke-width="2.5" stroke-linecap="round"><line x1="42" y1="30" x2="42" y2="54"/><line x1="62" y1="30" x2="62" y2="54"/></g></svg>$svg$),
  ('Bound Seam','Bound seam with binding wrapping the raw edge for a clean interior.',
   '{"spi_range":"10-12","thread_weight":80,"iso_code":null,"use_case":"Clean interior finish"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="8" y="36" width="62" height="10" fill="#6B7280"/><path d="M70 30 H84 a6 6 0 0 1 6 6 V44 a6 6 0 0 1 -6 6 H70" fill="none" stroke="#C8F000" stroke-width="3" stroke-linejoin="round"/><line x1="74" y1="30" x2="74" y2="50" stroke="#C8F000" stroke-width="2.5" stroke-dasharray="5 4" stroke-linecap="round"/></svg>$svg$),
  ('Blind Hem','Blind hem with a zigzag that periodically bites the garment fold.',
   '{"spi_range":"6-8","thread_weight":80,"iso_code":"103","use_case":"Invisible hem"}',
   $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80"><rect x="8" y="32" width="100" height="6" fill="#6B7280"/><rect x="20" y="46" width="88" height="6" fill="#6B7280"/><path d="M24 49 L36 49 L44 35 L52 49 L64 49 L72 35 L80 49 L92 49 L100 35" fill="none" stroke="#C8F000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>$svg$)
) as v(name, description, props, svg)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'stitch_type'::public.library_category and li.name = v.name
);

-- ---- Category 6 — Thread (all carry colours) ---------------------------------
with cols as (
  select '[{"name":"Black","pantone_tcx":"19-4006 TCX","hex":"#2B2B2B"},{"name":"White","pantone_tcx":"11-0601 TCX","hex":"#F4F4F4"},{"name":"Navy","pantone_tcx":"19-4023 TCX","hex":"#2A3244"},{"name":"Volt","pantone_tcx":"13-0550 TCX","hex":"#C8F000"}]'::jsonb as c
)
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'thread'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb || jsonb_build_object('colours', cols.c), true, null
from (values
  ('Coats Epic Poly 80','Coats Epic Tex spun polyester, 80 weight, general construction.','{"brand":"Coats","thread_ref":"Epic","weight":80,"thread_type":"Spun Polyester"}'),
  ('Coats Epic Poly 120','Coats Epic spun polyester, 120 weight, fine seams and overlocking.','{"brand":"Coats","thread_ref":"Epic","weight":120,"thread_type":"Spun Polyester"}'),
  ('Coats Gramax Bonded Nylon','Coats Gramax bonded nylon, 40 weight, heavy-duty seams.','{"brand":"Coats","thread_ref":"Gramax","weight":40,"thread_type":"Bonded Nylon"}'),
  ('Wooly Nylon (Overlock)','Textured wooly nylon for soft, stretchy overlock seams.','{"brand":"Generic","thread_ref":"Wooly Nylon","weight":null,"thread_type":"Textured Nylon"}'),
  ('Amann Saba C 80','Amann Saba C polyester-core thread, 80 weight.','{"brand":"Amann","thread_ref":"Saba C","weight":80,"thread_type":"Polyester Core"}'),
  ('Madeira Classic Rayon 40','Madeira Classic rayon embroidery thread, 40 weight, high sheen.','{"brand":"Madeira","thread_ref":"Classic Rayon","weight":40,"thread_type":"Embroidery Rayon"}'),
  ('Madeira Polyneon 40','Madeira Polyneon polyester embroidery thread, 40 weight.','{"brand":"Madeira","thread_ref":"Polyneon","weight":40,"thread_type":"Embroidery Polyester"}')
) as v(name, description, props)
cross join cols
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'thread'::public.library_category and li.name = v.name
);

-- ---- Category 7 — Labels & Branding (no colours) -----------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'label_type'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Woven Main Label','Damask woven main label, centre-fold sew-in.','{"size_mm":"55x30mm","construction":"Damask woven","attachment":"Sew-in (centre fold)","wash_fastness":"High"}'),
  ('Woven Loop Label','Satin woven loop label sewn into the side seam.','{"size_mm":"15x40mm","construction":"Satin woven","attachment":"Sew-in side seam","wash_fastness":"High"}'),
  ('Printed Care Label','Printed satin care/content label, sew-in.','{"size_mm":"30x50mm","construction":"Printed satin","attachment":"Sew-in","wash_fastness":"High"}'),
  ('Heat Transfer Care Label','Tagless heat-transfer care label, heat-sealed.','{"size_mm":"40x50mm","construction":"Heat transfer","attachment":"Heat-seal (tagless)","wash_fastness":"High"}'),
  ('Silicone Heat Transfer Badge','Silicone heat-transfer branded badge, heat-pressed.','{"size_mm":"60x25mm","construction":"Silicone HT","attachment":"Heat-press","wash_fastness":"High"}'),
  ('Rubber PVC Patch','Moulded PVC branded patch, sew-on or heat-applied.','{"size_mm":"50x20mm","construction":"Moulded PVC","attachment":"Sew-on / heat","wash_fastness":"High"}'),
  ('Size Tab','Printed size tab sewn into the main label.','{"size_mm":"15x15mm","construction":"Printed","attachment":"Sew into main label","wash_fastness":"High"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'label_type'::public.library_category and li.name = v.name
);

-- ---- Category 8 — Print & Decoration Types (no colours) ----------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'print_type'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Screen Print (Plastisol)','Plastisol spot-colour screen print; separated layers, no gradients.','{"artwork_format":"AI / EPS vector","colour_mode":"Spot (Pantone)","max_colours":8,"placement_notes":"Separated layers, no gradients"}'),
  ('Water-Based Screen Print','Soft-handle water-based screen print.','{"artwork_format":"AI / EPS vector","colour_mode":"Spot","max_colours":6,"placement_notes":"Soft handle"}'),
  ('Sublimation Print','All-over dye sublimation print; full repeat with bleed.','{"artwork_format":"AI / PDF 150dpi+","colour_mode":"RGB (from CMYK)","max_colours":null,"placement_notes":"Full repeat, 5mm bleed"}'),
  ('DTG (Direct to Garment)','Direct-to-garment print with white base on darks.','{"artwork_format":"PNG / PDF 300dpi","colour_mode":"CMYK + white","max_colours":null,"placement_notes":"White base on darks"}'),
  ('Heat Transfer Vinyl','Cut heat-transfer vinyl; reverse image on carrier sheet.','{"artwork_format":"AI / PDF vector","colour_mode":"Spot","max_colours":4,"placement_notes":"Reverse image, carrier sheet"}'),
  ('Embroidery','Thread embroidery to Pantone thread matches.','{"artwork_format":"DST / EMB","colour_mode":"Pantone thread","max_colours":15,"placement_notes":"40-60k stitch max"}'),
  ('3D Puff Embroidery','Raised foam 3D puff embroidery.','{"artwork_format":"DST / EMB","colour_mode":"Pantone thread","max_colours":8,"placement_notes":"Raised foam"}'),
  ('Foil Print','Metallic foil print via adhesive and foil.','{"artwork_format":"AI / EPS vector","colour_mode":"Metallic","max_colours":2,"placement_notes":"Adhesive + foil"}'),
  ('Reflective Heat Transfer','Hi-vis reflective grey/silver heat transfer.','{"artwork_format":"AI / PDF vector","colour_mode":"Grey/silver","max_colours":1,"placement_notes":"Hi-vis"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'print_type'::public.library_category and li.name = v.name
);

-- ---- Category 9 — Packaging (no colours) -------------------------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'packaging'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Self-Seal Polybag 30x40cm','30x40cm LDPE self-seal polybag with vent holes.','{"size":"30x40cm","gauge_micron":50,"material":"LDPE","pkg_type":"Self-seal + vent holes"}'),
  ('Self-Seal Polybag 25x35cm','25x35cm LDPE self-seal polybag with vent holes.','{"size":"25x35cm","gauge_micron":50,"material":"LDPE","pkg_type":"Self-seal + vent holes"}'),
  ('Recycled Polybag','30x40cm recycled LDPE self-seal polybag.','{"size":"30x40cm","gauge_micron":50,"material":"Recycled LDPE","pkg_type":"Self-seal"}'),
  ('Branded Card Hangtag','50x80mm 350gsm branded card hangtag with string.','{"size":"50x80mm","material":"350gsm card","pkg_type":"String attached"}'),
  ('Recycled Kraft Hangtag','45x70mm 300gsm recycled kraft hangtag with string.','{"size":"45x70mm","material":"300gsm kraft","pkg_type":"String attached"}'),
  ('Acid-Free Tissue','50x75cm acid-free tissue wrap.','{"size":"50x75cm","material":"Acid-free","pkg_type":"Wrap"}'),
  ('Mailer Box','30x22x5cm branded E-flute mailer box.','{"size":"30x22x5cm","material":"E-flute cardboard","pkg_type":"Branded"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'packaging'::public.library_category and li.name = v.name
);

-- ---- Category 10 — Interlining & Interfacing (no colours) --------------------
insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'interlining'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, v.props::jsonb, true, null
from (values
  ('Woven Fusible 40g','40g woven fusible interlining, bonds at 130°C.','{"gsm":40,"interlining_type":"Woven fusible","width_cm":90,"bonding_temp":"130°C","stretch_direction":"None"}'),
  ('Knit Fusible 30g','30g knit fusible interlining with cross-stretch, bonds at 125°C.','{"gsm":30,"interlining_type":"Knit fusible","width_cm":90,"bonding_temp":"125°C","stretch_direction":"Cross-stretch"}'),
  ('Non-Woven Fusible 50g','50g non-woven fusible interlining, bonds at 135°C.','{"gsm":50,"interlining_type":"Non-woven fusible","width_cm":90,"bonding_temp":"135°C","stretch_direction":"None"}'),
  ('Sew-In Canvas','220g sew-in canvas interlining for structured panels.','{"gsm":220,"interlining_type":"Sew-in","width_cm":90,"bonding_temp":null,"stretch_direction":"None"}'),
  ('Stretch Tricot Fusible','35g stretch tricot fusible with 2-way stretch, bonds at 120°C.','{"gsm":35,"interlining_type":"Tricot fusible","width_cm":90,"bonding_temp":"120°C","stretch_direction":"2-way"}')
) as v(name, description, props)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global' and li.category = 'interlining'::public.library_category and li.name = v.name
);

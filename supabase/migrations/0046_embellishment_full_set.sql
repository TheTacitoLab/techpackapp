-- ============================================================================
-- 0046 - Full global Embellishment list (idempotent / safe to re-run)
-- The Branding pin form now sources its single "Embellishment" picker from the
-- `embellishment` Master Library category (replacing the old hardcoded
-- branding-type dropdown), so the global catalogue must carry the full
-- branding-type range. 0044 seeded four items (Direct Embroidery, Blockout
-- DTF, Sublimated Patch, Screen Print Sticker); this adds the remaining NINE
-- so the category holds exactly thirteen global items:
--   Screen Print, Heat Transfer, Direct Embroidery, Woven Badge,
--   Silicone Badge, Reflective Print, Sublimation Print, Deboss / Emboss,
--   Appliqué, Other, Blockout DTF, Sublimated Patch, Screen Print Sticker.
-- Same shape as 0044's embellishment block: guarded name-keyed inserts (a
-- re-run — or a 0044 overlap — inserts nothing), no diagrams, empty
-- properties (artwork-spec fields await real values rather than guessed
-- ones). Plain global items, so the existing per-workspace hide toggle and
-- favourites apply to them with no further wiring.
-- ============================================================================

insert into public.library_items (category, source, workspace_id, name, description, properties, is_active, created_by)
select 'embellishment'::public.library_category, 'global'::public.library_source, null,
       v.name, v.description, '{}'::jsonb, true, null
from (values
  ('Screen Print','Ink printed directly onto the garment panel through a mesh screen.'),
  ('Heat Transfer','Pre-printed design applied to the garment with heat and pressure.'),
  ('Woven Badge','Woven fabric badge attached to the garment.'),
  ('Silicone Badge','Moulded silicone badge applied to the garment surface.'),
  ('Reflective Print','Retro-reflective print for low-light visibility.'),
  ('Sublimation Print','Dye-sublimation print bonded into the fabric.'),
  ('Deboss / Emboss','Design pressed into or raised from the material surface.'),
  ('Appliqué','Fabric shape stitched onto the garment panel.'),
  ('Other','Any embellishment not covered by the standard types.')
) as v(name, description)
where not exists (
  select 1 from public.library_items li
  where li.source = 'global'
    and li.category = 'embellishment'::public.library_category
    and li.name = v.name
);

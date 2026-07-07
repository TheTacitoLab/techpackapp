-- ============================================================================
-- 0034 — Spec Templates global seed (idempotent / safe to re-run)
--
-- Transcribed faithfully from docs/GarSpec_Spec_Templates_Reference.md — the
-- locked starter set: 20 core templates (Tops 5, Bottoms 5, Outerwear 2,
-- Performance 3, Womenswear 5) plus the 2 optional Accessories templates the
-- locked set lists (Beanie/Cap, Bag/Tote) so the picker's Accessories group
-- isn't empty. POM codes/names/hints follow the reference's numbering and
-- parentheticals; hints are the reference's "how to measure" notes expanded to
-- friendly sentences (measurements are of the garment LAID FLAT, per the
-- reference's conventions).
--
-- grade_category tagging follows the build brief's mapping:
--   chest/bust/waist/hip/hem/sweep → primary_girth · thigh/bicep/armhole/knee/
--   calf/underbust/forearm → secondary_girth · body lengths/outseam/side
--   length → body_length · sleeve → limb_length · shoulder/neck width/cuff/
--   leg opening/rises/straps → small (+ sub_kind) · inseam → fixed + sub_kind
--   'inseam' (adult profiles grade it 0; youth grades it — see 0033/0035) ·
--   rib/waistband/collar heights, plackets, pocket dims, zip lengths → fixed.
--
-- Judgment calls for points the mapping doesn't name (all user-editable):
--   · front/back neck DROPS → fixed (drops stay near-constant in published
--     graded specs; only neck WIDTH grades at the profile's small_neck value).
--     The Hoodie's "Front rise / neck drop" is a drop, so it's fixed too.
--   · hood height/width → fixed (heads don't grade with body sizes).
--   · "stretched" widths (waist/chest/bust/underbust stretched) grade with the
--     same category as their relaxed counterpart.
--   · note-type points (number of buttons, pocket positions, panel count) →
--     fixed, kept as rows for faithfulness to the reference.
--   · accessories (Beanie/Cap, Bag/Tote) → all fixed (one-size convention);
--     retag per row if an accessory runs sizes.
--
-- Idempotency: template inserts guarded by (source='global', name); POM
-- inserts guarded by (template_id, code) — the 0010 library-seed idiom.
-- ============================================================================

-- ============================================================================
-- TOPS
-- ============================================================================

-- ---- T-Shirt / Tee -------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'T-Shirt / Tee', 'tops'::public.spec_template_category,
       'Classic short-sleeve tee — the standard 12-point top spec.', 10, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'T-Shirt / Tee'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                'Measure 1" below the armhole, edge to edge, garment laid flat.',   'primary_girth',   '',             10),
  ('POM2',  'Body length',                'From the High Point Shoulder (HPS) straight down to the hem.',     'body_length',     '',             20),
  ('POM3',  'Shoulder width',             'Seam to seam across the back.',                                    'small',           'shoulder',     30),
  ('POM4',  'Across shoulder',            'From shoulder point to shoulder point.',                           'small',           'shoulder',     40),
  ('POM5',  'Sleeve length',              'From the shoulder seam to the cuff edge.',                         'limb_length',     '',             50),
  ('POM6',  'Sleeve opening / cuff width','Across the sleeve opening, laid flat.',                            'small',           'cuff_opening', 60),
  ('POM7',  'Armhole',                    'Straight line, seam to seam.',                                     'secondary_girth', '',             70),
  ('POM8',  'Neck width',                 'Seam to seam, inside edge to inside edge.',                        'small',           'neck',         80),
  ('POM9',  'Front neck drop',            'From HPS level down to the front neck seam.',                      'fixed',           '',             90),
  ('POM10', 'Back neck drop',             'From HPS level down to the back neck seam.',                       'fixed',           '',             100),
  ('POM11', 'Bottom / hem width',         'Across the bottom hem, edge to edge.',                             'primary_girth',   '',             110),
  ('POM12', 'Neck rib height',            'Height of the neck rib, if ribbed.',                               'fixed',           '',             120)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'T-Shirt / Tee'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Long-Sleeve Tee -----------------------------------------------------------
-- Tee points 1–11, with sleeve length extended (POM12, CB-to-cuff convention)
-- and cuff/forearm added, per the reference.
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Long-Sleeve Tee', 'tops'::public.spec_template_category,
       'Tee points with an extended sleeve measurement, cuff and forearm added.', 20, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Long-Sleeve Tee'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                'Measure 1" below the armhole, edge to edge, garment laid flat.',        'primary_girth',   '',             10),
  ('POM2',  'Body length',                'From the High Point Shoulder (HPS) straight down to the hem.',          'body_length',     '',             20),
  ('POM3',  'Shoulder width',             'Seam to seam across the back.',                                         'small',           'shoulder',     30),
  ('POM4',  'Across shoulder',            'From shoulder point to shoulder point.',                                'small',           'shoulder',     40),
  ('POM5',  'Sleeve length',              'From the shoulder seam to the cuff edge.',                              'limb_length',     '',             50),
  ('POM6',  'Sleeve opening / cuff width','Across the sleeve opening, laid flat.',                                 'small',           'cuff_opening', 60),
  ('POM7',  'Armhole',                    'Straight line, seam to seam.',                                          'secondary_girth', '',             70),
  ('POM8',  'Neck width',                 'Seam to seam, inside edge to inside edge.',                             'small',           'neck',         80),
  ('POM9',  'Front neck drop',            'From HPS level down to the front neck seam.',                           'fixed',           '',             90),
  ('POM10', 'Back neck drop',             'From HPS level down to the back neck seam.',                            'fixed',           '',             100),
  ('POM11', 'Bottom / hem width',         'Across the bottom hem, edge to edge.',                                  'primary_girth',   '',             110),
  ('POM12', 'Sleeve length (CB)',         'From the centre-back neck to the cuff edge (or shoulder seam to cuff — note which).', 'limb_length', '',  120),
  ('POM13', 'Cuff height / rib',          'Height of the sleeve cuff rib.',                                        'fixed',           '',             130),
  ('POM14', 'Forearm width',              'Across the sleeve at the forearm, laid flat.',                          'secondary_girth', '',             140)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Long-Sleeve Tee'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Polo Shirt ----------------------------------------------------------------
-- Tee base (1–11) + collar/placket points.
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Polo Shirt', 'tops'::public.spec_template_category,
       'Tee base plus collar and placket points.', 30, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Polo Shirt'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                'Measure 1" below the armhole, edge to edge, garment laid flat.',   'primary_girth',   '',             10),
  ('POM2',  'Body length',                'From the High Point Shoulder (HPS) straight down to the hem.',     'body_length',     '',             20),
  ('POM3',  'Shoulder width',             'Seam to seam across the back.',                                    'small',           'shoulder',     30),
  ('POM4',  'Across shoulder',            'From shoulder point to shoulder point.',                           'small',           'shoulder',     40),
  ('POM5',  'Sleeve length',              'From the shoulder seam to the cuff edge.',                         'limb_length',     '',             50),
  ('POM6',  'Sleeve opening / cuff width','Across the sleeve opening, laid flat.',                            'small',           'cuff_opening', 60),
  ('POM7',  'Armhole',                    'Straight line, seam to seam.',                                     'secondary_girth', '',             70),
  ('POM8',  'Neck width',                 'Seam to seam, inside edge to inside edge.',                        'small',           'neck',         80),
  ('POM9',  'Front neck drop',            'From HPS level down to the front neck seam.',                      'fixed',           '',             90),
  ('POM10', 'Back neck drop',             'From HPS level down to the back neck seam.',                       'fixed',           '',             100),
  ('POM11', 'Bottom / hem width',         'Across the bottom hem, edge to edge.',                             'primary_girth',   '',             110),
  ('POM12', 'Collar height',              'Height of the collar at centre back.',                             'fixed',           '',             120),
  ('POM13', 'Collar point length',        'From the collar seam to the collar point tip.',                    'fixed',           '',             130),
  ('POM14', 'Placket length',             'From the neck seam to the bottom of the placket.',                 'fixed',           '',             140),
  ('POM15', 'Placket width',              'Across the placket.',                                              'fixed',           '',             150),
  ('POM16', 'Number of buttons',          'Spec note, not a measurement — optional.',                         'fixed',           '',             160)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Polo Shirt'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Hoodie / Sweatshirt -------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Hoodie / Sweatshirt', 'tops'::public.spec_template_category,
       'Fleece top with hood, kangaroo pocket and rib points.', 40, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Hoodie / Sweatshirt'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                'Measure 1" below the armhole, edge to edge, garment laid flat.',   'primary_girth',   '',             10),
  ('POM2',  'Body length',                'From the High Point Shoulder (HPS) straight down to the hem.',     'body_length',     '',             20),
  ('POM3',  'Shoulder width',             'Seam to seam across the back.',                                    'small',           'shoulder',     30),
  ('POM4',  'Sleeve length',              'From the shoulder seam to the cuff edge.',                         'limb_length',     '',             40),
  ('POM5',  'Sleeve opening / cuff width','Across the sleeve opening, laid flat.',                            'small',           'cuff_opening', 50),
  ('POM6',  'Armhole',                    'Straight line, seam to seam.',                                     'secondary_girth', '',             60),
  ('POM7',  'Neck width',                 'Seam to seam, inside edge to inside edge.',                        'small',           'neck',         70),
  ('POM8',  'Front rise / neck drop',     'From HPS level down to the front neck seam.',                      'fixed',           '',             80),
  ('POM9',  'Bottom hem width',           'Across the bottom hem, relaxed.',                                  'primary_girth',   '',             90),
  ('POM10', 'Bottom rib / hem height',    'Height of the bottom rib or hem.',                                 'fixed',           '',             100),
  ('POM11', 'Cuff rib height',            'Height of the sleeve cuff rib.',                                   'fixed',           '',             110),
  ('POM12', 'Hood height',                'From the crown to the neck seam.',                                 'fixed',           '',             120),
  ('POM13', 'Hood width',                 'From the front edge to the back of the hood.',                     'fixed',           '',             130),
  ('POM14', 'Pocket width',               'Across the kangaroo pocket, if present.',                          'fixed',           '',             140),
  ('POM15', 'Pocket opening height',      'Height of the kangaroo pocket opening.',                           'fixed',           '',             150),
  ('POM16', 'Sleeve bicep width',         'Across the sleeve at the bicep, laid flat.',                       'secondary_girth', '',             160)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Hoodie / Sweatshirt'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Vest / Tank ---------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Vest / Tank', 'tops'::public.spec_template_category,
       'Sleeveless top — strap, armhole-depth and drop points.', 50, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Vest / Tank'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1', 'Chest width',          'Measure 1" below the armhole, edge to edge, garment laid flat.', 'primary_girth',   '',         10),
  ('POM2', 'Body length',          'From the High Point Shoulder (HPS) straight down to the hem.',   'body_length',     '',         20),
  ('POM3', 'Shoulder strap width', 'Across the strap at the shoulder.',                              'small',           'strap',    30),
  ('POM4', 'Across shoulder',      'From strap to strap across the back.',                           'small',           'shoulder', 40),
  ('POM5', 'Armhole depth',        'From the shoulder point straight down to the underarm.',         'secondary_girth', '',         50),
  ('POM6', 'Neck width',           'Seam to seam, inside edge to inside edge.',                      'small',           'neck',     60),
  ('POM7', 'Front neck drop',      'From HPS level down to the front neck seam.',                    'fixed',           '',         70),
  ('POM8', 'Back neck drop',       'From HPS level down to the back neck seam.',                     'fixed',           '',         80),
  ('POM9', 'Bottom hem width',     'Across the bottom hem, edge to edge.',                           'primary_girth',   '',         90)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Vest / Tank'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ============================================================================
-- BOTTOMS
-- ============================================================================

-- ---- Joggers / Sweatpants ------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Joggers / Sweatpants', 'bottoms'::public.spec_template_category,
       'Elasticated-waist bottoms with cuffed legs.', 10, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Joggers / Sweatpants'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Waist relaxed',            'Across the waistband edge to edge, relaxed.',                     'primary_girth',   '',             10),
  ('POM2',  'Waist stretched',          'Across the waistband fully stretched, if elasticated.',           'primary_girth',   '',             20),
  ('POM3',  'Waistband height',         'Height of the waistband.',                                        'fixed',           '',             30),
  ('POM4',  'Hip',                      'Measured a set distance below the waistband — note the point.',   'primary_girth',   '',             40),
  ('POM5',  'Front rise',               'From the crotch seam to the top of the waistband, at the front.', 'small',           'rise',         50),
  ('POM6',  'Back rise',                'From the crotch seam to the top of the waistband, at the back.',  'small',           'rise',         60),
  ('POM7',  'Thigh width',              'Measure 1" below the crotch, edge to edge.',                      'secondary_girth', '',             70),
  ('POM8',  'Knee width',               'Across the leg at the knee point.',                               'secondary_girth', '',             80),
  ('POM9',  'Leg opening / cuff width', 'Across the leg opening, relaxed.',                                'small',           'cuff_opening', 90),
  ('POM10', 'Cuff / hem rib height',    'Height of the ankle cuff rib or hem.',                            'fixed',           '',             100),
  ('POM11', 'Inseam',                   'From the crotch seam to the hem, along the inside leg.',          'fixed',           'inseam',       110),
  ('POM12', 'Outseam',                  'From the top of the waistband to the hem, along the outside leg.','body_length',     '',             120)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Joggers / Sweatpants'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Shorts --------------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Shorts', 'bottoms'::public.spec_template_category,
       'General shorts spec — waist, rise, thigh and length points.', 20, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Shorts'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Waist relaxed',          'Across the waistband edge to edge, relaxed.',                     'primary_girth',   '',             10),
  ('POM2',  'Waist stretched',        'Across the waistband fully stretched, if elasticated.',           'primary_girth',   '',             20),
  ('POM3',  'Waistband height',       'Height of the waistband.',                                        'fixed',           '',             30),
  ('POM4',  'Hip',                    'Measured a set distance below the waistband — note the point.',   'primary_girth',   '',             40),
  ('POM5',  'Front rise',             'From the crotch seam to the top of the waistband, at the front.', 'small',           'rise',         50),
  ('POM6',  'Back rise',              'From the crotch seam to the top of the waistband, at the back.',  'small',           'rise',         60),
  ('POM7',  'Thigh width',            'Measure 1" below the crotch, edge to edge.',                      'secondary_girth', '',             70),
  ('POM8',  'Leg opening',            'Across the leg opening, laid flat.',                              'small',           'cuff_opening', 80),
  ('POM9',  'Inseam',                 'From the crotch seam to the hem, along the inside leg.',          'fixed',           'inseam',       90),
  ('POM10', 'Outseam / side length',  'From the top of the waistband to the hem, along the side.',       'body_length',     '',             100)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Shorts'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Leggings / Tights ---------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Leggings / Tights', 'bottoms'::public.spec_template_category,
       'Close-fit stretch bottoms — includes knee, calf and ankle points.', 30, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Leggings / Tights'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Waist relaxed',       'Across the waistband edge to edge, relaxed.',                     'primary_girth',   '',             10),
  ('POM2',  'Waist stretched',     'Across the waistband fully stretched.',                           'primary_girth',   '',             20),
  ('POM3',  'Waistband height',    'Height of the waistband.',                                        'fixed',           '',             30),
  ('POM4',  'Hip',                 'Measured a set distance below the waistband — note the point.',   'primary_girth',   '',             40),
  ('POM5',  'Front rise',          'From the crotch seam to the top of the waistband, at the front.', 'small',           'rise',         50),
  ('POM6',  'Back rise',           'From the crotch seam to the top of the waistband, at the back.',  'small',           'rise',         60),
  ('POM7',  'Thigh width',         'Measure 1" below the crotch, edge to edge.',                      'secondary_girth', '',             70),
  ('POM8',  'Knee width',          'Across the leg at the knee point.',                               'secondary_girth', '',             80),
  ('POM9',  'Calf width',          'Across the leg at the calf point.',                               'secondary_girth', '',             90),
  ('POM10', 'Leg opening / ankle', 'Across the ankle opening, laid flat.',                            'small',           'cuff_opening', 100),
  ('POM11', 'Inseam',              'From the crotch seam to the hem, along the inside leg.',          'fixed',           'inseam',       110),
  ('POM12', 'Outseam',             'From the top of the waistband to the hem, along the outside leg.','body_length',     '',             120)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Leggings / Tights'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Trousers / Pants ----------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Trousers / Pants', 'bottoms'::public.spec_template_category,
       'Woven trouser/chino spec.', 40, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Trousers / Pants'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Waist relaxed',     'Across the waistband edge to edge, relaxed.',                     'primary_girth',   '',             10),
  ('POM2',  'Waistband height',  'Height of the waistband.',                                        'fixed',           '',             20),
  ('POM3',  'Hip',               'Measured a set distance below the waistband — note the point.',   'primary_girth',   '',             30),
  ('POM4',  'Front rise',        'From the crotch seam to the top of the waistband, at the front.', 'small',           'rise',         40),
  ('POM5',  'Back rise',         'From the crotch seam to the top of the waistband, at the back.',  'small',           'rise',         50),
  ('POM6',  'Thigh width',       'Measure 1" below the crotch, edge to edge.',                      'secondary_girth', '',             60),
  ('POM7',  'Knee width',        'Across the leg at the knee point.',                               'secondary_girth', '',             70),
  ('POM8',  'Leg opening / hem', 'Across the leg opening at the hem, laid flat.',                   'small',           'cuff_opening', 80),
  ('POM9',  'Inseam',            'From the crotch seam to the hem, along the inside leg.',          'fixed',           'inseam',       90),
  ('POM10', 'Outseam',           'From the top of the waistband to the hem, along the outside leg.','body_length',     '',             100)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Trousers / Pants'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Jeans / Denim -------------------------------------------------------------
-- Trousers base + denim specifics, kept as listed in the reference.
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Jeans / Denim', 'bottoms'::public.spec_template_category,
       'Trousers base plus denim specifics — yoke, fly and leg opening.', 50, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Jeans / Denim'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Waist relaxed',                   'Across the waistband edge to edge, relaxed.',                     'primary_girth',   '',             10),
  ('POM2',  'Waistband height',                'Height of the waistband.',                                        'fixed',           '',             20),
  ('POM3',  'Hip',                             'Measured a set distance below the waistband — note the point.',   'primary_girth',   '',             30),
  ('POM4',  'Front rise',                      'From the crotch seam to the top of the waistband, at the front.', 'small',           'rise',         40),
  ('POM5',  'Back rise',                       'From the crotch seam to the top of the waistband, at the back.',  'small',           'rise',         50),
  ('POM6',  'Thigh width',                     'Measure 1" below the crotch, edge to edge.',                      'secondary_girth', '',             60),
  ('POM7',  'Knee width',                      'Across the leg at the knee point.',                               'secondary_girth', '',             70),
  ('POM8',  'Leg opening / hem',               'Across the leg opening at the hem, laid flat.',                   'small',           'cuff_opening', 80),
  ('POM9',  'Inseam',                          'From the crotch seam to the hem, along the inside leg.',          'fixed',           'inseam',       90),
  ('POM10', 'Outseam',                         'From the top of the waistband to the hem, along the outside leg.','body_length',     '',             100),
  ('POM11', 'Front rise (to top of waistband)','From the crotch seam over the fly to the very top of the waistband.', 'small',      'rise',         110),
  ('POM12', 'Yoke height (back)',              'Height of the back yoke at centre back.',                         'fixed',           '',             120),
  ('POM13', 'Leg opening',                     'Across the leg opening, laid flat.',                              'small',           'cuff_opening', 130),
  ('POM14', 'Zip / fly length',                'Length of the zip or fly opening.',                               'fixed',           '',             140)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Jeans / Denim'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ============================================================================
-- OUTERWEAR
-- ============================================================================

-- ---- Zip Hoodie / Track Jacket -------------------------------------------------
-- Hoodie base (1–16) + full-zip points.
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Zip Hoodie / Track Jacket', 'outerwear'::public.spec_template_category,
       'Hoodie base plus centre-front zip, stand and placket points.', 10, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Zip Hoodie / Track Jacket'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                'Measure 1" below the armhole, edge to edge, garment laid flat.',   'primary_girth',   '',             10),
  ('POM2',  'Body length',                'From the High Point Shoulder (HPS) straight down to the hem.',     'body_length',     '',             20),
  ('POM3',  'Shoulder width',             'Seam to seam across the back.',                                    'small',           'shoulder',     30),
  ('POM4',  'Sleeve length',              'From the shoulder seam to the cuff edge.',                         'limb_length',     '',             40),
  ('POM5',  'Sleeve opening / cuff width','Across the sleeve opening, laid flat.',                            'small',           'cuff_opening', 50),
  ('POM6',  'Armhole',                    'Straight line, seam to seam.',                                     'secondary_girth', '',             60),
  ('POM7',  'Neck width',                 'Seam to seam, inside edge to inside edge.',                        'small',           'neck',         70),
  ('POM8',  'Front rise / neck drop',     'From HPS level down to the front neck seam.',                      'fixed',           '',             80),
  ('POM9',  'Bottom hem width',           'Across the bottom hem, relaxed.',                                  'primary_girth',   '',             90),
  ('POM10', 'Bottom rib / hem height',    'Height of the bottom rib or hem.',                                 'fixed',           '',             100),
  ('POM11', 'Cuff rib height',            'Height of the sleeve cuff rib.',                                   'fixed',           '',             110),
  ('POM12', 'Hood height',                'From the crown to the neck seam.',                                 'fixed',           '',             120),
  ('POM13', 'Hood width',                 'From the front edge to the back of the hood.',                     'fixed',           '',             130),
  ('POM14', 'Pocket width',               'Across the pocket, if present.',                                   'fixed',           '',             140),
  ('POM15', 'Pocket opening height',      'Height of the pocket opening.',                                    'fixed',           '',             150),
  ('POM16', 'Sleeve bicep width',         'Across the sleeve at the bicep, laid flat.',                       'secondary_girth', '',             160),
  ('POM17', 'Zip length (CF)',            'Length of the centre-front zip.',                                  'fixed',           '',             170),
  ('POM18', 'Collar / stand height',      'Height of the collar or stand at centre back.',                    'fixed',           '',             180),
  ('POM19', 'Front placket width',        'Across the front placket.',                                        'fixed',           '',             190)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Zip Hoodie / Track Jacket'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Jacket / Coat -------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Jacket / Coat', 'outerwear'::public.spec_template_category,
       'Woven jacket or coat spec.', 20, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Jacket / Coat'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                'Measure 1" below the armhole, edge to edge, garment laid flat.', 'primary_girth',   '',             10),
  ('POM2',  'Body length',                'From the High Point Shoulder (HPS) straight down to the hem.',   'body_length',     '',             20),
  ('POM3',  'Shoulder width',             'Seam to seam across the back.',                                  'small',           'shoulder',     30),
  ('POM4',  'Across back',                'Across the back between the armhole seams.',                     'small',           'shoulder',     40),
  ('POM5',  'Sleeve length',              'From the shoulder seam to the cuff edge.',                       'limb_length',     '',             50),
  ('POM6',  'Sleeve opening',             'Across the sleeve opening, laid flat.',                          'small',           'cuff_opening', 60),
  ('POM7',  'Armhole',                    'Straight line, seam to seam.',                                   'secondary_girth', '',             70),
  ('POM8',  'Neck / collar width',        'Seam to seam, inside edge to inside edge.',                      'small',           'neck',         80),
  ('POM9',  'Front zip / placket length', 'Length of the centre-front zip or placket.',                     'fixed',           '',             90),
  ('POM10', 'Bottom hem width',           'Across the bottom hem, edge to edge.',                           'primary_girth',   '',             100),
  ('POM11', 'Collar height',              'Height of the collar at centre back.',                           'fixed',           '',             110),
  ('POM12', 'Bicep width',                'Across the sleeve at the bicep, laid flat.',                     'secondary_girth', '',             120),
  ('POM13', 'Pocket positions',           'Spec note — mark pocket positions on the diagram.',              'fixed',           '',             130)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Jacket / Coat'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ============================================================================
-- PERFORMANCE / TEAMWEAR
-- ============================================================================

-- ---- Football / Sports Jersey --------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Football / Sports Jersey', 'performance'::public.spec_template_category,
       'Teamwear jersey spec — collar and vent points included.', 10, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Football / Sports Jersey'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',      'Measure 1" below the armhole, edge to edge, garment laid flat.', 'primary_girth',   '',             10),
  ('POM2',  'Body length',      'From the High Point Shoulder (HPS) straight down to the hem.',   'body_length',     '',             20),
  ('POM3',  'Shoulder width',   'Seam to seam across the back.',                                  'small',           'shoulder',     30),
  ('POM4',  'Sleeve length',    'From the shoulder seam to the cuff edge.',                       'limb_length',     '',             40),
  ('POM5',  'Sleeve opening',   'Across the sleeve opening, laid flat.',                          'small',           'cuff_opening', 50),
  ('POM6',  'Armhole',          'Straight line, seam to seam.',                                   'secondary_girth', '',             60),
  ('POM7',  'Neck width',       'Seam to seam, inside edge to inside edge.',                      'small',           'neck',         70),
  ('POM8',  'Front neck drop',  'From HPS level down to the front neck seam.',                    'fixed',           '',             80),
  ('POM9',  'Collar height',    'Height of the collar at centre back, if present.',               'fixed',           '',             90),
  ('POM10', 'Bottom hem width', 'Across the bottom hem, edge to edge.',                           'primary_girth',   '',             100),
  ('POM11', 'Side vent length', 'Length of the side vent, if present.',                           'fixed',           '',             110)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Football / Sports Jersey'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Sports Shorts (team) ------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Sports Shorts (team)', 'performance'::public.spec_template_category,
       'Teamwear shorts spec with side/split length.', 20, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Sports Shorts (team)'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Waist relaxed',              'Across the waistband edge to edge, relaxed.',                     'primary_girth',   '',             10),
  ('POM2',  'Waist stretched',            'Across the waistband fully stretched.',                           'primary_girth',   '',             20),
  ('POM3',  'Waistband height',           'Height of the waistband.',                                        'fixed',           '',             30),
  ('POM4',  'Hip',                        'Measured a set distance below the waistband — note the point.',   'primary_girth',   '',             40),
  ('POM5',  'Front rise',                 'From the crotch seam to the top of the waistband, at the front.', 'small',           'rise',         50),
  ('POM6',  'Back rise',                  'From the crotch seam to the top of the waistband, at the back.',  'small',           'rise',         60),
  ('POM7',  'Thigh width',                'Measure 1" below the crotch, edge to edge.',                      'secondary_girth', '',             70),
  ('POM8',  'Leg opening',                'Across the leg opening, laid flat.',                              'small',           'cuff_opening', 80),
  ('POM9',  'Inseam',                     'From the crotch seam to the hem, along the inside leg.',          'fixed',           'inseam',       90),
  ('POM10', 'Side length / split length', 'From the top of the waistband to the hem along the side; note the split length if present.', 'body_length', '', 100)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Sports Shorts (team)'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Base Layer / Compression Top ----------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Base Layer / Compression Top', 'performance'::public.spec_template_category,
       'Close-fit stretch top — relaxed and stretched chest points.', 30, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Base Layer / Compression Top'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1', 'Chest width (relaxed)', 'Measure 1" below the armhole, edge to edge, relaxed.',         'primary_girth',   '',             10),
  ('POM2', 'Chest stretched',       'Measure 1" below the armhole, fully stretched.',               'primary_girth',   '',             20),
  ('POM3', 'Body length',           'From the High Point Shoulder (HPS) straight down to the hem.', 'body_length',     '',             30),
  ('POM4', 'Shoulder width',        'Seam to seam across the back.',                                'small',           'shoulder',     40),
  ('POM5', 'Sleeve length',         'From the shoulder seam to the cuff edge.',                     'limb_length',     '',             50),
  ('POM6', 'Sleeve opening',        'Across the sleeve opening, laid flat.',                        'small',           'cuff_opening', 60),
  ('POM7', 'Neck width',            'Seam to seam, inside edge to inside edge.',                    'small',           'neck',         70),
  ('POM8', 'Armhole',               'Straight line, seam to seam.',                                 'secondary_girth', '',             80)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Base Layer / Compression Top'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ============================================================================
-- WOMENSWEAR / UNISEX ADDITIONS
-- ============================================================================

-- ---- Sports Bra ----------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Sports Bra', 'womenswear'::public.spec_template_category,
       'Bra spec — underbust/bust relaxed and stretched, band and straps.', 10, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Sports Bra'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Underbust width (relaxed)', 'Across the underband edge to edge, relaxed.',                   'secondary_girth', '',         10),
  ('POM2',  'Underbust stretched',       'Across the underband fully stretched.',                         'secondary_girth', '',         20),
  ('POM3',  'Bust width (relaxed)',      'Across the bust at the fullest point, relaxed.',                'primary_girth',   '',         30),
  ('POM4',  'Bust stretched',            'Across the bust at the fullest point, fully stretched.',        'primary_girth',   '',         40),
  ('POM5',  'Band height',               'Height of the underbust rib or elastic band.',                  'fixed',           '',         50),
  ('POM6',  'Strap width',               'Across the strap.',                                             'small',           'strap',    60),
  ('POM7',  'Strap length',              'Along the strap — note whether adjustable.',                    'small',           'strap',    70),
  ('POM8',  'Front length',              'From HPS / strap top down to the underband.',                   'body_length',     '',         80),
  ('POM9',  'Armhole depth',             'From the strap top straight down to the underarm.',             'secondary_girth', '',         90),
  ('POM10', 'Neckline drop (front)',     'From HPS level down to the front neckline edge.',               'fixed',           '',         100),
  ('POM11', 'Racerback width',           'Across the racerback at its narrowest point, if racerback.',    'small',           'shoulder', 110)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Sports Bra'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Crop Top ------------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Crop Top', 'womenswear'::public.spec_template_category,
       'Cropped top spec — short body length.', 20, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Crop Top'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest width',                  'Measure 1" below the armhole, edge to edge, garment laid flat.', 'primary_girth',   '',             10),
  ('POM2',  'Body length',                  'From the High Point Shoulder (HPS) to the hem — short.',         'body_length',     '',             20),
  ('POM3',  'Shoulder width / strap width', 'Seam to seam across the back, or across the strap.',             'small',           'shoulder',     30),
  ('POM4',  'Across shoulder',              'From shoulder point to shoulder point.',                         'small',           'shoulder',     40),
  ('POM5',  'Sleeve length',                'From the shoulder seam to the cuff edge, if sleeved.',           'limb_length',     '',             50),
  ('POM6',  'Sleeve opening',               'Across the sleeve opening, laid flat.',                          'small',           'cuff_opening', 60),
  ('POM7',  'Armhole',                      'Straight line, seam to seam.',                                   'secondary_girth', '',             70),
  ('POM8',  'Neck width',                   'Seam to seam, inside edge to inside edge.',                      'small',           'neck',         80),
  ('POM9',  'Front neck drop',              'From HPS level down to the front neck seam.',                    'fixed',           '',             90),
  ('POM10', 'Bottom hem width',             'Across the bottom hem, edge to edge.',                           'primary_girth',   '',             100)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Crop Top'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Dress ---------------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Dress', 'womenswear'::public.spec_template_category,
       'Dress spec — bust, waist, hip, sweep and skirt length.', 30, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Dress'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest / bust width',       'Measure 1" below the armhole, edge to edge, garment laid flat.',  'primary_girth',   '',             10),
  ('POM2',  'Waist width',              'At the natural waist — note the position from HPS.',              'primary_girth',   '',             20),
  ('POM3',  'Hip width',                'At the hip — note the position from HPS.',                        'primary_girth',   '',             30),
  ('POM4',  'Body length',              'From the High Point Shoulder (HPS) straight down to the hem.',    'body_length',     '',             40),
  ('POM5',  'Shoulder width',           'Seam to seam across the back.',                                   'small',           'shoulder',     50),
  ('POM6',  'Across shoulder',          'From shoulder point to shoulder point.',                          'small',           'shoulder',     60),
  ('POM7',  'Sleeve length',            'From the shoulder seam to the cuff edge, if sleeved.',            'limb_length',     '',             70),
  ('POM8',  'Sleeve opening',           'Across the sleeve opening, laid flat.',                           'small',           'cuff_opening', 80),
  ('POM9',  'Armhole',                  'Straight line, seam to seam.',                                    'secondary_girth', '',             90),
  ('POM10', 'Neck width',               'Seam to seam, inside edge to inside edge.',                       'small',           'neck',         100),
  ('POM11', 'Front neck drop',          'From HPS level down to the front neck seam.',                     'fixed',           '',             110),
  ('POM12', 'Back neck drop',           'From HPS level down to the back neck seam.',                      'fixed',           '',             120),
  ('POM13', 'Hem width / sweep',        'Across the hem sweep, edge to edge.',                             'primary_girth',   '',             130),
  ('POM14', 'Waist to hem (skirt length)', 'From the natural waist down to the hem.',                      'body_length',     '',             140)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Dress'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Skirt ---------------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Skirt', 'womenswear'::public.spec_template_category,
       'Skirt spec — waist, hip, length and sweep.', 40, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Skirt'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1', 'Waist relaxed',      'Across the waistband edge to edge, relaxed.',                   'primary_girth', '',  10),
  ('POM2', 'Waist stretched',    'Across the waistband fully stretched, if elasticated.',         'primary_girth', '',  20),
  ('POM3', 'Waistband height',   'Height of the waistband.',                                      'fixed',         '',  30),
  ('POM4', 'Hip width',          'At the hip — note the position below the waist.',               'primary_girth', '',  40),
  ('POM5', 'Length',             'From the top of the waistband down to the hem.',                'body_length',   '',  50),
  ('POM6', 'Hem width / sweep',  'Across the hem sweep, edge to edge.',                           'primary_girth', '',  60),
  ('POM7', 'Slit / vent length', 'Length of the slit or vent, if present.',                       'fixed',         '',  70)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Skirt'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Bodysuit / Leotard --------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Bodysuit / Leotard', 'womenswear'::public.spec_template_category,
       'Bodysuit spec — HPS-to-gusset length, gusset and leg elastic.', 50, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Bodysuit / Leotard'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1',  'Chest / bust width',     'Measure 1" below the armhole, edge to edge, garment laid flat.', 'primary_girth',   '',             10),
  ('POM2',  'Chest stretched',        'Measure 1" below the armhole, fully stretched.',                 'primary_girth',   '',             20),
  ('POM3',  'Body length',            'From the High Point Shoulder (HPS) to the gusset — note the route measured.', 'body_length', '',   30),
  ('POM4',  'Shoulder / strap width', 'Across the strap at the shoulder.',                              'small',           'strap',        40),
  ('POM5',  'Across shoulder',        'From shoulder point to shoulder point.',                         'small',           'shoulder',     50),
  ('POM6',  'Sleeve length',          'From the shoulder seam to the cuff edge, if sleeved.',           'limb_length',     '',             60),
  ('POM7',  'Sleeve opening',         'Across the sleeve opening, laid flat.',                          'small',           'cuff_opening', 70),
  ('POM8',  'Armhole depth',          'From the shoulder point straight down to the underarm.',         'secondary_girth', '',             80),
  ('POM9',  'Neck width',             'Seam to seam, inside edge to inside edge.',                      'small',           'neck',         90),
  ('POM10', 'Front neck drop',        'From HPS level down to the front neck seam.',                    'fixed',           '',             100),
  ('POM11', 'Back neck drop',         'From HPS level down to the back neck seam.',                     'fixed',           '',             110),
  ('POM12', 'Gusset width',           'Across the gusset at its widest point.',                         'fixed',           '',             120),
  ('POM13', 'Leg opening / elastic',  'Across the leg opening elastic, relaxed.',                       'small',           'cuff_opening', 130)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Bodysuit / Leotard'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ============================================================================
-- OPTIONAL — ACCESSORIES (all points fixed: one-size convention; retag per row
-- if an accessory runs sizes)
-- ============================================================================

-- ---- Beanie / Cap --------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Beanie / Cap', 'accessories'::public.spec_template_category,
       'Headwear points for beanies and caps — one-size by default.', 10, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Beanie / Cap'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1', 'Beanie height',                  'From the crown to the brim.',              'fixed', '', 10),
  ('POM2', 'Beanie width',                   'Across the beanie, relaxed and laid flat.','fixed', '', 20),
  ('POM3', 'Brim / cuff height',             'Height of the folded brim or cuff.',       'fixed', '', 30),
  ('POM4', 'Stretch width',                  'Across the beanie, fully stretched.',      'fixed', '', 40),
  ('POM5', 'Cap crown height',               'From the brim seam to the top button.',    'fixed', '', 50),
  ('POM6', 'Cap brim length',                'From the brim seam to the brim edge.',     'fixed', '', 60),
  ('POM7', 'Cap circumference (relaxed)',    'Around the inside band, relaxed.',         'fixed', '', 70),
  ('POM8', 'Cap circumference (stretched)',  'Around the inside band, fully stretched.', 'fixed', '', 80),
  ('POM9', 'Panel count',                    'Spec note, not a measurement.',            'fixed', '', 90)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Beanie / Cap'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

-- ---- Bag / Tote ----------------------------------------------------------------
insert into public.spec_templates (source, workspace_id, name, category, description, sort_order, created_by)
select 'global', null, 'Bag / Tote', 'accessories'::public.spec_template_category,
       'Bag dimensions and handle points — one-size by default.', 20, null
where not exists (
  select 1 from public.spec_templates t
  where t.source = 'global' and t.name = 'Bag / Tote'
);

insert into public.spec_template_poms (template_id, code, name, how_to_measure, grade_category, sub_kind, sort_order)
select t.id, v.code, v.name, v.hint,
       v.cat::public.spec_grade_category,
       nullif(v.sub, '')::public.spec_pom_sub_kind,
       v.ord
from public.spec_templates t
cross join (values
  ('POM1', 'Height',         'From the base to the top edge.',                          'fixed', '', 10),
  ('POM2', 'Width',          'Across the bag at its widest point.',                     'fixed', '', 20),
  ('POM3', 'Depth / gusset', 'Front to back across the base or gusset.',                'fixed', '', 30),
  ('POM4', 'Handle length',  'End to end along one handle.',                            'fixed', '', 40),
  ('POM5', 'Handle drop',    'From the top edge to the inside top of the handle loop.', 'fixed', '', 50)
) as v(code, name, hint, cat, sub, ord)
where t.source = 'global' and t.name = 'Bag / Tote'
  and not exists (
    select 1 from public.spec_template_poms p
    where p.template_id = t.id and p.code = v.code
  );

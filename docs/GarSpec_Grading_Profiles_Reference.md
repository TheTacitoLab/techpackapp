# GarSpec — Grading Profiles (Starter Set)

Research-grounded reference for GarSpec's starter **Grading Profiles** — the increment rules that turn one sample size into a full graded Spec Sheet. Drafted from current industry grading references, published teamwear graded specs, and pattern-grading conventions (US 2"/5cm and European 4cm systems, ASTM-informed sizing behaviour).

**Status: shipped.** The three profiles below are seeded in `supabase/migrations/0035_spec_seed_profiles.sql` and the grading engine lives in `lib/spec-grading.ts` (unit-tested in `lib/spec-grading.test.ts`, with the seeded values as fixtures). This document remains the rationale/reference for those numbers.

**Positioning (important):** these ship as **"industry-typical defaults — adjust to your fit block."** Grade rules legitimately vary by brand, market, and fit philosophy; there is no single universal standard. These defaults are defensible, conventional starting points — exactly what a student or founder needs — with every value editable.

**Category coverage — teamwear, streetwear, casualwear, formalwear:** these three profiles serve ALL of these categories, because grade increments are driven by DEMOGRAPHIC (how bodies change between sizes), not by garment category. A men's chest grades the same on a jersey, a hoodie, a tee, or a formal overshirt. What differs across categories is handled elsewhere: the FIT/EASE lives in the sample measurements the user enters (boxy streetwear vs slim formal are different samples, graded identically); the TOLERANCES differ by fabric discipline (the knit/woven toggle — teamwear/streetwear knits run looser, formal/casual wovens tighter); and formal SIZE CONVENTIONS (numeric chest sizes 38/40/42, collar sizing) are a size-labelling matter — runs come from Product Setup sizing, so custom-labelled runs are supported by the model rather than needing separate profiles.

---

## 1. Context — how the industry structures grading

- A **grade rule** defines how much each point of measure (POM) changes between consecutive sizes. Different points grade at different rates: girth points (chest/waist/hip) grade the most; lengths grade moderately; small points (neck, cuffs) barely grade; and some points don't grade at all (adult inseams, rib heights, elastic widths).
- The classic adult girth grade is **2 inches (5cm) of circumference per size** (US/AU convention) or **4cm** (European convention). GarSpec measures **flat** (half-circumference), so those appear as **+2.5cm flat** and **+2cm flat** respectively.
- **Grade breaks:** bodies don't scale linearly. Above XL/2XL, girth increments increase (typically by ~25–30%) — a size run to 6XL that keeps a flat grade throughout will fit increasingly tight at the top of the range. GarSpec's profiles build this in.
- **Tolerances** (±) accompany every measurement — the acceptable production deviation. A common convention: tolerance ≈ half the grade increment, tighter on wovens than knits.

## 2. The demographic split — is it standard? YES.

Standard industry practice grades three separate blocks, exactly as proposed:

- **Youth Unisex (YXXS–YXL):** the standard youth block across sportswear, streetwear, schoolwear and casualwear. Pre-adolescent body shapes are similar enough that one unisex block serves both — youth sizes map to age bands (YXXS ≈ 3–4, YXS ≈ 5–6, YS ≈ 7–8, YM ≈ 10–12, YL ≈ 14–16, YXL ≈ 18–20). Youth grades are noticeably LARGER per size than adult grades, because each size spans ~2 years of growth — and unlike adults, youth LENGTHS grade significantly (kids get taller; adults just get wider). Youth garments are conventionally cut on the male block.
- **Men (S–6XL):** straighter block; girth grades relatively uniform through chest/waist/hip; adult inseam typically does NOT grade (leg length is independent of width — handled by S/R/L length options instead).
- **Women (XS–6XL):** graded separately because the block is shaped — bust/waist/hip grade as related-but-distinct points, shoulder grades are smaller than men's, and the European 4cm grade is the common women's convention. Never grade women's from a men's block.

**GarSpec ships three starter profiles matching the proposed runs:**
- **Youth Unisex** — YXXS · YXS · YS · YM · YL · YXL
- **Men's** — S · M · L · XL · 2XL · 3XL · 4XL · 5XL · 6XL
- **Women's** — XS · S · M · L · XL · 2XL · 3XL · 4XL · 5XL · 6XL

---

## 3. How GarSpec profiles apply increments (design decision)

Rather than hard-coding an increment per named POM (which breaks when users customise templates), each profile defines increments per **grade category**, and every POM is tagged with a category:

- **Primary girth** (chest/bust, waist, hip, hem/sweep) — the big movers
- **Secondary girth** (thigh, bicep, armhole, knee, calf)
- **Length — body** (body length, outseam, dress length)
- **Length — limb** (sleeve length; youth inseam)
- **Small** (neck width, cuff/leg opening, shoulder, strap, rises)
- **Fixed** (adult inseam, rib heights, elastic/waistband heights, collar height, pocket dims, zip lengths) — grade = 0

Template POMs come pre-tagged; custom POMs get a category on creation. This makes any Spec Sheet gradeable, including fully custom ones.

---

## 4. The three starter profiles (per-size increments, FLAT measurements, cm)

### MEN'S (S–6XL) — base grade S→XL, break at 2XL+
| Category / typical POMs | S→XL per size | 2XL→6XL per size |
|---|---|---|
| Primary girth — chest, waist, hip, hem | **+2.5** | **+3.5** |
| Secondary girth — bicep, thigh, armhole, knee | +1.2 | +1.8 |
| Body length — HPS-hem, outseam | +1.5 | +1.5 |
| Limb length — sleeve | +1.2 | +1.2 |
| Small — shoulder +1.2 · neck width +0.6 · cuff/leg opening +0.6 · front/back rise +1.0 | as listed | as listed |
| Fixed — inseam, rib/elastic heights, collar height | 0 | 0 |

### WOMEN'S (XS–6XL) — European 4cm-grade convention, break at 2XL+
| Category / typical POMs | XS→XL per size | 2XL→6XL per size |
|---|---|---|
| Primary girth — bust, waist, hip, hem/sweep | **+2.0** | **+3.0** |
| Secondary girth — bicep, thigh, armhole, knee, calf, underbust | +1.0 | +1.5 |
| Body length — HPS-hem, dress length, outseam | +1.2 | +1.2 |
| Limb length — sleeve | +1.0 | +1.0 |
| Small — shoulder +0.6 · neck width +0.6 · cuff/leg opening +0.5 · rises +0.8 · strap +0.3 | as listed | as listed |
| Fixed — inseam, rib/elastic heights, band heights | 0 | 0 |

### YOUTH UNISEX (YXXS–YXL) — larger grades; lengths DO grade
| Category / typical POMs | Per size (whole run) |
|---|---|
| Primary girth — chest, waist, hip, hem | **+3.8** |
| Secondary girth — bicep, thigh, armhole | +1.8 |
| Body length — HPS-hem, outseam | +2.5 |
| Limb length — sleeve | +2.5 · **inseam +2.5 (grades, unlike adult)** |
| Small — shoulder +1.2 · neck width +0.5 · cuff/leg opening +0.8 · rises +1.2 |
| Fixed — rib/elastic heights, collar height | 0 |

*(Youth values align with published teamwear graded specs: jersey chest grading ~3.8cm flat per size, rises ~1–1.2cm, short inseams ~0.6cm with trouser inseams ~2.5cm.)*

---

## 5. Default tolerances (±, cm — editable per profile and per POM)

Tolerances are where the CATEGORY genuinely bites: knit-led categories (teamwear, streetwear, most casualwear) run looser; woven-led categories (formalwear, tailored casualwear, shirting) run tighter. The knit/woven toggle maps directly onto this.

| Point type | Knits (teamwear · streetwear · casual) | Wovens (formal · shirting · tailored) |
|---|---|---|
| Primary girth (chest/waist/hip) | ±1.2 | ±0.6 |
| Secondary girth | ±1.0 | ±0.6 |
| Lengths | ±1.0 | ±1.0 |
| Small points (neck, cuff, shoulder, rises) | ±0.5 | ±0.5 |
| Youth (all girth) | ±1.2–2.5 (youth/team conventions run looser) | — |

A profile carries a knit/woven toggle (or per-POM override). Convention check: tolerance ≈ half the grade increment is a sound default where unsure.

---

## 6. Notes for the engine (carried into the build prompt later)

1. Grading runs FROM the base size OUT in both directions (sample can be any size in the run — commonly M for adults; the engine applies +increment upward, −increment downward per size step, honouring the 2XL+ break).
2. Custom Grading Profiles = same structure (per-category increments + break point + tolerances), user-defined; the three starters are seeded read-only (duplicate-to-edit, matching the Master Library global/workspace pattern).
3. Rounding: grade to 0.1cm; sheets are cm-only in V1 (a per-user unit setting is a later phase).
4. The Spec Sheet stores the sample column as entered and computes the rest live from the profile — so changing profile or sample re-grades instantly (same "read live" philosophy as marker colours).
5. Route B (auto-detect increments from 2+ entered sizes) is **built**: `detectGrade()` in `lib/spec-grading.ts` averages per-step deltas per grade category (inferring the break when 3+ sizes are entered, flagging inconsistent data) and pre-fills a custom-profile dialog for review before anything is applied.

/**
 * Unit tests for the Size Specifications sizing + grading math.
 *
 * Runs on Node's built-in test runner with native type stripping — no test
 * framework installed: `npm test` → `node --test "lib/*.test.ts"`. The
 * relative import needs its explicit `.ts` extension for Node's resolver
 * (allowed by tsconfig's `allowImportingTsExtensions`).
 *
 * Profile numbers used below are the seeded starter profiles from
 * docs/GarSpec_Grading_Profiles_Reference.md (also in migration 0035) so the
 * expectations double as a spot-check of the seed data's math.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultSampleSize,
  findSizeIndex,
  gradeSheet,
  incrementKeyForRow,
  normalizeSizeLabel,
  parseSizeRun,
  resolveBreakIndex,
  roundTo1dp,
  toleranceForRow,
  toleranceKeyForRow,
  type GradableRow,
  type GradingRules,
  type ToleranceSet,
} from "./spec-grading.ts";

// ---- Fixtures: the three seeded profiles (0035) --------------------------------

const MENS: GradingRules = {
  baseIncrements: {
    primary_girth: 2.5,
    secondary_girth: 1.2,
    body_length: 1.5,
    limb_length: 1.2,
    small_shoulder: 1.2,
    small_neck: 0.6,
    small_cuff_opening: 0.6,
    small_rise: 1.0,
    inseam: 0,
  },
  extendedIncrements: {
    primary_girth: 3.5,
    secondary_girth: 1.8,
    body_length: 1.5,
    limb_length: 1.2,
    small_shoulder: 1.2,
    small_neck: 0.6,
    small_cuff_opening: 0.6,
    small_rise: 1.0,
    inseam: 0,
  },
  breakSizeLabel: "2XL",
};

const YOUTH: GradingRules = {
  baseIncrements: {
    primary_girth: 3.8,
    secondary_girth: 1.8,
    body_length: 2.5,
    limb_length: 2.5,
    small_shoulder: 1.2,
    small_neck: 0.5,
    small_cuff_opening: 0.8,
    small_rise: 1.2,
    inseam: 2.5,
  },
  extendedIncrements: null,
  breakSizeLabel: null,
};

const MENS_RUN = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
const YOUTH_RUN = ["YXXS", "YXS", "YS", "YM", "YL", "YXL"];

const row = (
  id: string,
  gradeCategory: GradableRow["gradeCategory"],
  subKind: GradableRow["subKind"] = null,
): GradableRow => ({ id, gradeCategory, subKind });

// ---- Size-run parsing ------------------------------------------------------------

describe("parseSizeRun", () => {
  it("expands an alpha ladder range", () => {
    assert.deepEqual(parseSizeRun("S–2XL"), ["S", "M", "L", "XL", "2XL"]);
  });

  it("is case-insensitive and canonicalises ladder labels", () => {
    assert.deepEqual(parseSizeRun("xs-xl"), ["XS", "S", "M", "L", "XL"]);
  });

  it("understands the XXL synonym for 2XL", () => {
    assert.deepEqual(parseSizeRun("XL–XXXL"), ["XL", "2XL", "3XL"]);
  });

  it("expands a youth ladder range", () => {
    assert.deepEqual(parseSizeRun("YXS–YXL"), ["YXS", "YS", "YM", "YL", "YXL"]);
  });

  it("expands an even-span numeric range at step 2 (UK dress sizes)", () => {
    assert.deepEqual(parseSizeRun("UK 6–18"), ["6", "8", "10", "12", "14", "16", "18"]);
  });

  it("expands an odd-span numeric range at step 1", () => {
    assert.deepEqual(parseSizeRun("6-9"), ["6", "7", "8", "9"]);
  });

  it("accepts a spaced hyphen", () => {
    assert.deepEqual(parseSizeRun("S - XL"), ["S", "M", "L", "XL"]);
  });

  it("accepts the word 'to'", () => {
    assert.deepEqual(parseSizeRun("S to XL"), ["S", "M", "L", "XL"]);
  });

  it("keeps comma-list labels verbatim (age bands never range-expand)", () => {
    assert.deepEqual(parseSizeRun("3-4, 5-6, 7-8"), ["3-4", "5-6", "7-8"]);
  });

  it("parses a plain comma list", () => {
    assert.deepEqual(parseSizeRun("s, m, l"), ["S", "M", "L"]);
  });

  it("dedupes repeated labels", () => {
    assert.deepEqual(parseSizeRun("S, M, M, L"), ["S", "M", "L"]);
  });

  it("preserves combo sizes in comma lists (slash only splits without commas)", () => {
    assert.deepEqual(parseSizeRun("S/M, L/XL"), ["S/M", "L/XL"]);
    assert.deepEqual(parseSizeRun("S/M/L"), ["S", "M", "L"]);
  });

  it("sorts all-ladder lists ascending so grading walks the right way", () => {
    assert.deepEqual(parseSizeRun("2XL, XL, L"), ["L", "XL", "2XL"]);
    assert.deepEqual(parseSizeRun("YL, YS, YM"), ["YS", "YM", "YL"]);
    // Custom labels keep their typed order — we can't know how they rank.
    assert.deepEqual(parseSizeRun("Tall, Short, Regular"), ["Tall", "Short", "Regular"]);
  });

  it("returns [] for empty input", () => {
    assert.deepEqual(parseSizeRun(""), []);
    assert.deepEqual(parseSizeRun(null), []);
    assert.deepEqual(parseSizeRun(undefined), []);
    assert.deepEqual(parseSizeRun("   "), []);
  });

  it("falls back to a single column for unparseable text", () => {
    assert.deepEqual(parseSizeRun("One Size"), ["One Size"]);
  });
});

describe("defaultSampleSize / findSizeIndex / normalizeSizeLabel", () => {
  it("picks the middle of an odd run", () => {
    assert.equal(defaultSampleSize(["XS", "S", "M", "L", "XL"]), "M");
  });

  it("picks the lower middle of an even run", () => {
    assert.equal(defaultSampleSize(["S", "M", "L", "XL"]), "M");
  });

  it("returns null for an empty run", () => {
    assert.equal(defaultSampleSize([]), null);
  });

  it("matches labels under normalization", () => {
    assert.equal(findSizeIndex(["S", "M", "XXL"], "2xl"), 2);
    assert.equal(findSizeIndex(["S", "M"], "XL"), -1);
    assert.equal(normalizeSizeLabel(" xxl "), "2XL");
  });
});

// ---- Grading engine ---------------------------------------------------------------

describe("gradeSheet — outward grading in both directions", () => {
  it("grades a men's primary girth row outward from M, applying the 2XL+ break", () => {
    const rows = [row("chest", "primary_girth")];
    const graded = gradeSheet(rows, "M", { chest: 52 }, MENS, MENS_RUN);
    // Downward: −2.5 per step. Upward: +2.5 until the step's upper size hits
    // 2XL, then +3.5 (XL→2XL extended, 2XL→3XL extended, …).
    assert.deepEqual(graded.chest, {
      S: 49.5,
      M: 52,
      L: 54.5,
      XL: 57,
      "2XL": 60.5,
      "3XL": 64,
      "4XL": 67.5,
      "5XL": 71,
      "6XL": 74.5,
    });
  });

  it("grades symmetrically when the sample sits above the break", () => {
    const rows = [row("chest", "primary_girth")];
    const graded = gradeSheet(rows, "3XL", { chest: 64 }, MENS, MENS_RUN);
    // Walking DOWN from 3XL must land on the same numbers as walking up from
    // M — the step XL→2XL is extended regardless of direction.
    assert.deepEqual(graded.chest, {
      S: 49.5,
      M: 52,
      L: 54.5,
      XL: 57,
      "2XL": 60.5,
      "3XL": 64,
      "4XL": 67.5,
      "5XL": 71,
      "6XL": 74.5,
    });
  });

  it("uses base increments for steps fully below the break", () => {
    const rows = [row("sleeve", "limb_length"), row("body", "body_length")];
    const graded = gradeSheet(
      rows,
      "M",
      { sleeve: 60, body: 70 },
      MENS,
      MENS_RUN,
    );
    assert.equal(graded.sleeve.S, 58.8);
    assert.equal(graded.sleeve.L, 61.2);
    assert.equal(graded.body["6XL"], 80.5); // +1.5 × 7 steps — same value on both sides of the break
  });
});

describe("gradeSheet — break boundary details", () => {
  it("matches the break label under normalization (XXL run, 2XL break)", () => {
    const run = ["XL", "XXL", "3XL"];
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "XL",
      { chest: 57 },
      MENS,
      run,
    );
    assert.deepEqual(graded.chest, { XL: 57, XXL: 60.5, "3XL": 64 });
  });

  it("grades on base increments when the run has no ladder relationship to the break", () => {
    const run = ["38", "40", "42"];
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "40",
      { chest: 52 },
      MENS,
      run,
    );
    assert.deepEqual(graded.chest, { "38": 49.5, "40": 52, "42": 54.5 });
  });

  it("grades extended throughout when the whole run sits above the break (big-and-tall)", () => {
    const run = ["3XL", "4XL", "5XL", "6XL"];
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "3XL",
      { chest: 64 },
      MENS,
      run,
    );
    // Same physical sizes as the full S–6XL run must get the same numbers:
    // the reference's "2XL→6XL per size +3.5" applies even though 2XL itself
    // isn't a column.
    assert.deepEqual(graded.chest, {
      "3XL": 64,
      "4XL": 67.5,
      "5XL": 71,
      "6XL": 74.5,
    });
  });

  it("resolveBreakIndex: exact match wins, ladder position covers above-break runs", () => {
    assert.equal(resolveBreakIndex(["XL", "2XL", "3XL"], "2XL"), 1);
    assert.equal(resolveBreakIndex(["3XL", "4XL"], "2XL"), 0);
    assert.equal(resolveBreakIndex(["S", "M", "L"], "2XL"), -1);
    assert.equal(resolveBreakIndex(["38", "40"], "2XL"), -1);
  });

  it("falls back to base per key when the extended set omits a key", () => {
    const rules: GradingRules = {
      baseIncrements: { primary_girth: 2.5, body_length: 1.5 },
      extendedIncrements: { primary_girth: 3.5 }, // body_length missing
      breakSizeLabel: "2XL",
    };
    const graded = gradeSheet(
      [row("body", "body_length")],
      "XL",
      { body: 70 },
      rules,
      ["XL", "2XL"],
    );
    assert.equal(graded.body["2XL"], 71.5);
  });
});

describe("gradeSheet — fixed rows and small sub-kinds", () => {
  it("keeps fixed rows identical across every size", () => {
    const graded = gradeSheet(
      [row("ribHeight", "fixed")],
      "M",
      { ribHeight: 2.5 },
      MENS,
      MENS_RUN,
    );
    for (const label of MENS_RUN) assert.equal(graded.ribHeight[label], 2.5);
  });

  it("resolves small rows through their sub-kind increments", () => {
    const rows = [
      row("neck", "small", "neck"),
      row("shoulder", "small", "shoulder"),
      row("rise", "small", "rise"),
    ];
    const graded = gradeSheet(
      rows,
      "M",
      { neck: 18, shoulder: 45, rise: 28 },
      MENS,
      MENS_RUN,
    );
    assert.equal(graded.neck.L, 18.6); // +0.6
    assert.equal(graded.shoulder.L, 46.2); // +1.2
    assert.equal(graded.rise.L, 29); // +1.0
  });

  it("keeps a small row flat when the profile omits its sub-kind key (men's strap)", () => {
    const graded = gradeSheet(
      [row("strap", "small", "strap")],
      "M",
      { strap: 3 },
      MENS,
      MENS_RUN,
    );
    for (const label of MENS_RUN) assert.equal(graded.strap[label], 3);
  });
});

describe("gradeSheet — youth inseam vs adult inseam", () => {
  const inseamRow = [row("inseam", "fixed", "inseam")];

  it("grades inseam at +2.5 on the youth profile", () => {
    const graded = gradeSheet(inseamRow, "YM", { inseam: 60 }, YOUTH, YOUTH_RUN);
    assert.deepEqual(graded.inseam, {
      YXXS: 52.5,
      YXS: 55,
      YS: 57.5,
      YM: 60,
      YL: 62.5,
      YXL: 65,
    });
  });

  it("keeps inseam fixed on adult profiles", () => {
    const graded = gradeSheet(inseamRow, "M", { inseam: 78 }, MENS, MENS_RUN);
    for (const label of MENS_RUN) assert.equal(graded.inseam[label], 78);
  });

  it("grades youth lengths (body, sleeve) — unlike adult inseam", () => {
    const graded = gradeSheet(
      [row("body", "body_length")],
      "YM",
      { body: 58 },
      YOUTH,
      YOUTH_RUN,
    );
    assert.equal(graded.body.YL, 60.5);
    assert.equal(graded.body.YXXS, 50.5);
  });
});

describe("gradeSheet — rounding and edge cases", () => {
  it("rounds computed values to 0.1", () => {
    const rules: GradingRules = {
      baseIncrements: { primary_girth: 0.25 },
      extendedIncrements: null,
      breakSizeLabel: null,
    };
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "S",
      { chest: 50 },
      rules,
      ["S", "M", "L"],
    );
    assert.equal(graded.chest.M, 50.3); // 50.25 → 50.3
    assert.equal(graded.chest.L, 50.5);
  });

  it("accumulates unrounded so long runs don't drift", () => {
    // 0.1 × 8 steps of float error must not leak into the far column.
    const rules: GradingRules = {
      baseIncrements: { secondary_girth: 0.1 },
      extendedIncrements: null,
      breakSizeLabel: null,
    };
    const graded = gradeSheet(
      [row("arm", "secondary_girth")],
      "S",
      { arm: 20 },
      rules,
      MENS_RUN,
    );
    assert.equal(graded.arm["6XL"], 20.8);
  });

  it("returns all-null for a row with no sample value", () => {
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "M",
      {},
      MENS,
      MENS_RUN,
    );
    for (const label of MENS_RUN) assert.equal(graded.chest[label], null);
  });

  it("returns all-null when the sample size isn't in the run", () => {
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "XL",
      { chest: 52 },
      MENS,
      ["6", "8", "10"],
    );
    for (const label of ["6", "8", "10"]) assert.equal(graded.chest[label], null);
  });

  it("handles a one-size run (sample column only)", () => {
    const graded = gradeSheet(
      [row("chest", "primary_girth")],
      "One Size",
      { chest: 52 },
      MENS,
      ["One Size"],
    );
    assert.deepEqual(graded.chest, { "One Size": 52 });
  });
});

// ---- Increment/tolerance resolution -----------------------------------------------

describe("incrementKeyForRow / toleranceKeyForRow / toleranceForRow", () => {
  const KNIT: ToleranceSet = {
    primary_girth: 1.2,
    secondary_girth: 1.0,
    body_length: 1.0,
    limb_length: 1.0,
    small: 0.5,
    fixed: 0.5,
  };

  it("maps categories to increment keys", () => {
    assert.equal(incrementKeyForRow("primary_girth", null), "primary_girth");
    assert.equal(incrementKeyForRow("small", "neck"), "small_neck");
    assert.equal(incrementKeyForRow("small", null), null);
    assert.equal(incrementKeyForRow("fixed", null), null);
    assert.equal(incrementKeyForRow("fixed", "inseam"), "inseam");
  });

  it("maps rows to tolerance keys (inseam reads limb length)", () => {
    assert.equal(toleranceKeyForRow("primary_girth", null), "primary_girth");
    assert.equal(toleranceKeyForRow("small", "rise"), "small");
    assert.equal(toleranceKeyForRow("fixed", null), "fixed");
    assert.equal(toleranceKeyForRow("fixed", "inseam"), "limb_length");
  });

  it("prefers the per-row override, then the profile default", () => {
    assert.equal(toleranceForRow("primary_girth", null, 0.8, KNIT), 0.8);
    assert.equal(toleranceForRow("primary_girth", null, null, KNIT), 1.2);
    assert.equal(toleranceForRow("small", "neck", null, KNIT), 0.5);
    assert.equal(toleranceForRow("fixed", "inseam", null, KNIT), 1.0);
    assert.equal(toleranceForRow("primary_girth", null, null, {}), null);
  });

  it("rounds half up at one decimal place", () => {
    assert.equal(roundTo1dp(50.25), 50.3);
    assert.equal(roundTo1dp(50.24), 50.2);
    assert.equal(roundTo1dp(20.799999999999997), 20.8);
  });
});

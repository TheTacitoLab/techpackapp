import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sharp from "sharp";

import { prepareImageForPdf } from "./pdf/image-source.ts";
import { createGate } from "./pdf/page-data.ts";

/** A solid-colour raster of the given size, in the given format. */
async function makeImage(
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp",
  alpha = false,
): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha
        ? { r: 200, g: 40, b: 90, alpha: 0.5 }
        : { r: 200, g: 40, b: 90 },
    },
  });
  if (format === "png") return image.png().toBuffer();
  if (format === "webp") return image.webp().toBuffer();
  return image.jpeg().toBuffer();
}

/** Gaussian noise — incompressible, so a fixture is genuinely large rather
 *  than a flat colour that deflates to nothing. */
function noise(width: number, height: number, channels: 3 | 4) {
  return sharp({
    create: {
      width,
      height,
      channels,
      background: { r: 0, g: 0, b: 0, alpha: 0.5 },
      noise: { type: "gaussian", mean: 128, sigma: 60 },
    },
  });
}

describe("prepareImageForPdf", () => {
  it("passes SVG through untouched — rasterising vector would lose quality", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="4000"></svg>',
    );
    const out = await prepareImageForPdf(svg, "image/svg+xml");
    assert.equal(out.contentType, "image/svg+xml");
    assert.equal(out.data, svg);
  });

  it("passes a small raster through byte-for-byte", async () => {
    const png = await makeImage(120, 80, "png");
    assert.ok(png.byteLength < 600 * 1024, "fixture must be under the cap");
    const out = await prepareImageForPdf(png, "image/png");
    assert.equal(out.contentType, "image/png");
    assert.equal(out.data, png);
  });

  it("downscales an oversized raster to the edge cap, preserving aspect", async () => {
    const big = await noise(5000, 2500, 3).png().toBuffer();
    assert.ok(big.byteLength > 600 * 1024, "fixture must exceed the cap");

    const out = await prepareImageForPdf(big, "image/png");
    const meta = await sharp(out.data).metadata();
    assert.equal(meta.width, 2000);
    assert.equal(meta.height, 1000);
    // Aspect ratio drives where the page geometry places the image, so it must
    // survive the resize exactly.
    assert.equal(meta.width! / meta.height!, 5000 / 2500);
    assert.ok(
      out.data.byteLength < big.byteLength,
      "a downscale must shrink the payload",
    );
  });

  it("re-encodes photographic content as JPEG but keeps transparency in PNG", async () => {
    const opaque = await noise(3000, 3000, 3).png().toBuffer();
    assert.equal(
      (await prepareImageForPdf(opaque, "image/png")).contentType,
      "image/jpeg",
    );

    const transparent = await noise(3000, 3000, 4).png().toBuffer();
    const out = await prepareImageForPdf(transparent, "image/png");
    assert.equal(out.contentType, "image/png");
    assert.equal((await sharp(out.data).metadata()).hasAlpha, true);
  });

  it("keeps a technical flat lossless — line work must not gain JPEG ringing", async () => {
    // White ground with black line work: the content a tech pack is made of,
    // and the content JPEG artifacts would actually show on.
    const strokes = Array.from(
      { length: 60 },
      (_, i) =>
        `<path d="M ${200 + i * 60} 200 C ${400 + i * 20} ${900 + i * 10}, 800 1500, ${1200 + i * 40} 2600" stroke="black" stroke-width="6" fill="none"/>`,
    ).join("");
    const flat = await sharp(
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="4500" height="3000">` +
          `<rect width="100%" height="100%" fill="white"/>${strokes}</svg>`,
      ),
    )
      .png()
      .toBuffer();

    const out = await prepareImageForPdf(flat, "image/png");
    assert.equal(out.contentType, "image/png");
    assert.equal((await sharp(out.data).metadata()).width, 2000);
  });

  it("transcodes WebP, which the PDF engine cannot embed, at any size", async () => {
    const webp = await makeImage(64, 64, "webp");
    const out = await prepareImageForPdf(webp, "image/webp");
    assert.notEqual(out.contentType, "image/webp");
    assert.ok(["image/png", "image/jpeg"].includes(out.contentType));
    assert.equal((await sharp(out.data).metadata()).width, 64);
  });

  it("keeps the original when re-encoding would not shrink it", async () => {
    // Heavily-compressed JPEG noise, already inside the edge cap: re-encoding
    // it at our quality would grow it AND add generational loss, so the
    // original bytes must survive.
    const jpeg = await noise(1800, 1800, 3).jpeg({ quality: 30 }).toBuffer();
    assert.ok(
      jpeg.byteLength > 600 * 1024,
      "fixture must be past the pass-through threshold",
    );
    const out = await prepareImageForPdf(jpeg, "image/jpeg");
    assert.equal(out.data, jpeg);
  });
});

describe("createGate", () => {
  it("never runs more than `limit` tasks at once", async () => {
    const gate = createGate(3);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 20 }, () =>
        gate(async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 1));
          active -= 1;
        }),
      ),
    );

    assert.equal(active, 0);
    assert.ok(peak <= 3, `peak concurrency was ${peak}`);
    assert.equal(peak, 3, "the gate should still saturate its limit");
  });

  it("releases its slot when a task throws, so the queue drains", async () => {
    const gate = createGate(1);
    await assert.rejects(
      gate(async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    assert.equal(await gate(async () => "after"), "after");
  });
});

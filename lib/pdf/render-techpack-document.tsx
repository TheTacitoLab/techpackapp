/**
 * The FULL tech pack document: cover page → every canvas page (the proven
 * composed renderer, untouched) → Bill of Materials page(s) → Size
 * Specification page(s). Assembly only — document-wide "Page X of Y"
 * numbering is threaded through the existing header/footer props on each
 * page's data; nothing about the per-page layout changes here.
 */

import { Document, renderToStream } from "@react-pdf/renderer";

import { PDF_BRAND_NAME } from "@/lib/pdf/branding";
import { BomPage, type PdfBomPageData } from "@/lib/pdf/render-bom-page";
import { CoverPage, type PdfCoverData } from "@/lib/pdf/render-cover-page";
import {
  PalettePage,
  type PdfPalettePageData,
} from "@/lib/pdf/render-palette-page";
import {
  SpecSheetPage,
  type PdfSpecSheetPageData,
} from "@/lib/pdf/render-spec-sheet-page";
import {
  TechPackCanvasPage,
  type PdfPageData,
} from "@/lib/pdf/render-techpack-page";

export type TechPackDocumentData = {
  /** Always present — an empty product exports as a cover-only document. */
  cover: PdfCoverData;
  /** The dedicated Colour Palette page, directly after the cover — set only
   *  when the palette is too large for the cover's band (coverPaletteFits);
   *  the cover then carries no palette of its own. */
  palettePage: PdfPalettePageData | null;
  /** Canvas pages in order, each with pageNumber/pageCount preset by the
   *  assembler (cover is page 1, so these start at 2 — or 3 past an
   *  overflowed palette page). */
  pages: PdfPageData[];
  /** BOM pages (already paginated); empty when there is nothing to list or
   *  the export deselected the BOM section. */
  bomPages: PdfBomPageData[];
  /** Size Specification table page(s), after the BOM; empty when the product
   *  has no Spec Sheets or the export deselected them. */
  specPages: PdfSpecSheetPageData[];
};

export function TechPackDocument({ data }: { data: TechPackDocumentData }) {
  return (
    <Document
      title={`${data.cover.productName}, Tech Pack`}
      author={PDF_BRAND_NAME}
    >
      <CoverPage data={data.cover} />
      {data.palettePage && <PalettePage data={data.palettePage} />}
      {data.pages.map((page, i) => (
        <TechPackCanvasPage key={i} data={page} />
      ))}
      {data.bomPages.map((bom, i) => (
        <BomPage key={i} data={bom} />
      ))}
      {data.specPages.map((spec, i) => (
        <SpecSheetPage key={i} data={spec} />
      ))}
    </Document>
  );
}

/**
 * Render the full document to a PDF stream (server-side).
 *
 * A STREAM rather than a Buffer, for two reasons. The response can then be
 * streamed to the client, which is what lets a large tech pack past the host's
 * 6 MB buffered-response cap (see `lib/pdf/response.ts`); and it skips the
 * `Buffer.concat` inside `renderToBuffer`, which holds the finished document
 * twice over at the moment of concatenation.
 *
 * The promise resolves only after layout has completed — react-pdf awaits
 * `layoutDocument` before handing back the stream — so a document that cannot
 * be laid out still rejects here, in time for the route to answer with a 500
 * instead of a half-written download.
 */
export async function renderTechPackDocumentPdf(
  data: TechPackDocumentData,
): Promise<NodeJS.ReadableStream> {
  return renderToStream(<TechPackDocument data={data} />);
}

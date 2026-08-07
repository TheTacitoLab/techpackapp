/**
 * Handing a rendered PDF to `Response` without copying it.
 *
 * `new Uint8Array(buffer)` COPIES, which briefly doubles a multi-megabyte
 * document in memory — the last thing a memory-constrained export function
 * needs. A view over the same bytes costs nothing.
 */

export function pdfBody(pdf: Buffer): Uint8Array<ArrayBuffer> {
  // A Node Buffer is always backed by a plain ArrayBuffer here; the cast only
  // narrows away the `SharedArrayBuffer` half of `ArrayBufferLike`, which
  // `BodyInit` does not accept. byteOffset/byteLength matter: small Buffers
  // are slices of a shared pool.
  return new Uint8Array(
    pdf.buffer as ArrayBuffer,
    pdf.byteOffset,
    pdf.byteLength,
  );
}

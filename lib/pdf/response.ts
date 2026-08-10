/**
 * Getting a rendered PDF out of the export routes and down the wire.
 *
 * WHY IT STREAMS. A serverless host buffers a normal function response in
 * memory before sending it, and caps that payload — on Netlify it is 6 MB,
 * which a tech pack of any size clears easily. Past the cap the platform
 * discards the response and serves its own error page, which is why big packs
 * failed while small ones downloaded fine. A response whose body is a
 * ReadableStream is sent as it is produced instead, raising the ceiling to
 * 20 MB, and it skips the `Buffer.concat` that `renderToBuffer` needs — which
 * briefly holds the whole document TWICE.
 */

import { Readable } from "node:stream";

/**
 * A rendered PDF stream as a web ReadableStream, ready to be a `Response`
 * body. `onFinish` reports the byte count once the last chunk is out, so the
 * routes can log what they actually sent (a size nobody can know up front when
 * streaming).
 */
export function pdfStream(
  stream: NodeJS.ReadableStream,
  onFinish?: (bytes: number) => void,
): ReadableStream<Uint8Array> {
  let bytes = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      onFinish?.(bytes);
    },
  });
  return (
    Readable.toWeb(stream as Readable) as ReadableStream<Uint8Array>
  ).pipeThrough(counter);
}


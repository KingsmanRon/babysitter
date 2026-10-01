import type { IncomingMessage } from "node:http";

// Reads the exact request bytes for signature verification.
//
// Vercel's Node runtime buffers the body before the handler runs, then replays
// it only through the `data`/`end` events (it ignores `config.api.bodyParser`).
// Async iteration over `req` sees an already-drained stream and yields nothing,
// and touching `req.body` hands back parsed JSON, not the signed bytes. So
// listen for `data`/`end` directly, which works with or without the helpers.
export function readRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

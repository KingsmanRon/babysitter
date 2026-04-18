import type { IncomingMessage } from "node:http";

export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  // Some Vercel runtimes pre-parse and expose `req.body`. If it's already a
  // Buffer or string, use it; otherwise stream the request.
  const maybeBody = (req as unknown as { body?: unknown }).body;
  if (Buffer.isBuffer(maybeBody)) return maybeBody;
  if (typeof maybeBody === "string") return Buffer.from(maybeBody, "utf8");

  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return Buffer.concat(chunks);
}

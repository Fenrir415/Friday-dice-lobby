// Local stand-in for Netlify: serves public/ and the real lobby handler with an in-memory store.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createHandler } from "../lib/lobby-handler.mjs";

const m = new Map();
const store = {
  async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
  async setJSON(k, v) { m.set(k, structuredClone(v)); },
  async delete(k) { m.delete(k); },
  async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
const handler = createHandler({ store });
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript" };
const port = Number(process.argv[2] ?? 8888);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === "/api/lobby") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await handler(new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  try {
    const body = await readFile(join("public", file));
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log(`http://localhost:${port}`));

// Local stand-in for Netlify: serves public/ and the real lobby handler with an in-memory store.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createHandler } from "../lib/lobby-handler.mjs";
import { createWheelHandler } from "../lib/wheel-handler.mjs";

const m = new Map();
const etags = new Map();
let version = 0;
const store = {
  async get(k) { return m.has(k) ? structuredClone(m.get(k)) : null; },
  async getWithMetadata(k) { return m.has(k) ? { data: structuredClone(m.get(k)), etag: etags.get(k), metadata: {} } : null; },
  async setJSON(k, v, { onlyIfMatch, onlyIfNew } = {}) {
    if (onlyIfNew && m.has(k)) return { modified: false };
    if (onlyIfMatch && etags.get(k) !== onlyIfMatch) return { modified: false };
    m.set(k, structuredClone(v)); etags.set(k, String(++version));
    return { modified: true };
  },
  async delete(k) { m.delete(k); },
  async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
};
const handler = createHandler({ store });
// Local testing only: FORCE_SLIP=1 makes every allowed funny spin a slip.
const forced = process.env.FORCE_SLIP ? (() => { const v = [0, 0.99]; let i = 0; return () => (i < 2 ? v[i++] : Math.random()); }) : null;
const wheel = createWheelHandler({ store, rng: forced ? (...a) => (forced.cur ??= forced())(...a) : Math.random });
if (forced) setInterval(() => { forced.cur = forced(); }, 500);
const routes = { "/api/lobby": handler, "/api/wheel": wheel };
const types = { ".svg": "image/svg+xml", ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript" };
const port = Number(process.argv[2] ?? 8888);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const api = routes[url.pathname];
  if (api) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await api(new Request(url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    return res.end(await r.text());
  }
  // Like Netlify: /dice and /dice/ serve public/dice/index.html.
  let file = url.pathname.replace(/^\/+/, "");
  if (file === "" || file.endsWith("/")) file += "index.html";
  else if (!extname(file)) file += "/index.html";
  try {
    const body = await readFile(join("public", file));
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log(`http://localhost:${port}`));

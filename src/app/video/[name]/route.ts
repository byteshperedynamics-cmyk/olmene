import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Range-aware video serving.
 *
 * Workers static assets return the full file (200) for Range requests, which
 * breaks video seeking and Safari/iOS playback. This handler serves the MP4s
 * from the ASSETS binding with proper 206 Partial Content responses.
 *
 * The files live in public/media/, NOT public/video/: a public file at the
 * requested path is served by Next as a plain static asset before this route
 * runs (that is what happened in production until 2026-10-15). Pages link to
 * /video/<name>.mp4, `run_worker_first: ["/video/*.mp4"]` sends those requests
 * to the Worker, and this route reads /media/<name> from the assets.
 */

const FILES: Record<string, { type: string }> = {
  "olmene-demo.mp4": { type: "video/mp4" },
  "olmene-film.mp4": { type: "video/mp4" }, // the 20-second brand film on the homepage
};

function parseRange(header: string | null, total: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = header.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
  if (Number.isNaN(start) || start > end || start >= total) return null;
  return { start, end };
}

async function loadFile(name: string): Promise<ArrayBuffer | null> {
  // Production: read from the Workers ASSETS binding (path-based lookup).
  try {
    const { env } = getCloudflareContext({ async: false });
    const res = await env.ASSETS.fetch(`https://assets.local/media/${name}`);
    if (res.ok) return await res.arrayBuffer();
    return null;
  } catch {
    // Local dev (next dev): no Cloudflare bindings — read straight from public/.
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const buf = await readFile(join(process.cwd(), "public", "media", name));
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      return null;
    }
  }
}

export async function GET(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const meta = FILES[name];
  if (!meta) return new Response("Not found", { status: 404 });

  const buf = await loadFile(name);
  if (!buf) return new Response("Video unavailable", { status: 502 });

  const total = buf.byteLength;
  const headers = new Headers({
    "Content-Type": meta.type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
  });

  const range = parseRange(request.headers.get("range"), total);
  if (request.headers.get("range") && !range) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  if (range) {
    const slice = buf.slice(range.start, range.end + 1);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${total}`);
    headers.set("Content-Length", String(slice.byteLength));
    return new Response(slice, { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  return new Response(buf, { status: 200, headers });
}

export async function HEAD(request: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const meta = FILES[name];
  if (!meta) return new Response(null, { status: 404 });
  const buf = await loadFile(name);
  if (!buf) return new Response(null, { status: 502 });
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": meta.type,
      "Content-Length": String(buf.byteLength),
      "Accept-Ranges": "bytes",
    },
  });
}

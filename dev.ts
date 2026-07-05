#!/usr/bin/env bun
// dev.ts — local dev server with rebuild-on-save + browser live-reload.
//
//   bun run dev            # serve on http://localhost:8080, watch src/, auto-reload
//   PORT=3000 bun run dev  # custom port
//
// Watches src/. On any change it runs the same `build.ts` concatenation, then pings
// connected browsers over a WebSocket to reload. The live-reload snippet is injected
// ONLY into responses served by this dev server — it is never written to disk, so the
// shipped rogue-racer.html stays clean. Players never see it.

import { watch } from "node:fs";

const PORT = Number(process.env.PORT || 8080);
const ROOT = import.meta.dir;

// Build once up front so a fresh clone serves something.
async function build(): Promise<string | null> {
  const proc = Bun.spawn(["bun", "build.ts"], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    console.error("build failed:\n" + err);
    return err || "build failed";
  }
  return null;
}

const RELOAD_SNIPPET = `
<script>
// injected by dev.ts — live reload; not present in the shipped file
(function () {
  let ws;
  function connect() {
    ws = new WebSocket("ws://" + location.host + "/__livereload");
    ws.onmessage = (e) => { if (e.data === "reload") location.reload(); };
    ws.onclose = () => setTimeout(connect, 800); // server restarted — retry
  }
  connect();
})();
</script>
`;

const clients = new Set<any>();

let building = false;
async function rebuildAndReload() {
  if (building) return;
  building = true;
  const err = await build();
  building = false;
  if (err) {
    // Surface the error in the browser instead of silently serving stale output.
    for (const ws of clients) { try { ws.send("error:" + err.slice(0, 500)); } catch {} }
    console.log("⚠  build error (browser not reloaded)");
    return;
  }
  console.log("↻  rebuilt — reloading " + clients.size + " client(s)");
  for (const ws of clients) { try { ws.send("reload"); } catch {} }
}

await build();

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/__livereload") {
      if (srv.upgrade(req)) return; // handed to websocket handler
      return new Response("expected websocket", { status: 426 });
    }
    let path = url.pathname === "/" ? "/rogue-racer.html" : url.pathname;
    const file = Bun.file(ROOT + path);
    if (!(await file.exists())) return new Response("not found: " + path, { status: 404 });

    // Inject the live-reload snippet into the game page only.
    if (path === "/rogue-racer.html") {
      let html = await file.text();
      html = html.includes("</body>")
        ? html.replace("</body>", RELOAD_SNIPPET + "</body>")
        : html + RELOAD_SNIPPET;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    return new Response(file);
  },
  websocket: {
    open(ws) { clients.add(ws); },
    close(ws) { clients.delete(ws); },
    message() {},
  },
});

console.log(`\n  Rogue Racer dev server`);
console.log(`  → http://localhost:${server.port}   (watching src/, live-reload on)\n`);

// Debounced watch on src/ so a burst of saves triggers one rebuild.
let timer: ReturnType<typeof setTimeout> | null = null;
watch(ROOT + "/src", { recursive: true }, (_event, filename) => {
  if (!filename) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(rebuildAndReload, 120);
});

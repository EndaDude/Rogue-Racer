---
name: run
description: Launch Rogue Racer locally with hot reload so a change can be seen in the real game. Use when asked to run, start, serve, launch, open, or preview the game, or to confirm a change works in the browser (not just tests).
---

# Run Rogue Racer locally

The game ships as a single generated `rogue-racer.html`, built from `src/` by `bun build.ts`.
For local development use the **dev server** (`dev.ts`) — it rebuilds on every `src/` change and
live-reloads the browser. The live-reload snippet is injected only by the dev server; it is never
written to disk, so the shipped file stays clean.

## Launch

Start the dev server in the background (it stays up across turns; do NOT block on it):

```
bun dev.ts
```

Then verify and open it:

```
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8080/   # expect 200
open http://localhost:8080/                                            # macOS; see below for others
```

- Default port is **8080**; override with `PORT=3000 bun dev.ts`.
- If 8080 is busy: `lsof -ti:8080 | xargs kill` first, or use another PORT.
- Open command by platform: macOS `open`, Linux `xdg-open`, WSL `explorer.exe`.

## Confirming a change works

1. Edit files under `src/` (never `rogue-racer.html` — it's generated).
2. Save. The dev server rebuilds and the browser tab reloads automatically.
3. Check the background server's output for `↻ rebuilt` or `⚠ build error`.
4. The CRT terminal shows `GAME_VERSION` — a quick way to confirm the served build is current.

To verify a build without the server: `bun run build` then `bun run check` (fails if the
committed `rogue-racer.html` is stale vs `src/`).

## Notes

- No test suite or linter — behavior is verified by playing.
- Multiplayer is PeerJS peer-to-peer with no server; to test two players locally, open the URL
  in two browser windows (one hosts, one joins the room code).
- Shipping is unrelated to this server: `rogue-racer.html` pushed to `main` is what reaches
  players via the self-updating loader. See CLAUDE.md.

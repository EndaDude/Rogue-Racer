# Planned optimizations

Performance backlog for Rogue Racer. The game is CPU/GPU **frame-time** bound (per-frame
JS + canvas work), not RAM bound — see "On RAM / lag" at the bottom. Items are ordered
roughly easiest-win → most-involved. Verify each by playing (there is no test suite);
watch frame time in the browser Performance panel.

## Quick wins (low risk, high value)

- **Add a "Low FX" quality toggle.** Single fastest user-facing fix. One flag that:
  reduces the particle spawn caps, disables custom trails + skid marks, drops
  `ctx.shadowBlur` glows, and lowers screen-shake/juice. Wire it into the CRT terminal
  (`fx low|high`) and persist it with the other settings. Lets a slow machine stay
  playable without code changes elsewhere.
- **Audit `ctx.shadowBlur` / glow usage in `190-render.js` and `120-*`.** Canvas shadow
  blur is one of the most expensive 2D operations. Replace per-entity glows with
  pre-rendered sprites or gate them behind the Low FX flag.
- **Cache `Object.values(G.players)` once per frame.** Many per-frame functions
  (`drawPlayers`, `drawFx`, `updateFxEmitters`, `drawPlayerTrails`, …) each call
  `Object.values(G.players).forEach(...)`, allocating a fresh array every call — and some
  are called once *per layer*. Build the array once at the top of the frame and pass it
  down.

Note - These have already been implemented

## Render pipeline (`190-render.js`)

- **Bucket entities by layer once per frame instead of re-scanning per layer.** The
  Phase-C loop calls `drawTrackWalls / drawObstacles / drawItems / drawSkidMarks /
  drawDriftTrails / drawPlayerTrails / drawPlayers / drawFx` **once per layer**, and each
  of those re-iterates *all* entities filtering `(e.layer||0) !== layer`. With `L` layers
  and `E` entities that is `L × E` scans/frame. Pre-bucket each entity list into
  `byLayer[layer]` once, then each pass touches only its own bucket.
- **Replace the decal-clip cache key with a version counter.** `getPlayerDecalClip` does
  `JSON.stringify(decals)` every frame per player to build its cache key — a string
  allocation + serialize even when nothing changed. Bump an integer `p._decalVer` only
  when decals actually change (on Apply / on `player_profile` sync), and key the cache on
  `shape + size + _decalVer`. Turns a per-frame serialize into an int compare.
- **Batch `drawPlayerTrails`.** It currently calls `ctx.stroke()` per segment with
  `setLineDash([...])` and a freshly built `rgba(...)` template string per segment.
  Precompute the `rgb` prefix once per player, drop the dash (invisible on a ~1px ribbon
  and it forces extra work), and group segments into a few alpha buckets drawn as single
  `Path2D` strokes.
- **Bake skid marks / drift trails into a persistent offscreen layer.** They accumulate
  and are re-stroked every frame. Stamp new marks onto a scrolling offscreen canvas once,
  then blit that canvas — instead of re-drawing every historical mark each frame. (The
  ground already uses an offscreen tile cache, `groundCache`; reuse the pattern.)
- **Minimize canvas state churn.** Reduce `save/restore/setTransform` per entity; draw
  entities that share a transform together.

## FX / particles (`130-juice-engine.js`, `120-*`)

- **Confirm particle pooling has a hard cap and dynamic scaling.** Keep the pool bounded
  and scale the spawn rate by a rolling FPS estimate so a slow frame doesn't spiral
  (spawn less when frame time climbs).
- **Cap every unbounded per-player buffer.** `_trail` is now capped (14). Apply the same
  discipline to any other growing arrays (skid marks, impact particles).
- **Reuse Web Audio nodes.** Ensure procedural SFX nodes are pooled/disconnected rather
  than created per shot; stray nodes add GC pressure and audio-thread load.

## Networking (`040-networking-peerjs.js`)

- **`netPlayers()` already strips transient caches before sending** — keep new per-player
  fields underscore-prefixed so they never hit the wire.
- **Shrink decal payloads.** Decals sync as 256px PNG data URLs; multiple decals per
  player multiply the lobby/state payload. Downscale the stored decal (e.g. 128px) and/or
  cap decal count. PNG is needed for transparency, so keep it but keep it small.
- **Throttle full-`players` broadcasts.** Prefer small per-field deltas over resending the
  whole players map on every minor change.

## Profiling guidance

- Use the browser DevTools **Performance** tab (works against `bun run dev` on
  http://localhost:8080) to record a few race seconds and find the widest frame-time
  bars — optimize those first rather than guessing.
- Toggle features off one at a time (trails, particles, shadow glows) to attribute cost.

## On RAM / lag

There isn't a meaningful "allocate more RAM" knob that fixes this kind of lag:

- The game is a 2D **canvas** app. Its lag is almost always **per-frame CPU/GPU work**
  (draw calls, particles, shadow blur, JS in the update loop) — not memory pressure. More
  RAM won't raise the frame rate.
- In the **browser**, JS heap is managed automatically; there's no per-page RAM setting.
  Best levers: enable hardware/GPU acceleration, close other heavy tabs, and use the Low
  FX toggle above.
- In the **desktop (Tauri) build**, the webview uses system memory automatically — there's
  no `-Xmx`-style allocation to raise. Same story: it's frame time, not RAM.

So the real fix for the lag is the render/FX optimizations above (start with the Low FX
toggle + shadow-blur audit + layer bucketing), not a memory setting.

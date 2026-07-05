# src/ — the game, split into editable pieces

**`rogue-racer.html` at the repo root is GENERATED. Do not hand-edit it.** Edit the files
here, then run the build.

## How it works

The whole game used to be one ~17.5k-line `rogue-racer.html`. It's now split into:

- **`index.html`** — the shell: `<head>`, the `<style>` block, the PeerJS `<script src>`, and
  a `// @@BUNDLE@@` marker inside an empty `<script>` where the game code gets injected.
- **`NNN-*.js`** — the game code, one file per `// ====` subsystem. These are **plain scripts
  sharing one global scope** (the same `G` object, functions calling each other freely) —
  there are **no `import`/`export`s**. The numeric prefix is concatenation order (config and
  state load first; render/terminal reference everything, so they load last). Gaps of 10 leave
  room to insert new sections.

`bun build.ts` reads `NNN-*.js` in prefix order, concatenates them with newlines, and
substitutes the result into `index.html`'s marker to produce the root `rogue-racer.html`.
Because it's plain concatenation, the built file is byte-for-byte what the single file was.

## Workflow

Fastest loop — dev server with hot reload:

```sh
bun run dev          # http://localhost:8080, rebuilds on save + auto-reloads the browser
```

Or build manually:

```sh
# edit files under src/, then:
bun run build        # regenerates ../rogue-racer.html
git add src/ rogue-racer.html
```

Enable the freshness guard once per clone so a stale/hand-edited artifact can't be committed:

```sh
bun run hooks        # sets core.hooksPath to .githooks (installs the pre-commit check)
```

`bun run check` rebuilds and fails if the committed `rogue-racer.html` doesn't match `src/`.

## Adding / moving code

- New subsystem → add `NNN-name.js` with a prefix that places it correctly in load order.
- Splitting a big file further → keep prefixes ordered; the build just globs `NNN-*.js`.
- Editing the DOM, CSS, or `<head>` → that's `index.html`, not a `.js` file.

## Shipping is unchanged

The self-updating loader (`desktop/bootstrap.html`) still `document.write`s a single
`rogue-racer.html`, and pushing that file to `main` still ships the game. The split only
changes how *developers* edit it — see [../docs/features/rebuild-plan.md](../docs/features/rebuild-plan.md).

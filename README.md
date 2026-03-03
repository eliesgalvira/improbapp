# improbapp — probability, playfully

An interactive probability visualization built with Next.js, React, and TypeScript.

## What's in it

1. **Morphing title** — a playful letter-by-letter morph animation that cycles through wordplay variations of "Improb app" (uses [Motion for React](https://motion.dev/)). The title phrases are configured in [`components/MorphTitle.tsx`](components/MorphTitle.tsx) in the `ANCHORS` array.

2. **Random Variable Viz** — an interactive hex-grid probability space. Paint hexagons, assign numeric values, then sample to build an empirical distribution in real time.

## Running the app

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/
  layout.tsx       — root layout (fonts, metadata)
  page.tsx         — main page (title + viz)
  globals.css      — all styling
components/
  MorphTitle.tsx   — animated morphing title
  RandomVariableViz.tsx — hex grid + distribution chart
lib/
  hex.ts           — hex grid geometry utilities
```

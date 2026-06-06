# Focus Router

A tiny, single-page web app for sit-down focus. Tap your energy, tap how much
time you have, and it routes you into a mode (Deep Work / Steady / Knock-outs)
+ one of your pre-defined projects, then runs a focus timer.

Projects have an energy tag (which mode they belong to) and a priority (P1–P3),
which determines the order they appear in on the Call screen.

No tasks. No accounts. No backend. Projects persist in `localStorage`.

## Stack

- React 18 + Vite + TypeScript
- Plain React with inline styles (no UI library, no Tailwind)
- Web Audio API for the completion chime

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/
npm run preview  # serve the built site locally
```

## Deploy

`npm run build` emits `dist/`. Drop it on any static host:

- **Vercel** — `vercel deploy` (output dir: `dist`)
- **Netlify** — `netlify deploy --dir=dist --prod`
- **GitHub Pages** — push `dist/` to the `gh-pages` branch (e.g. `npx gh-pages -d dist`)

No env vars, no API keys, no server.

## Data

Projects are stored under the `focus_projects` key in `localStorage` as a JSON
array of `{ id, name, energy, priority }`. Edit them via the **⚙ Projects**
button on the Check-in screen. Legacy `focus_areas` entries are migrated on
first load (priority defaults to P2).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the app

```bash
npm install
ANTHROPIC_API_KEY=sk-... npm start   # or: export the key first, then npm start
```

Opens at `http://localhost:3000`. The server also serves all static frontend files, so there is no separate dev server.

## Architecture

**Two-layer design:** a vanilla JS single-page app (no framework, no build step) backed by a minimal Express server whose only job is the Wikipedia scrape endpoint.

```
server.js          Express: static file serving + POST /api/scrape
index.html         Shell: header, timeline viewport, 3 modal templates
style.css          All layout and theming (dark, CSS variables)
data.js            Preset timelines injected as window.PRESET_TIMELINES
app.js             All frontend state, rendering, interaction
```

**Frontend state** lives in a single `state` object (`timelines`, `pxPerYear`, `startYear`, `endYear`, `savedScroll`) plus a module-level `pendingWikiEvents` that holds events fetched from the server until the Add Timeline form is submitted.

**Rendering pipeline:** `render()` → `updateCanvasWidth()` + `renderRuler()` + `renderRows()`. Everything is re-rendered from scratch on each state change; there is no virtual DOM or diffing.

**Coordinate system:** `yearToX(year)` maps a year to a CSS pixel offset within `#timeline-canvas`. The canvas is wider than the viewport; horizontal scrolling is handled by `#timeline-viewport` (`overflow-x: scroll`). Both the ruler and the row labels use `position: sticky` to stay visible while scrolling.

**Wikipedia import flow:**
1. User types a topic in the Add Timeline modal and clicks Search.
2. `scrapeWikipedia()` in `app.js` POSTs to `/api/scrape`.
3. `server.js` fetches the Wikipedia plain-text extract (up to 15 000 chars), sends it to Claude Haiku with a cached system prompt, and parses the JSON response.
4. The returned `{ timelineName, events[] }` auto-fills the name field; events are stored in `pendingWikiEvents`.
5. On form submit, `addTimeline(name, color, pendingWikiEvents)` merges them into state.

## Key constants (app.js)

| Constant | Purpose |
|---|---|
| `SIDE_PADDING = 120` | Extra px on each side of first/last event |
| `MIN_TICK_PX = 55` | Minimum px between ruler ticks (drives tick interval selection) |
| `TIERS = 4`, `TIER_H = 14` | Label stagger: max tiers and px per tier |
| `MIN_PX = 2`, `MAX_PX = 120` | Zoom clamp range (px per year) |

## Git workflow

Only commit and push when explicitly asked by the user. When committing:
- Write a concise commit message (imperative mood, ≤ 72 chars subject line)
- Follow with a short body if the change needs context
- Push to GitHub (`git push`) in the same step

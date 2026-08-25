# Yorayriniwnl.in — Field Hub

The broader personal internet around the portfolio: experiments, shipped project links, playable games, field notes, media, and activity.

The focused portfolio lives in the separate [Yor / Ayrin portfolio](https://yorayriniwnl.vercel.app).

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Structure

- `src/App.tsx` — hub composition, project index, arcade launcher, and archive content.
- `src/styles.css` — the visual system and responsive layout.
- `src/games/` — lazy-loaded playable experiences.
- `src/data/`, `src/hooks/`, and `src/lib/games/` — game data and reusable game logic.

Games open in an accessible full-screen modal so the main field stays lightweight and the experiences stay contained.

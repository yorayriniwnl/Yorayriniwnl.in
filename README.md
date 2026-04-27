# Yorayriniwnl Project Hub

Single-page project gateway built with Vite, React, and TypeScript. The app is designed as the default landing page for Yorayriniwnl projects, linking live builds, GitHub repositories, and the separate portfolio page.

## Tech Stack

- React 18
- TypeScript
- Vite
- CSS-driven UI

## Getting Started

### Prerequisites

- Node.js 18+ recommended
- npm

### Install

```bash
npm install
```

### Run Locally

```bash
npm run dev
```

Vite will start a local development server and print the URL in the terminal, usually `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

### Preview the Production Build

```bash
npm run preview
```

## Project Structure

- `Portfolio.tsx` contains the main project hub experience and content data.
- `src/App.tsx` re-exports the project hub component for the Vite entry point.
- `src/main.tsx` mounts the app.

## Customization

Most of the project hub content is defined directly in `Portfolio.tsx`, including project cards, repository links, and contact details. Update those data arrays when GitHub repositories or live deployments change.

## Scripts

- `npm run dev` - start the development server
- `npm run build` - type-check and build the production bundle
- `npm run preview` - preview the production build locally

## Deployment

This project can be deployed to any static hosting provider that supports Vite builds, such as Vercel, Netlify, or GitHub Pages.

### Vercel

This repository includes a [`vercel.json`](./vercel.json) override so Vercel treats it as a Vite app even if the linked dashboard project was previously configured with a different framework preset.

Typical Vercel workflow:

```bash
npx vercel link --yes --project <project-name> --scope <team>
npx vercel pull --yes --environment production --scope <team>
npx vercel build --prod --scope <team>
```

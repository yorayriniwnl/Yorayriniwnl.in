import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/war-room-assets/" : "/",
  plugins: [react()],
  build: {
    rolldownOptions: { input: ["index.html", "game.html"] },
  },
}));

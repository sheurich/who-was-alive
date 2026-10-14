import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        lifetimes: "index.html",
        infiniteGames: "infinite-games.html",
      },
    },
  },
});

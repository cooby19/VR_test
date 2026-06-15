import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: process.env.VITE_USE_HTTPS === "1" ? [basicSsl()] : []
});

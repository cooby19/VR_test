import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/VR_test/",
  plugins: process.env.VITE_USE_HTTPS === "1" ? [basicSsl()] : []
});

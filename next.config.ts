import type { NextConfig } from "next";

// GitHub Codespaces (Test am Handy): App läuft hinter https://<name>-3000.app.github.dev
const codespaces = "*.app.github.dev";

export default {
  allowedDevOrigins: [codespaces],
  experimental: { serverActions: { allowedOrigins: [codespaces] } },
} satisfies NextConfig;

import type { NextConfig } from "next";

// GitHub Codespaces (Test am Handy): App läuft hinter https://<name>-3000.app.github.dev
const codespaces = "*.app.github.dev";

export default {
  allowedDevOrigins: [codespaces],
  // bodySizeLimit: bis zu 5 Fotos à 10 MB (der Browser verkleinert sie normalerweise vorher auf ~300 KB)
  experimental: { serverActions: { allowedOrigins: [codespaces], bodySizeLimit: "55mb" } },
} satisfies NextConfig;

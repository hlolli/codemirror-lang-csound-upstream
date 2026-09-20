import { build } from "esbuild"

const shared = {
  entryPoints: ["src/index.ts", "src/opcodes-rich.ts"],
  bundle: true,
  packages: "external",
  // Keep help data separate while letting consumer bundlers follow the import.
  external: ["./opcodes-rich.js"],
  platform: "neutral",
  sourcemap: true,
  logLevel: "info",
  outdir: "dist",
}

await Promise.all([
  build({
    ...shared,
    format: "esm",
  }),
  build({
    ...shared,
    format: "cjs",
    outExtension: { ".js": ".cjs" },
  }),
])

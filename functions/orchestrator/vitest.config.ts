import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname),
  test: {
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});

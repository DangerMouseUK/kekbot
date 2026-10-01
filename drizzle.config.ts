import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/storage/schema.ts",
  out: "./drizzle"
});

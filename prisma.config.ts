import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // `prisma generate` (run on every install/build) doesn't connect to the database, so a
    // placeholder is fine when DATABASE_URL isn't available at build time. Migrations need the real URL.
    url: process.env.DATABASE_URL ?? "mysql://build:build@localhost:3306/build",
  },
});

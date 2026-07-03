/**
 * Idempotent migration runner (BUILD.md §7 — owner never pastes SQL).
 *
 * Usage (from the repo root):
 *   npx tsx --env-file=.env scripts/migrate.ts
 *
 * - Connects to Postgres over DATABASE_URL (Supabase session pooler; SSL
 *   required, hence rejectUnauthorized: false).
 * - Records applied migrations in schema_migrations(name primary key).
 * - Applies each migrations/*.sql not yet recorded, in filename order, each
 *   inside its own transaction (rollback on error).
 * - 001_init.sql is itself fully idempotent, so re-running is always safe.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "pg";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "ERROR: DATABASE_URL is not set.\n" +
        "Run from the repo root with: npx tsx --env-file=.env scripts/migrate.ts",
    );
    process.exit(1);
  }

  // Run from the repo root (as documented above); fail loudly otherwise.
  const migrationsDir = path.resolve(process.cwd(), "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error(
      `ERROR: migrations directory not found at ${migrationsDir}.\n` +
        "Run this script from the repository root.",
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No .sql files found in migrations/ — nothing to do.");
    return;
  }

  const client = new Client({
    connectionString: databaseUrl,
    // Supabase pooler requires SSL; its cert chain is not in the default store.
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(
      `create table if not exists schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    const { rows } = await client.query<{ name: string }>(
      "select name from schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.name));

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skipped  ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into schema_migrations (name) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log(`applied  ${file}`);
        appliedCount++;
      } catch (err) {
        await client.query("rollback").catch(() => {
          /* connection may be unusable; the original error is what matters */
        });
        const message = err instanceof Error ? err.message : String(err);
        console.error(`FAILED   ${file} (rolled back): ${message}`);
        process.exitCode = 1;
        return;
      }
    }

    console.log(
      `Done. ${appliedCount} applied, ${files.length - appliedCount} skipped.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Migration runner failed: ${message}`);
  process.exit(1);
});

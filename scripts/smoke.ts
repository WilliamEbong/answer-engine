/**
 * End-to-end pipeline smoke test (no server, no DB).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/smoke.ts "your question"
 *
 * Relies on --env-file for .env loading (dotenv is intentionally not used).
 */
import { runPipeline } from "../lib/pipeline";

const DEFAULT_QUESTION = "What is the capital of France?";

async function main() {
  const question = process.argv[2]?.trim() || DEFAULT_QUESTION;

  console.log(`question:     ${question}`);

  const run = await runPipeline({ question, history: [] });

  console.log(`searchQuery:  ${run.searchQuery}`);
  console.log(`sources (${run.sources.length}):`);
  for (const s of run.sources) {
    console.log(`  [${s.position}] ${s.title ?? "(untitled)"} — ${s.url}`);
  }

  console.log("\n--- answer ---\n");
  for await (const chunk of run.stream.textStream) {
    process.stdout.write(chunk);
  }
  process.stdout.write("\n");

  const [usage, finishReason] = await Promise.all([
    run.stream.usage,
    run.stream.finishReason,
  ]);
  console.log("\n--- finish ---");
  console.log(`finishReason: ${finishReason}`);
  console.log(`usage:        ${JSON.stringify(usage)}`);
}

main().catch((err) => {
  console.error("\nsmoke test failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

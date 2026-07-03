import { z } from "zod";

/**
 * FROZEN CONTRACT (BUILD.md §12 Phase 0).
 * Zod-validated environment, fail-fast at boot with readable errors (§2).
 * Server-only — never import from client components.
 */

const providerEnum = z.enum([
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "openai-compatible",
]);

const envSchema = z
  .object({
    LLM_PROVIDER: providerEnum.default("anthropic"),
    LLM_MODEL: z.string().min(1, "LLM_MODEL is required"),
    LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required (dummy value allowed for local openai-compatible endpoints)"),
    LLM_BASE_URL: z
      .url()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    TAVILY_API_KEY: z.string().min(1, "TAVILY_API_KEY is required"),
    SUPABASE_URL: z.url({ error: "SUPABASE_URL must be a URL" }),
    SUPABASE_SERVICE_ROLE_KEY: z
      .string()
      .min(1, "SUPABASE_SERVICE_ROLE_KEY is required")
      .refine(
        (k) => !k.startsWith("sb_publishable_"),
        "SUPABASE_SERVICE_ROLE_KEY is a publishable key — paste the service-role secret (sb_secret_...) from Supabase Dashboard → Project Settings → API keys",
      ),
    DATABASE_URL: z
      .string()
      .startsWith("postgres", "DATABASE_URL must be a postgres:// connection string (Supabase session pooler)"),
    ACCESS_PASSWORD: z.string().min(8, "ACCESS_PASSWORD must be at least 8 characters"),
    COOKIE_SECRET: z.string().min(32, "COOKIE_SECRET must be at least 32 characters"),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === "openai-compatible" && !env.LLM_BASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["LLM_BASE_URL"],
        message: "LLM_BASE_URL is required when LLM_PROVIDER=openai-compatible",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parse and cache env. Throws a readable, aggregated error on first use if invalid. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".") || "(env)"}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}

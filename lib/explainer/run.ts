import { generateText } from "ai";
import { z } from "zod";
import { getModel, getModelId, type ModelTier } from "../llm";
import type { StageCallResult, StageUsage } from "./types";

/**
 * FROZEN CONTRACT (EXPLAINER-BUILD.md §10 Phase 0) — only the main agent may
 * amend this file. callStage() is the ONLY LLM touchpoint of lib/explainer/.
 *
 * NEVER set temperature / topP / topK (claude-sonnet-5 rejects non-default
 * sampling params with HTTP 400). Size maxOutputTokens generously — truncated
 * JSON is the dominant structured-output failure mode (§9.2).
 *
 * Structured output strategy (pre-authorized §9.2): plain text completion →
 * extractJson → zod safeParse → on failure ONE retry with the validation
 * error appended → still failing → StageError (orchestrator persists status
 * 'error'; the wave is resumable).
 */

export class StageError extends Error {
  constructor(
    public readonly stage: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StageError";
  }
}

export interface CallStageOptions<S extends z.ZodType> {
  /** Usage label, e.g. "compile" | "write:beginner" | "qaB:advanced". */
  stage: string;
  tier: ModelTier;
  system: string;
  prompt: string;
  schema: S;
  maxOutputTokens: number;
}

/**
 * Strip markdown fences / stray prose around a JSON object and parse it.
 * Throws on unparseable input (caller handles the retry).
 */
export function extractJson(text: string): unknown {
  let t = text.trim();
  // ```json ... ``` or ``` ... ``` fences
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    // Models sometimes prepend/append prose — slice first '{' to last '}'.
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object found in output");
    const sliced = t.slice(start, end + 1);
    try {
      return JSON.parse(sliced);
    } catch {
      // Last resort: models emitting long markdown bodies (esp. QA-A corrected
      // drafts) occasionally leave raw newlines/tabs inside string values,
      // which is invalid JSON. Escape control characters that appear INSIDE
      // strings (quote-state aware) and retry once.
      return JSON.parse(escapeControlCharsInStrings(sliced));
    }
  }
}

/**
 * Walk the text tracking JSON string state (respecting backslash escapes) and
 * escape raw control characters (newline, carriage return, tab) that appear
 * inside string literals. Control characters between tokens (pretty-printing
 * whitespace) are left untouched.
 */
function escapeControlCharsInStrings(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Validated-JSON LLM call with one schema-error retry and usage capture.
 * Test hook (G5): EXPLAINER_FAIL_STAGE=<stage> forces an immediate StageError.
 * Reads process.env directly — getEnv() is cached and the gates script toggles
 * the flag at runtime in-process.
 */
export async function callStage<S extends z.ZodType>(
  opts: CallStageOptions<S>,
): Promise<StageCallResult<z.infer<S>>> {
  if (process.env.EXPLAINER_FAIL_STAGE === opts.stage) {
    throw new StageError(opts.stage, `forced failure (EXPLAINER_FAIL_STAGE=${opts.stage})`);
  }

  const started = Date.now();
  const model = getModel(opts.tier);
  let inputTokens = 0;
  let outputTokens = 0;
  let retried = false;

  const attempt = async (prompt: string): Promise<string> => {
    const result = await generateText({
      model,
      system: opts.system,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: opts.maxOutputTokens,
    });
    inputTokens += result.usage?.inputTokens ?? 0;
    outputTokens += result.usage?.outputTokens ?? 0;
    return result.text;
  };

  const validate = (text: string): { ok: true; data: z.infer<S> } | { ok: false; error: string } => {
    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (err) {
      return { ok: false, error: `JSON parse failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    const result = opts.schema.safeParse(parsed);
    if (!result.success) return { ok: false, error: z.prettifyError(result.error) };
    return { ok: true, data: result.data };
  };

  try {
    const first = validate(await attempt(opts.prompt));
    let data: z.infer<S>;
    if (first.ok) {
      data = first.data;
    } else {
      retried = true;
      // JSON parse failures are almost always unescaped quotes/newlines inside
      // a long string value — give the model the specific fix, not just the error.
      const jsonHint = first.error.startsWith("JSON parse failed")
        ? " The failure is unescaped characters inside a string value: escape every double-quote as \\\" and every line break as \\n, or rewrite prose quotation marks as single/typographic quotes."
        : "";
      const retryPrompt = `${opts.prompt}\n\nYour previous output failed validation:\n${first.error}${jsonHint}\nOutput ONLY the corrected JSON object. No prose, no code fences.`;
      const second = validate(await attempt(retryPrompt));
      if (!second.ok) {
        throw new StageError(opts.stage, `output failed validation after retry: ${second.error}`);
      }
      data = second.data;
    }

    const usage: StageUsage = {
      stage: opts.stage,
      model: getModelId(opts.tier),
      inputTokens,
      outputTokens,
      retried,
      ms: Date.now() - started,
    };
    return { data, usage };
  } catch (err) {
    if (err instanceof StageError) throw err;
    throw new StageError(
      opts.stage,
      `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

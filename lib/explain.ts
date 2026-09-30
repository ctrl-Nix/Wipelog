import type { WipeRun } from "./types";

export type Explanation = { source: "ai" | "template"; text: string };

const PROVIDERS = ["gemini", "anthropic", "openai"];

export function aiEnabled(): boolean {
  return (
    !!process.env.AI_API_KEY &&
    !!process.env.AI_MODEL &&
    PROVIDERS.includes(process.env.AI_PROVIDER || "")
  );
}

export function templateExplanation(run: WipeRun): string {
  const fails = run.checks.filter((c) => c.status === "fail");
  const reviews = run.checks.filter((c) => c.status === "review");
  const parts: string[] = [];
  if (run.simulated) parts.push("This is simulated demo evidence, not a real wipe.");
  if (run.verification_status === "Pass") {
    parts.push(
      "All checks passed: the submitted evidence is complete and internally consistent. This does not prove that a disk was physically erased."
    );
  } else if (run.verification_status === "Fail") {
    parts.push("Failed because: " + fails.map((c) => c.message).join(" "));
    if (reviews.length) parts.push("Also needs attention: " + reviews.map((c) => c.message).join(" "));
  } else {
    parts.push("Needs review because: " + reviews.map((c) => c.message).join(" "));
  }
  return parts.join(" ");
}

const SYSTEM =
  "Summarize the supplied verification checks only. Do not infer a real wipe, do not change the outcome, " +
  "do not claim compliance. Identify missing or contradictory evidence. If the run is simulated, state that " +
  "explicitly. Plain text, at most 120 words.";

async function callModel(userText: string): Promise<string> {
  const provider = process.env.AI_PROVIDER!;
  const key = process.env.AI_API_KEY!;
  const model = process.env.AI_MODEL!;
  const signal = AbortSignal.timeout(8000);

  if (provider === "gemini") {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: userText }] }],
        }),
      }
    );
    if (!r.ok) throw new Error("gemini " + r.status);
    const d = await r.json();
    return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  if (provider === "anthropic") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 400, system: SYSTEM, messages: [{ role: "user", content: userText }] }),
    });
    if (!r.ok) throw new Error("anthropic " + r.status);
    const d = await r.json();
    return d?.content?.[0]?.text ?? "";
  }

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userText },
      ],
    }),
  });
  if (!r.ok) throw new Error("openai " + r.status);
  const d = await r.json();
  return d?.choices?.[0]?.message?.content ?? "";
}

export async function explainRun(run: WipeRun): Promise<Explanation> {
  const fallback: Explanation = { source: "template", text: templateExplanation(run) };
  if (!aiEnabled()) return fallback;
  try {
    // Only sanitized fields: no serial number, no asset tag, no raw evidence.
    const payload = {
      outcome: run.verification_status,
      simulated: run.simulated,
      method: run.method,
      checks: run.checks.map((c) => ({ check: c.label, status: c.status, detail: c.message })),
    };
    const text = (await callModel(JSON.stringify(payload))).trim().slice(0, 1200);
    if (!text) return fallback;
    return { source: "ai", text };
  } catch {
    return fallback;
  }
}
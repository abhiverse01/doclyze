/**
 * AI Insights API route — `/api/insights`
 *
 * Accepts an already-extracted DoclyzeExtractionResult JSON (never raw file
 * bytes — keeps the LLM payload small and reliable) and returns model-generated
 * deeper insights grounded in the provided data only.
 *
 * Uses the z-ai-web-dev-sdk — the free-tier LLM provider available in this
 * environment. The integration is provider-agnostic: swapping to Groq, Gemini,
 * or Hugging Face later is a one-file change to the `generateDeepInsights`
 * implementation below.
 *
 * If the SDK is not configured (no API key in env), the route returns a
 * 503 with a clear "not configured" status — never a mocked/fake response.
 */

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import type { DoclyzeExtractionResult, Insight } from "@/lib/extraction/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AIInsightResponse {
  insights: Array<{
    title: string;
    body: string;
    category: string;
    severity: "info" | "notice" | "warning";
  }>;
}

/**
 * Provider-agnostic interface — see EXTENDING.md for how to swap providers.
 * Any future implementation (Groq, Gemini, HF) just needs to satisfy this shape.
 */
export interface DeepInsightProvider {
  generate(extraction: DoclyzeExtractionResult): Promise<AIInsightResponse>;
}

/**
 * Build the prompt sent to the LLM. Includes the full structured extraction JSON,
 * the document type, and explicit grounding instructions.
 */
function buildPrompt(extraction: DoclyzeExtractionResult): { system: string; user: string } {
  const system = `You are Doclyze's deep-insight engine. You receive a structured extraction payload
that has already been produced by deterministic parsers. Your job is to surface
non-obvious patterns, synthesize narrative observations, and suggest concrete
next actions — grounded STRICTLY in the provided data.

Hard rules:
- Do NOT invent facts about the document. If the data doesn't support a claim, don't make it.
- For resumes: suggest concrete improvements (e.g. "Quantify the bullet under Role X — it currently has no metric").
- For invoices: flag unusual line items, suggest reconciliation follow-ups.
- For contracts: highlight clauses that warrant legal review and explain why.
- For research papers: note structural / citation issues.
- For general documents: synthesize the most important entities and their relationships.
- Always return insights as JSON: { "insights": [{ "title": string, "body": string, "category": string, "severity": "info"|"notice"|"warning" }] }
- Produce 3-8 insights. Keep titles under 80 chars. Keep body under 400 chars.
- Severity: "info" = neutral observation, "notice" = worth attention, "warning" = needs action.
- Return ONLY the JSON, no prose.`;

  // Trim the extraction to keep the prompt small — strip rawText and pages
  // (the LLM doesn't need them; structured fields are enough).
  const { rawText, pages, ...structured } = extraction;
  const user = `Document type: ${extraction.detectedType}
Filename: ${extraction.filename}
Completeness score: ${extraction.completenessScore}/100
OCR used: ${extraction.ocrUsed}

Structured extraction JSON:
${JSON.stringify(structured, null, 2)}

Return 3-8 insights as JSON.`;

  return { system, user };
}

/**
 * Parse the model's response into the strict AIInsightResponse shape.
 * Tries JSON.parse first; falls back to extracting a JSON block from the text.
 */
function parseInsights(raw: string): AIInsightResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try to extract a JSON block
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model response was not valid JSON");
    parsed = JSON.parse(match[0]);
  }
  const obj = parsed as { insights?: unknown };
  if (!obj || !Array.isArray(obj.insights)) {
    throw new Error("Model response missing 'insights' array");
  }
  return {
    insights: obj.insights.map((i: Record<string, unknown>) => ({
      title: String(i.title ?? "").slice(0, 120),
      body: String(i.body ?? "").slice(0, 600),
      category: String(i.category ?? "AI Insight").slice(0, 60),
      severity: (["info", "notice", "warning"].includes(String(i.severity))
        ? String(i.severity)
        : "info") as "info" | "notice" | "warning",
    })),
  };
}

/** Concrete provider implementation using z-ai-web-dev-sdk (free-tier). */
const zaiProvider: DeepInsightProvider = {
  async generate(extraction: DoclyzeExtractionResult): Promise<AIInsightResponse> {
    const { system, user } = buildPrompt(extraction);
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Constrain output to JSON
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1500,
    });
    const content = completion.choices?.[0]?.message?.content ?? "";
    return parseInsights(content);
  },
};

export async function POST(req: NextRequest) {
  let body: DoclyzeExtractionResult;
  try {
    body = (await req.json()) as DoclyzeExtractionResult;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || !body.documentId || !body.typed) {
    return NextResponse.json(
      { error: "Body must be a DoclyzeExtractionResult with documentId and typed fields" },
      { status: 400 }
    );
  }

  try {
    const result = await zaiProvider.generate(body);
    // Convert to the Insight shape used by the UI
    const insights: Insight[] = result.insights.map((i, idx) => ({
      id: `ai-${idx}-${Date.now()}`,
      title: i.title,
      body: i.body,
      category: i.category,
      severity: i.severity,
      aiGenerated: true,
    }));
    return NextResponse.json({ insights });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Distinguish "not configured" from "real error"
    if (/api key|unauthorized|401|not configured/i.test(message)) {
      return NextResponse.json(
        {
          error: "AI insights not configured",
          detail:
            "The AI insight provider has no valid API key. Set the required environment variable (see .env.example) and restart the server.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "AI insight generation failed", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/insights",
    method: "POST",
    description:
      "Send a DoclyzeExtractionResult JSON, receive AI-generated deeper insights.",
    provider: "z-ai-web-dev-sdk (free-tier)",
  });
}

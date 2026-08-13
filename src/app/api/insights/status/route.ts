/**
 * AI Insights status route — `/api/insights/status`
 *
 * Lightweight check used by the Settings panel to show whether the
 * AI insight provider is configured (has a valid API key in env).
 *
 * This does NOT trigger an actual model call — it just checks if the SDK
 * can be constructed. The actual call happens via POST /api/insights.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Dynamic import — if the SDK isn't installed, this throws.
    const ZAIModule = await import("z-ai-web-dev-sdk");
    const ZAI = ZAIModule.default;
    // ZAI.create() reads the API key from env. If absent, it throws.
    await ZAI.create();
    return NextResponse.json({
      configured: true,
      provider: "z-ai-web-dev-sdk",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const notConfigured =
      /api key|unauthorized|401|not configured|missing/i.test(message);
    return NextResponse.json(
      {
        configured: false,
        provider: "z-ai-web-dev-sdk",
        reason: notConfigured ? "NO_API_KEY" : "SDK_ERROR",
        detail: notConfigured ? undefined : message,
      },
      { status: notConfigured ? 200 : 500 }
    );
  }
}

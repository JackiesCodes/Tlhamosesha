import { NextResponse } from "next/server";
import { z } from "zod";
import { mergeProviders, runProviders } from "@/lib/ai/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const Body = z.object({ image: z.string().startsWith("data:image/").max(12_000_000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { image: <data URL> }" }, { status: 400 });
  const providers = await runProviders(parsed.data.image);
  const { merged, primary } = mergeProviders(providers);
  return NextResponse.json({
    providers: providers.map((p) => ({ provider: p.provider, label: p.label, status: p.status, durationMs: p.durationMs, error: p.error })),
    merged,
    primary,
  });
}

import { NextResponse } from "next/server";
import { providerStatus } from "@/lib/ai/providers";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  let database: "connected" | "unconfigured" | "error" = db ? "connected" : "unconfigured";
  if (db)
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      database = "error";
    }
  return NextResponse.json({
    ok: true,
    providers: providerStatus(),
    database,
    engines: [
      { id: "local", label: "On-device CV", enabled: true },
      { id: "ocr", label: "Tesseract OCR (WASM)", enabled: true },
    ],
  });
}

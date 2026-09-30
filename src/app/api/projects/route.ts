// Server persistence for project analyses (PostgreSQL via Prisma).
// The browser keeps a full local copy in IndexedDB; this endpoint stores the
// structured analysis + reconstruction so teams can query and share it.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getDemoUser } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  if (!db) return NextResponse.json({ database: "unconfigured", projects: [] });
  const user = await getDemoUser();
  const projects = await db.project.findMany({
    where: { ownerId: user!.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, designType: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ database: "connected", projects });
}

const Sync = z.object({
  id: z.string(),
  name: z.string(),
  analysis: z.any(),
  scene: z.any(),
});

const KIND: Record<string, string> = {
  person: "PERSON", face: "PERSON", product: "PRODUCT", vehicle: "VEHICLE", building: "BUILDING",
  object: "OBJECT", logo: "LOGO", icon: "ICON",
};

export async function POST(req: Request) {
  const db = await getDb();
  if (!db) return NextResponse.json({ database: "unconfigured" }, { status: 202 });
  const parsed = Sync.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { id, name, analysis, scene } = parsed.data;
  const user = await getDemoUser();

  // Strip heavy image payloads — binary assets belong in object storage.
  const light = JSON.parse(
    JSON.stringify({ analysis, scene }, (k, v) =>
      typeof v === "string" && v.startsWith("data:") ? `[inline:${Math.round(v.length / 1024)}KB]` : v,
    ),
  );

  await db.$transaction(async (tx) => {
    await tx.project.upsert({
      where: { id },
      update: { name, designType: light.analysis.metadata.designType.label },
      create: { id, name, ownerId: user!.id, designType: light.analysis.metadata.designType.label },
    });
    await tx.asset.deleteMany({ where: { projectId: id } });
    await tx.color.deleteMany({ where: { projectId: id } });
    await tx.font.deleteMany({ where: { projectId: id } });
    await tx.layer.deleteMany({ where: { projectId: id } });
    await tx.asset.createMany({
      data: light.analysis.objects.map((o: { kind: string; label: string; confidence: number; box: { x: number; y: number; width: number; height: number } }) => ({
        projectId: id, kind: KIND[o.kind] ?? "OBJECT", label: o.label, confidence: o.confidence,
        x: o.box.x, y: o.box.y, width: o.box.width, height: o.box.height, transparent: true,
      })),
    });
    await tx.color.createMany({
      data: light.analysis.palette.map((c: { hex: string; role: string; weight: number; name: string }) => ({
        projectId: id, hex: c.hex, role: c.role, weight: c.weight, name: c.name,
      })),
    });
    await tx.font.createMany({
      data: light.analysis.texts.map((t: { role: string; confidence: number; font: { family: string; weight: number; sizePx: number } }) => ({
        projectId: id, family: t.font.family, weight: t.font.weight, sizePx: t.font.sizePx, usage: t.role, confidence: t.confidence,
      })),
    });
    await tx.layer.createMany({
      data: light.scene.layers.map((l: { type: string; name: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; visible: boolean; locked: boolean }, i: number) => ({
        projectId: id, type: l.type === "background" ? "BACKGROUND" : l.type === "text" ? "TEXT" : l.type === "shape" ? "SHAPE" : "IMAGE",
        name: l.name, x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, opacity: l.opacity,
        zIndex: i, visible: l.visible, locked: l.locked, props: l,
      })),
    });
    const last = await tx.reconstruction.findFirst({ where: { projectId: id }, orderBy: { version: "desc" } });
    await tx.reconstruction.create({ data: { projectId: id, version: (last?.version ?? 0) + 1, scene: light.scene } });
    await tx.analysisResult.create({
      data: {
        projectId: id, status: "COMPLETE",
        engines: light.analysis.engines.map((e: { id: string }) => e.id),
        designType: light.analysis.metadata.designType.label,
        confidence: light.analysis.metadata.designType.confidence,
        dnaScores: light.analysis.dna, raw: light.analysis,
      },
    });
  });
  return NextResponse.json({ database: "connected", ok: true });
}

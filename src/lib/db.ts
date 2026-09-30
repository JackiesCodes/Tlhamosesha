// Optional Prisma client. The app runs fully client-side when DATABASE_URL is unset.
import "server-only";
import type { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __prisma?: PrismaClient | null };

export async function getDb(): Promise<PrismaClient | null> {
  if (!process.env.DATABASE_URL) return null;
  if (g.__prisma !== undefined) return g.__prisma;
  try {
    const { PrismaClient } = await import("@prisma/client");
    g.__prisma = new PrismaClient();
  } catch {
    g.__prisma = null;
  }
  return g.__prisma;
}

export async function getDemoUser() {
  const db = await getDb();
  if (!db) return null;
  return db.user.upsert({
    where: { email: "studio@tlhamosesha.ai" },
    update: {},
    create: { email: "studio@tlhamosesha.ai", name: "Studio Owner", plan: "PRO" },
  });
}

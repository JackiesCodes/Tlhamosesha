import Link from "next/link";
import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-ink px-6 text-center">
      <LogoMark className="h-10 w-10" />
      <div>
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">This page doesn&apos;t exist</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">The link may be old or mistyped. Your projects are still safe in this browser.</p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/home">Open Decon</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Home page</Link>
        </Button>
      </div>
    </main>
  );
}

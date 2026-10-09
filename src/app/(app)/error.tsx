"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Catches rendering errors inside the app so one broken view doesn't blank the page.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-24 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
      <h1 className="font-display text-xl font-bold text-white">Something went wrong on this screen</h1>
      <p className="text-sm text-muted-foreground">
        Your saved projects are not affected. Try again, and if it keeps happening, go back to your projects.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/projects">Your projects</Link>
        </Button>
      </div>
    </div>
  );
}

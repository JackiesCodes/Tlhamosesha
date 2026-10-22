import type { Metadata } from "next";

// Experiments that aren't linked from the app yet.
export const metadata: Metadata = { title: "Labs", robots: { index: false, follow: false } };

export default function LabsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Workspace } from "@/components/workspace/workspace";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <Workspace id={id} />
    </Suspense>
  );
}

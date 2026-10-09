import { BRAND } from "@/lib/brand";

// Shared typography for long-form legal text (no typography plugin needed).
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const updated = new Date(BRAND.legalUpdated + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6 [&_a]:text-brand [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-1.5 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_strong]:text-white [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-muted-foreground">
      <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
      <p className="!mt-2 text-sm">Last updated {updated}</p>
      {children}
      <h2>Contact</h2>
      {BRAND.contactEmail ? (
        <p>
          Questions about this page: <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
        </p>
      ) : (
        <p>A contact address for questions about this page will be listed here.</p>
      )}
    </article>
  );
}

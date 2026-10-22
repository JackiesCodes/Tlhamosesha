import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `The terms that apply when you use ${BRAND.name}.`,
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <p>
        These terms apply when you use {BRAND.name}, operated by {BRAND.operator}. By using {BRAND.name} you agree to them. If you don&apos;t
        agree, please don&apos;t use the service.
      </p>

      <h2>What {BRAND.name} does</h2>
      <p>
        {BRAND.name} analyses images and videos you provide and produces a breakdown — text, images, background layers, colours, layout and, for
        videos, scenes and timing — and an editable reconstruction you can export. The analysis is automated and runs in your browser.
      </p>

      <h2>Your content and your rights to it</h2>
      <ul>
        <li>
          <strong>Only use images and videos you have the right to use.</strong> That means material you created, own, or have permission to
          analyse and modify.
        </li>
        <li>
          Breaking a design down does not give you any rights to its artwork, photographs, logos, trademarks or fonts. Reusing someone else&apos;s
          material without permission may infringe their copyright or trademark rights, and you are responsible for how you use the results.
        </li>
        <li>You keep all rights to your own content. We claim no ownership of anything you analyse or create with {BRAND.name}.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>You agree not to use {BRAND.name} to:</p>
      <ul>
        <li>infringe anyone&apos;s intellectual-property, privacy or other rights, including passing off another brand&apos;s materials as your own;</li>
        <li>create counterfeit, fraudulent or deceptive materials;</li>
        <li>process unlawful, abusive or sexually exploitative content; or</li>
        <li>attack, overload, scrape or attempt to disrupt the service or its infrastructure.</li>
      </ul>

      <h2>Results are estimates</h2>
      <p>
        Detected text, fonts, colours, objects, labels, scores and reconstructions are automated estimates and can be wrong or incomplete. Check
        them before you rely on them, publish them or send them to print.
      </p>

      <h2>Your data and backups</h2>
      <p>
        Projects are stored only in your browser on your device. They can be lost if you clear your browsing data, use a private window, or your
        browser frees up space. We cannot recover them. Use the export and backup tools in Settings to keep copies of anything important.
      </p>

      <h2>Third-party names</h2>
      <p>
        Photoshop, Figma, Canva and other product names mentioned in {BRAND.name} belong to their respective owners. Export formats named after
        them are our own layer formats modelled on those products&apos; structures; {BRAND.name} is not affiliated with or endorsed by them.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We may change, suspend or discontinue features at any time. We may update these terms; the date above shows when they last changed, and
        continuing to use {BRAND.name} after a change means you accept the updated terms.
      </p>

      <h2>No warranty</h2>
      <p>
        {BRAND.name} is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, to the extent the law allows,
        including warranties of accuracy, fitness for a particular purpose and non-infringement.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, {BRAND.operator} is not liable for indirect or consequential losses, lost data, or lost profits arising from
        your use of {BRAND.name}. Nothing in these terms limits rights you have under consumer-protection law that cannot be excluded.
      </p>
    </LegalPage>
  );
}

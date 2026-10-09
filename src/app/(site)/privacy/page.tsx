import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/site/legal-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${BRAND.name} handles your images and data.`,
};

// Describes the app as built: in-browser processing, browser-only storage,
// no accounts, analytics or advertising. Update it before adding accounts,
// server storage, analytics or cloud processing that is on by default.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This policy explains what happens to your information when you use {BRAND.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), operated by{" "}
        {BRAND.operator}. The short version: <strong>the designs you analyse stay on your device.</strong>
      </p>

      <h2>Your images and projects</h2>
      <ul>
        <li>When you add an image, {BRAND.name} analyses it inside your web browser. The image is not uploaded to our servers.</li>
        <li>
          Your projects — the original image, the extracted assets, the analysis and your edits — are saved in your browser&apos;s storage on
          your device. We cannot see, access or recover them.
        </li>
        <li>
          You can delete them at any time from <Link href="/settings#data">Settings → Your data → Delete all data</Link>, or by clearing this
          site&apos;s data in your browser.
        </li>
      </ul>

      <h2>Optional cloud processing</h2>
      <p>
        If we offer an optional cloud vision feature, it is off by default and appears in Settings with the name of the provider. Only if you
        switch it on, a reduced-size copy of each image you analyse is sent to that provider to improve the results, and is then handled under
        that provider&apos;s own privacy terms. You can switch it off at any time.
      </p>

      <h2>Information our servers receive</h2>
      <p>
        Like any website, our hosting provider receives the technical details your browser sends when it loads pages — such as your IP address,
        browser type and the pages requested. These are used to deliver the site, keep it secure and diagnose problems, and are kept only as long
        as the hosting provider&apos;s logs retain them. We do not create accounts, and we do not use analytics, advertising or tracking cookies.
      </p>

      <h2>Fonts</h2>
      <p>
        The interface and the font previews load typefaces from Google Fonts. When they load, your browser connects to Google, which receives
        your IP address. Google&apos;s use of this information is covered by Google&apos;s privacy policy.
      </p>

      <h2>What we store in your browser</h2>
      <p>
        Besides your projects, the browser keeps your settings (such as theme and processing options), your export history and in-app
        notifications. This information is used only to make the app work for you and never leaves your device.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, data-protection laws (for example the Protection of Personal Information Act in South Africa or the GDPR in
        Europe) give you rights to access, correct or delete personal information and to object to its processing. Because we do not hold your
        projects or an account for you, you can exercise most of these rights directly in the app. For anything else, contact us below.
      </p>

      <h2>Children</h2>
      <p>{BRAND.name} is not directed at children under 13, and we do not knowingly collect information from them.</p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how {BRAND.name} handles information — for example by adding accounts or online storage — we will update this page and the
        date above before the change takes effect.
      </p>
    </LegalPage>
  );
}

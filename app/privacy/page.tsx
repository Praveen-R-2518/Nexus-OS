import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Nexus OS",
  description:
    "How Nexus OS accesses, uses, stores, and deletes your Google account and Gmail data.",
};

const LAST_UPDATED = "June 18, 2026";

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-1 flex-col px-5 py-12 md:px-8 md:py-16">
      <header className="border-b border-[color:var(--apple-hairline)] pb-12">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[#6e6e73]">
          Legal
        </p>
        <h1 className="landing-section-headline mt-3 max-w-3xl text-[#1d1d1f]">
          Privacy Policy
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-[1.55] text-[#6e6e73]">
          This policy explains what data Nexus OS collects, how we use it, and
          your choices. It covers our handling of Google account data accessed
          through Gmail.
        </p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-[#86868b]">
          Last updated {LAST_UPDATED}
        </p>
      </header>

      <article className="max-w-3xl space-y-10 py-12 text-[15px] leading-relaxed text-[#6e6e73]">
        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            1. Overview
          </h2>
          <p>
            Nexus OS is an AI inbox and revenue command center that helps teams
            triage email, detect purchase and churn signals, and draft replies.
            To do this, you may choose to connect your Google account so that
            Nexus OS can read messages from your Gmail inbox on your behalf.
          </p>
          <p>
            We only access your data after you explicitly grant permission
            through Google&rsquo;s OAuth consent screen, and you can revoke that
            access at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            2. Google account data we access
          </h2>
          <p>
            When you connect Gmail, Nexus OS requests the following Google API
            scopes:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                gmail.readonly
              </code>{" "}
              &mdash; read-only access to your Gmail messages and metadata so we
              can triage incoming email, classify intent, and draft replies. We
              never send, modify, or delete email on your behalf with this
              scope.
            </li>
            <li>
              <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs">
                userinfo.email
              </code>{" "}
              &mdash; your account email address, used to identify the connected
              mailbox and route data to the correct workspace.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            3. How we use your data
          </h2>
          <p>We use the Gmail data described above solely to:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>Display and triage your inbox inside Nexus OS.</li>
            <li>
              Detect revenue and churn signals and generate suggested draft
              replies.
            </li>
            <li>Route messages to the correct workspace and team.</li>
          </ul>
          <p>
            We do not sell your data, use it for advertising, or share it with
            third parties for their own purposes. Google user data is not used
            to train generalized AI/ML models.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            4. How we store and protect your data
          </h2>
          <p>
            OAuth access and refresh tokens are encrypted at rest using
            AES-256 before they are written to our database, and they are only
            decrypted server-side when needed to call the Gmail API on your
            behalf. Access is scoped to your workspace and protected by
            row-level security so that only your team can reach your data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            5. Data retention and deletion
          </h2>
          <p>
            We retain connected-mailbox data only for as long as your Gmail
            connection is active. You can disconnect Gmail at any time from
            within Nexus OS, which deletes the stored credentials and tokens for
            that mailbox. You may also revoke access directly from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nexus-growth underline-offset-4 hover:underline"
            >
              Google Account permissions
            </a>{" "}
            page. Deleting your Nexus OS account removes all associated stored
            Google data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            6. Limited Use disclosure
          </h2>
          <p>
            Nexus OS&rsquo;s use and transfer of information received from Google
            APIs adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-nexus-growth underline-offset-4 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            7. Contact
          </h2>
          <p>
            If you have questions about this policy or want to request deletion
            of your data, contact us at{" "}
            <a
              href="mailto:support@nexus-os.app"
              className="text-nexus-growth underline-offset-4 hover:underline"
            >
              support@nexus-os.app
            </a>
            .
          </p>
        </section>
      </article>
    </div>
  );
}

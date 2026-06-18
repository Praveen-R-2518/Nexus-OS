import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service · Nexus OS",
  description:
    "The terms governing your use of Nexus OS, including the Gmail integration.",
};

const LAST_UPDATED = "June 18, 2026";

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="hairline-b pb-12 pt-4">
        <p className="nexus-meta text-nexus-growth dark:text-nexus-growth">
          Legal
        </p>
        <h1 className="mt-3 max-w-3xl nexus-page-title text-atmospheric-grey">
          Terms of Service
        </h1>
        <p className="mt-5 max-w-2xl nexus-body text-muted">
          These terms govern your access to and use of Nexus OS. By creating an
          account or connecting a service, you agree to them.
        </p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-widest text-muted">
          Last updated {LAST_UPDATED}
        </p>
      </header>

      <article className="max-w-3xl space-y-10 py-12 text-sm leading-relaxed text-muted dark:text-slate-300">
        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            1. Acceptance of terms
          </h2>
          <p>
            By accessing or using Nexus OS (the &ldquo;Service&rdquo;), you agree
            to be bound by these Terms of Service. If you do not agree, do not
            use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            2. The Service
          </h2>
          <p>
            Nexus OS is an AI inbox and revenue command center that helps teams
            triage email, detect revenue and churn signals, and draft replies.
            Features may change over time as we improve the product.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            3. Your account
          </h2>
          <p>
            You are responsible for maintaining the confidentiality of your
            account credentials and for all activity under your account. You
            agree to provide accurate information and to keep it up to date.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            4. Google and Gmail integration
          </h2>
          <p>
            When you connect your Google account, you authorize Nexus OS to
            access your Gmail data with read-only permissions in order to
            provide the Service. Our handling of that data is described in our{" "}
            <Link
              href="/privacy"
              className="text-nexus-growth underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            . You may disconnect Gmail or revoke access at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            5. Acceptable use
          </h2>
          <p>
            You agree not to misuse the Service, including by attempting to
            access it through unauthorized means, interfering with its
            operation, or using it to violate any applicable law or the rights
            of others.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            6. Disclaimers and limitation of liability
          </h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of
            any kind. To the maximum extent permitted by law, Nexus OS is not
            liable for any indirect, incidental, or consequential damages
            arising from your use of the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            7. Changes to these terms
          </h2>
          <p>
            We may update these terms from time to time. Material changes will
            be reflected by updating the &ldquo;Last updated&rdquo; date above.
            Continued use of the Service after changes constitutes acceptance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="nexus-section-title text-atmospheric-grey">
            8. Contact
          </h2>
          <p>
            Questions about these terms can be sent to{" "}
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

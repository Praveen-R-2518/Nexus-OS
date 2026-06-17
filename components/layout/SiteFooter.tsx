import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--apple-hairline)] bg-apple-bg-alt text-apple-text-secondary">
      <div className="mx-auto flex max-w-[1024px] flex-col items-start justify-between gap-10 px-4 py-12 md:flex-row md:items-start md:px-8">
        <div className="space-y-2 text-xs">
          <p className="text-sm font-semibold text-apple-text">Nexus OS</p>
          <p className="tabular-nums">
            Copyright © {new Date().getFullYear()} Nexus OS. All rights reserved.
          </p>
          <p>Developed by Knurdz 3.0</p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-xs sm:grid-cols-3">
          <Link href="/docs" className="transition-opacity hover:text-apple-text hover:opacity-80">
            Docs
          </Link>
          <Link href="/customers" className="transition-opacity hover:text-apple-text hover:opacity-80">
            Customers
          </Link>
          <Link href="/resources" className="transition-opacity hover:text-apple-text hover:opacity-80">
            Resources
          </Link>
          <Link href="/pricing" className="transition-opacity hover:text-apple-text hover:opacity-80">
            Pricing
          </Link>
          <Link href="#" className="transition-opacity hover:text-apple-text hover:opacity-80">
            Terms
          </Link>
          <Link href="/login" className="transition-opacity hover:text-apple-text hover:opacity-80">
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}

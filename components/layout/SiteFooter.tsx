import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-[color:var(--apple-hairline)] bg-[#f5f5f7] text-[#6e6e73]">
      <div className="mx-auto flex max-w-[1024px] flex-col items-start justify-between gap-10 px-4 py-12 md:flex-row md:items-start md:px-8">
        <div className="space-y-2 text-xs">
          <p className="text-sm font-semibold text-[#1d1d1f]">
            <span className="logo-nexus">Nexus</span>
            <span className="logo-os"> OS</span>
          </p>
          <p className="tabular-nums">
            Copyright © {new Date().getFullYear()} Nexus OS. All rights reserved.
          </p>
          <p>Developed by Knurdz 3.0</p>
        </div>
        <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-[13px] sm:grid-cols-3">
          {[
            ["/docs", "Docs"],
            ["/customers", "Customers"],
            ["/resources", "Resources"],
            ["/pricing", "Pricing"],
            ["/privacy", "Privacy"],
            ["/terms", "Terms"],
            ["/login", "Support"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="landing-link transition-colors hover:text-[#1d1d1f]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

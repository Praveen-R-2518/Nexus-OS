import type { ReactNode } from "react";
import { PeopleSubnav } from "@/components/people/PeopleSubnav";

export default function PeopleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PeopleSubnav />
      {children}
    </div>
  );
}

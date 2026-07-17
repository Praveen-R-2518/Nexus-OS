import { Suspense } from "react";
import { SettingsView } from "@/components/settings/SettingsView";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}

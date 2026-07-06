import { Window } from "@/components/os/window";

import { SettingsTabs } from "./tabs";

/** One window, five panes — the settings routes keep their own guards and
 * colocated server actions; this layout only provides the shared chrome. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Window title="Settings" size="lg">
      <SettingsTabs />
      <div className="pt-6">{children}</div>
    </Window>
  );
}

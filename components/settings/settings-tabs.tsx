"use client";

import { useState, type ReactNode } from "react";

import {
  SETTINGS_TABS,
  isSettingsTabKey,
  type SettingsTabKey,
} from "@/components/settings/settings-tabs-config";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Client tab shell for the Settings page, driven entirely by the
 * `SETTINGS_TABS` config array (see `settings-tabs-config.ts`) — same shadcn
 * `Tabs` primitives the Master Library manager already uses for its category
 * tabs, so the pattern stays consistent app-wide.
 *
 * The active tab is plain local state seeded from the server-read `?tab=`
 * param, and switching tabs rewrites that param via `history.replaceState` — a
 * shallow URL update the App Router supports natively — so tabs are linkable
 * and survive a refresh WITHOUT a server round-trip per switch (all tab
 * content is already in the page). Content arrives as pre-rendered server
 * slots keyed by tab, so this component stays a pure shell with no data
 * concerns.
 */
export function SettingsTabs({
  initialTab,
  content,
}: {
  initialTab: SettingsTabKey;
  content: Record<SettingsTabKey, ReactNode>;
}) {
  const [tab, setTab] = useState<SettingsTabKey>(initialTab);

  function handleChange(value: string) {
    if (!isSettingsTabKey(value)) return;
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={handleChange} className="gap-6">
      <TabsList>
        {SETTINGS_TABS.map(({ key, label, icon: Icon }) => (
          <TabsTrigger key={key} value={key} className="px-3">
            <Icon />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SETTINGS_TABS.map(({ key }) => (
        <TabsContent key={key} value={key} className="space-y-6">
          {content[key]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

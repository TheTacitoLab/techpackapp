import {
  CreditCard,
  LayoutTemplate,
  Library,
  MapPin,
  Palette,
  SwatchBook,
  Tag,
  type LucideIcon,
} from "lucide-react";

/**
 * The Settings tab config — ONE array drives the tab bar's triggers and the
 * page's content slots, so adding a future tab (Grading profiles, PDF/Export
 * preferences…) is an entry here + a content component, never a structural
 * change. Lives outside the client tab shell so the SERVER page can validate
 * the `?tab=` param with `isSettingsTabKey` (client-module exports can't be
 * called from the server).
 */
export const SETTINGS_TABS = [
  { key: "brands", label: "Brands", icon: Palette },
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "labels", label: "Labels", icon: Tag },
  { key: "colours", label: "Colours", icon: SwatchBook },
  { key: "markers", label: "Marker Colours", icon: MapPin },
  { key: "library", label: "Master Library", icon: Library },
  { key: "workspace", label: "Workspace", icon: CreditCard },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

export function isSettingsTabKey(value: string): value is SettingsTabKey {
  return SETTINGS_TABS.some((t) => t.key === value);
}

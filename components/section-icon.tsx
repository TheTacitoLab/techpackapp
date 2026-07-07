import {
  ClipboardList,
  Component,
  Images,
  Layers,
  ListTree,
  Paperclip,
  Ruler,
  Table2,
  Tag,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a section_templates.icon string (stored in the DB) to a Lucide
 * component via a fixed allowlist — keeps sections data-driven without
 * dynamically importing the whole icon set. Unknown names fall back.
 */
const ICONS: Record<string, LucideIcon> = {
  ClipboardList,
  Images,
  Layers,
  Tag,
  ListTree,
  Table2,
  Paperclip,
  Ruler,
};

export function SectionIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? Component;
  return <Icon className={className} />;
}

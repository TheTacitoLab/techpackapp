import {
  BookMarked,
  Component,
  Hammer,
  ListTree,
  PenTool,
  Ruler,
  Tag,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps a section_templates.icon string (stored in the DB) to a Lucide
 * component via a fixed allowlist — keeps sections data-driven without
 * dynamically importing the whole icon set. Unknown names fall back.
 */
const ICONS: Record<string, LucideIcon> = {
  Tag,
  PenTool,
  ListTree,
  Ruler,
  Hammer,
  BookMarked,
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

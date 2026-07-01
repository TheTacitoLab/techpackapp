"use client";

import * as React from "react";
import { Check, ChevronDown, Circle } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useUiStore } from "@/stores/ui-store";
import type { SectionStatus } from "@/types";

function StatusIndicator({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <span className="bg-brand text-brand-foreground flex size-5 items-center justify-center rounded-full">
        <Check className="size-3" />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="border-input flex size-5 items-center justify-center rounded-full border">
        <span className="bg-brand size-2 rounded-full" />
      </span>
    );
  }
  return (
    <span className="border-input flex size-5 items-center justify-center rounded-full border">
      <Circle className="size-2 text-transparent" />
    </span>
  );
}

/**
 * The core "progression through the tech pack" component: a collapsible section
 * with a completion indicator (tick / dot / empty), icon, title, and an
 * animated chevron. Open/closed state is remembered per section_key.
 */
export function CollapsibleSection({
  sectionKey,
  title,
  icon,
  status,
  defaultOpen = false,
  children,
}: {
  sectionKey: string;
  title: string;
  icon: React.ReactNode;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const storedOpen = useUiStore((state) => state.openSections[sectionKey]);
  const setSectionOpen = useUiStore((state) => state.setSectionOpen);

  // Render the SSR/first-paint value (defaultOpen), then adopt the persisted
  // value after hydration. useSyncExternalStore returns the server snapshot
  // first, avoiding a hydration mismatch without setState-in-effect.
  const hydrated = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const open = hydrated ? (storedOpen ?? defaultOpen) : defaultOpen;

  return (
    <Collapsible
      id={`section-${sectionKey}`}
      open={open}
      onOpenChange={(next) => setSectionOpen(sectionKey, next)}
      className="bg-card shadow-card overflow-hidden rounded-xl"
    >
      <CollapsibleTrigger className="group hover:bg-accent/50 focus-visible:ring-ring flex h-14 w-full items-center gap-3 px-5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset">
        <StatusIndicator status={status} />
        <span className="text-muted-foreground flex size-5 items-center justify-center [&_svg]:size-4">
          {icon}
        </span>
        <span className="flex-1 text-base font-semibold">{title}</span>
        <ChevronDown className="text-muted-foreground size-4 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
        <div className="border-border border-t px-5 py-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

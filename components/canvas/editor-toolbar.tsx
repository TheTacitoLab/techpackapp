"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One toolbar entry: an icon action (tooltip + aria-label share `label`) or a
 * read-only value (the zoom percentage). Adding a future button is a config
 * entry, never JSX surgery — the toolbar renders whatever it's given and
 * overflows what doesn't fit into a ⋯ menu.
 */
export type EditorToolbarItem =
  | {
      kind: "action";
      key: string;
      icon: LucideIcon;
      /** Tooltip text AND the button's aria-label. */
      label: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Render at all — defaults to true. */
      visible?: boolean;
      /** Keyboard hint shown dimmed in the tooltip / menu (e.g. "Esc"). */
      shortcut?: string;
      /** Meant to be pressed repeatedly (zoom steps): when overflowed into
       *  the ⋯ menu, selecting it keeps the menu open for the next press. */
      repeatable?: boolean;
    }
  | {
      kind: "readout";
      key: string;
      /** Accessible name for the value. */
      label: string;
      /** The value shown, e.g. "125%". Keep width-stable (tabular). */
      text: string;
      visible?: boolean;
    };

export type EditorToolbarGroup = {
  key: string;
  items: EditorToolbarItem[];
  /** Pinned groups render after the ⋯ and never collapse into it — for
   *  actions that must stay reachable (exit fullscreen). */
  pinned?: boolean;
};

/** Fallback for the row gap when computed style is unreadable — matches
 *  `gap-1` at the default 16px root. The real value is read from the measure
 *  row's computed columnGap so a non-default root font-size can't skew the
 *  reservation maths. */
const ROW_GAP_FALLBACK = 4;

type FlatItem = { item: EditorToolbarItem; group: string };

function flatten(groups: EditorToolbarGroup[], pinned: boolean): FlatItem[] {
  return groups
    .filter((g) => (g.pinned ?? false) === pinned)
    .flatMap((g) =>
      g.items
        .filter((item) => item.visible !== false)
        .map((item) => ({ item, group: g.key })),
    );
}

/**
 * The fullscreen editor's action toolbar: grouped icon buttons (hover/focus
 * tooltips, subtle dividers between groups) driven entirely by a config array.
 *
 * Overflow-safe by measurement, not guesswork: an `inert`, invisible copy of
 * the full toolbar renders alongside the real one; a ResizeObserver compares
 * its item offsets against the space the flex row actually received and shows
 * the first N items that fit — the rest move into a ⋯ menu (grouped, with the
 * same labels/shortcuts) instead of wrapping or clipping. Pinned groups sit
 * after the ⋯ and never collapse.
 *
 * The outer div GROWS (`flex-1`): the measurement's frame of reference must be
 * the space the header can offer, not the width of whatever is currently
 * rendered — a shrink-to-content outer would ratchet (once collapsed, its own
 * narrow width is all it ever measures against, and widening the window
 * could never bring items back out of the ⋯).
 */
export function EditorToolbar({
  groups,
  className,
}: {
  groups: EditorToolbarGroup[];
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const managed = flatten(groups, false);
  const pinned = flatten(groups, true);

  // How many managed items are visible inline. Starts fully visible; the
  // layout effect corrects it before paint on the client.
  const [visibleCount, setVisibleCount] = useState(managed.length);

  // Anything that can change an item's rendered width (or the set of items)
  // re-measures; ResizeObserver covers width changes of the container itself.
  const signature = [
    ...managed.map(
      (f) =>
        `${f.group}/${f.item.key}:${f.item.kind === "readout" ? f.item.text : ""}`,
    ),
    "|",
    ...pinned.map((f) => `${f.group}/${f.item.key}`),
  ].join(",");

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const measure = measureRef.current;
    if (!outer || !measure) return;

    const compute = () => {
      const available = outer.clientWidth;
      const itemEls = Array.from(
        measure.querySelectorAll<HTMLElement>('[data-measure="item"]'),
      );
      const moreEl = measure.querySelector<HTMLElement>(
        '[data-measure="more"]',
      );
      const pinnedEl = measure.querySelector<HTMLElement>(
        '[data-measure="pinned"]',
      );
      // offsetLeft is relative to the (positioned) measure row, so an item's
      // right edge already includes every separator and gap before it.
      const rightEdge = (el: HTMLElement) => el.offsetLeft + el.offsetWidth;
      // The real rendered gap (gap-1 is rem-derived, so px varies with the
      // root font-size) — reserved once before the ⋯ and once before pinned.
      const rowGap =
        Number.parseFloat(getComputedStyle(measure).columnGap) ||
        ROW_GAP_FALLBACK;
      const pinnedWidth = pinnedEl ? pinnedEl.offsetWidth + rowGap : 0;
      const moreWidth = (moreEl?.offsetWidth ?? 0) + rowGap;
      const total =
        itemEls.length > 0 ? rightEdge(itemEls[itemEls.length - 1]) : 0;

      let next = itemEls.length;
      if (total + pinnedWidth > available) {
        next = 0;
        for (let i = 0; i < itemEls.length; i += 1) {
          if (rightEdge(itemEls[i]) + moreWidth + pinnedWidth <= available) {
            next = i + 1;
          } else {
            break;
          }
        }
      }
      setVisibleCount((current) => (current === next ? current : next));
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(outer);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [signature]);

  const visible = managed.slice(0, visibleCount);
  const overflowed = managed.slice(visibleCount);

  // Re-group the overflowed tail so the ⋯ menu keeps the same group dividers.
  const overflowGroups: { key: string; items: EditorToolbarItem[] }[] = [];
  for (const f of overflowed) {
    const last = overflowGroups[overflowGroups.length - 1];
    if (last && last.key === f.group) last.items.push(f.item);
    else overflowGroups.push({ key: f.group, items: [f.item] });
  }

  return (
    <div
      ref={outerRef}
      className={cn(
        "relative flex min-w-0 flex-1 items-center justify-end overflow-hidden",
        className,
      )}
    >
      {/* Invisible, inert measurement copy of the FULL toolbar — same
          classes, same structure, so offsets are exact. */}
      <div
        ref={measureRef}
        inert
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-1"
      >
        {managed.map((f, i) => (
          <Fragment key={`${f.group}/${f.item.key}`}>
            {i > 0 && managed[i - 1].group !== f.group && <GroupDivider />}
            <span data-measure="item" className="flex">
              <ToolbarItemView item={f.item} plain />
            </span>
          </Fragment>
        ))}
        <span data-measure="more" className="flex">
          <button type="button" tabIndex={-1} className={ICON_BUTTON_CLASS}>
            <MoreHorizontal className="size-4" />
          </button>
        </span>
        {pinned.length > 0 && (
          <span data-measure="pinned" className="flex items-center gap-1">
            <GroupDivider />
            {pinned.map((f) => (
              <ToolbarItemView
                key={`${f.group}/${f.item.key}`}
                item={f.item}
                plain
              />
            ))}
          </span>
        )}
      </div>

      {/* The real toolbar. */}
      <div className="flex items-center gap-1">
        {visible.map((f, i) => (
          <Fragment key={`${f.group}/${f.item.key}`}>
            {i > 0 && visible[i - 1].group !== f.group && <GroupDivider />}
            <ToolbarItemView item={f.item} />
          </Fragment>
        ))}

        {overflowed.length > 0 && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More actions"
                    className={ICON_BUTTON_CLASS}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">More actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {overflowGroups.map((g, gi) => (
                <Fragment key={`${g.key}-${gi}`}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  {g.items.map((item) =>
                    item.kind === "action" ? (
                      <DropdownMenuItem
                        key={item.key}
                        disabled={item.disabled}
                        onSelect={(event) => {
                          // Repeatable actions (zoom steps) keep the menu
                          // open so each press doesn't cost a reopen.
                          if (item.repeatable) event.preventDefault();
                          item.onSelect();
                        }}
                      >
                        <item.icon className="size-4" />
                        {item.label}
                        {item.shortcut && (
                          <DropdownMenuShortcut>
                            {item.shortcut}
                          </DropdownMenuShortcut>
                        )}
                      </DropdownMenuItem>
                    ) : (
                      // A label, not a disabled item — disabled items leave
                      // keyboard navigation, which would make the value
                      // unreachable to AT while overflowed.
                      <DropdownMenuLabel
                        key={item.key}
                        className="text-muted-foreground font-normal"
                      >
                        {item.label}: {item.text}
                      </DropdownMenuLabel>
                    ),
                  )}
                </Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {pinned.length > 0 && (
          <>
            <GroupDivider />
            {pinned.map((f) => (
              <ToolbarItemView key={`${f.group}/${f.item.key}`} item={f.item} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Pieces -------------------------------------------------------------------

const ICON_BUTTON_CLASS =
  "text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 flex size-7 shrink-0 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2 disabled:opacity-50";

function GroupDivider() {
  return <div aria-hidden="true" className="bg-border mx-1 h-5 w-px shrink-0" />;
}

/**
 * One rendered item. `plain` (measurement copy) skips the tooltip so the
 * hidden row stays cheap and portal-free; sizes are identical either way.
 */
function ToolbarItemView({
  item,
  plain = false,
}: {
  item: EditorToolbarItem;
  plain?: boolean;
}) {
  if (item.kind === "readout") {
    return (
      <span
        title={item.label}
        className="text-muted-foreground w-10 shrink-0 text-center text-xs font-medium tabular-nums"
      >
        {/* aria-label is unreliable on a generic span — a hidden text node
            gives AT "Zoom level: 125%" via name-from-content instead. */}
        <span className="sr-only">{item.label}: </span>
        {item.text}
      </span>
    );
  }

  const button = (
    <button
      type="button"
      aria-label={item.label}
      disabled={item.disabled}
      tabIndex={plain ? -1 : undefined}
      onClick={plain ? undefined : item.onSelect}
      className={ICON_BUTTON_CLASS}
    >
      <item.icon className="size-4" />
    </button>
  );

  if (plain) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">
        {item.label}
        {item.shortcut && (
          <kbd className="bg-background/20 ml-1.5 rounded px-1 font-sans">
            {item.shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

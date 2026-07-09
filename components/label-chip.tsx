import { cn } from "@/lib/utils";

/**
 * The one label chip — colour dot + truncated name — shared by product
 * cards, collection cards and both label pickers so the chip look can never
 * drift between surfaces.
 */
export function LabelChip({
  name,
  color,
  nameClassName,
}: {
  name: string;
  color: string;
  /** Override the name's max-width (dense header rows use a tighter one). */
  nameClassName?: string;
}) {
  return (
    <span className="bg-muted text-foreground inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className={cn("max-w-[8rem] truncate", nameClassName)}>{name}</span>
    </span>
  );
}

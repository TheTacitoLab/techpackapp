import type * as React from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The standard rounded container for a tech-pack section: header (icon + title
 * + optional status/action) over a body. Presentational — Server Component.
 */
export function SectionCard({
  title,
  icon,
  status,
  headerAction,
  className,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  status?: React.ReactNode;
  headerAction?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <div className="flex items-center gap-2 text-base font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
          {icon}
          <span>{title}</span>
        </div>
        {(status || headerAction) && (
          <div className="flex items-center gap-2">
            {status}
            {headerAction}
          </div>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </Card>
  );
}

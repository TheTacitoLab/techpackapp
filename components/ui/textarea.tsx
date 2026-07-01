import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-muted placeholder:text-muted-foreground/70 focus-visible:bg-card focus-visible:border-foreground/20 focus-visible:ring-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive flex field-sizing-content min-h-20 w-full rounded-md border px-3 py-2 text-sm transition-[color,box-shadow,background-color] outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

import { Shirt } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <Shirt className="size-5" />
        </span>
        <span className="text-xl font-semibold tracking-tight">GarSpec</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

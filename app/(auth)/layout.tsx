export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/garspec-lockup.png"
        alt="GarSpec"
        className="mb-8 h-8 w-auto"
      />
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

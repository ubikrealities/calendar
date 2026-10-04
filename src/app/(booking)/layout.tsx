export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="booking-theme min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_100%,rgba(10,120,255,0.28),transparent_70%),radial-gradient(ellipse_50%_35%_at_50%_0%,rgba(10,120,255,0.10),transparent_70%)]" />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

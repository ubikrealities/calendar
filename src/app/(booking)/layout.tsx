import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandHeader, BrandFooter } from "@/components/booking/brand-chrome";

export const metadata: Metadata = {
  title: "Book a call · OuiGrowth",
  description: "Book a call with OuiGrowth, the PPC alt-agency.",
};

export default function BookingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="booking-theme min-h-screen relative overflow-hidden flex flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_100%,rgba(5,153,255,0.26),transparent_70%),radial-gradient(ellipse_50%_35%_at_50%_0%,rgba(5,153,255,0.10),transparent_70%)]" />
      <div className="relative z-10 flex flex-1 flex-col">
        <Suspense>
          <BrandHeader />
        </Suspense>
        <div className="flex-1">{children}</div>
        <Suspense>
          <BrandFooter />
        </Suspense>
      </div>
    </div>
  );
}

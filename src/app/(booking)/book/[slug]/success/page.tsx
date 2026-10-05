"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

interface BookingInfo {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
  cancellationToken: string;
  amountPaid: number | null;
}

function SuccessPageInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  // Poll for the booking to appear — webhook may take a few seconds
  useEffect(() => {
    if (!sessionId) {
      setError("Missing session ID");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 15; i++) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/bookings/by-session/${sessionId}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.booking) {
              setBooking(data.booking);
              setLoading(false);
              return;
            }
          }
        } catch {
          // ignore
        }
        setAttempts(i + 1);
        await new Promise((r) => setTimeout(r, 2000));
      }
      setError("Payment recorded but booking is taking longer than expected. Check your email.");
      setLoading(false);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-4">
      <Card className="max-w-md w-full rounded-2xl bg-card/80 backdrop-blur-md ring-white/10 shadow-2xl shadow-black/60">
        {loading ? (
          <CardContent className="text-center py-12 space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
            <p className="font-medium">Processing your payment...</p>
            <p className="text-sm text-muted-foreground">
              This usually takes a few seconds. {attempts > 0 && `(${attempts}/15)`}
            </p>
          </CardContent>
        ) : error ? (
          <CardContent className="text-center py-12 space-y-3">
            <div className="w-16 h-16 rounded-full bg-yellow-400/15 flex items-center justify-center mx-auto">
              <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 className="font-semibold">Hang tight</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        ) : booking ? (
          <>
            <CardHeader className="border-b ">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-extrabold">Payment confirmed</h2>
                  <p className="text-sm text-muted-foreground">{booking.title}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                <p className="font-semibold">
                  {format(parseISO(booking.startTime), "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(parseISO(booking.startTime), "h:mm a")} –{" "}
                  {format(parseISO(booking.endTime), "h:mm a")}
                </p>
                {booking.location && (
                  <p className="text-sm text-muted-foreground">
                    Location: {booking.location}
                  </p>
                )}
                {booking.amountPaid && (
                  <Badge className="bg-primary/15 text-primary border-0">
                    Paid {(booking.amountPaid / 100).toFixed(2)} USD
                  </Badge>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <a
                  href={`/api/bookings/${booking.id}/ics`}
                  download
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border rounded-md hover:bg-accent transition-colors"
                >
                  Add to calendar
                </a>
                <a
                  href={`/cancel/${booking.cancellationToken}`}
                  className="text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Need to cancel? Click here
                </a>
              </div>
              <p className="text-xs text-muted-foreground text-center pt-2">
                A confirmation email is on its way.
              </p>
            </CardContent>
          </>
        ) : null}
      </Card>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div />}>
      <SuccessPageInner />
    </Suspense>
  );
}

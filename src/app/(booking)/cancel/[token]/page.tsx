"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";

interface Booking {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  location: string | null;
  notes: string | null;
}

interface EventType {
  name: string;
  color: string;
  duration: number;
  locationType: string | null;
}

export default function CancelPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [eventType, setEventType] = useState<EventType | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    fetch(`/api/bookings/cancel/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json();
          throw new Error(e.error || "Not found");
        }
        return r.json();
      })
      .then((data: { booking: Booking; eventType: EventType | null }) => {
        setBooking(data.booking);
        setEventType(data.eventType);
        if (data.booking.status === "cancelled") setCancelled(true);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this meeting?")) return;
    setCancelling(true);
    const res = await fetch(`/api/bookings/cancel/${token}`, { method: "POST" });
    if (res.ok) {
      setCancelled(true);
      if (booking) setBooking({ ...booking, status: "cancelled" });
    } else {
      const e = await res.json();
      setError(e.error || "Failed to cancel");
    }
    setCancelling(false);
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-4">
      <Card className="max-w-md w-full rounded-2xl bg-card/80 backdrop-blur-md ring-white/10 shadow-2xl shadow-black/60">
        {loading ? (
          <CardContent className="text-center py-12 text-muted-foreground">
            Loading...
          </CardContent>
        ) : error && !booking ? (
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="font-semibold">Can't find that booking</p>
            <p className="text-sm text-muted-foreground mt-2">{error}</p>
          </CardContent>
        ) : cancelled ? (
          <CardContent className="text-center py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-extrabold">Cancelled</h2>
            {booking && (
              <p className="text-muted-foreground">
                {eventType?.name || booking.title}
                <br />
                {format(parseISO(booking.startTime), "EEEE, MMMM d 'at' h:mm a")}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              You can close this page.
            </p>
          </CardContent>
        ) : booking ? (
          <>
            <CardHeader className="border-b ">
              <div className="flex items-center gap-3">
                <div
                  className="w-2 h-10 rounded-full"
                  style={{ backgroundColor: eventType?.color || "#8b5cf6" }}
                />
                <div>
                  <h2 className="text-xl font-extrabold">
                    Cancel meeting
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {eventType?.name || booking.title}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
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
                {eventType && (
                  <div className="flex gap-2 pt-2">
                    <Badge variant="secondary">{eventType.duration} min</Badge>
                    {eventType.locationType && (
                      <Badge variant="outline">
                        {eventType.locationType.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Cancelling will free up this time for someone else to book and
                notify the host by email.
              </p>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1"
                >
                  {cancelling ? "Cancelling..." : "Cancel Meeting"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.close()}
                  className="flex-1"
                >
                  Keep it
                </Button>
              </div>
            </CardContent>
          </>
        ) : null}
      </Card>
    </div>
  );
}

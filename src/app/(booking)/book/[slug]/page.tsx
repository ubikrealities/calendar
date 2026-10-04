"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isBefore, startOfDay, parseISO, addMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface EventTypeInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration: number;
  location: string | null;
  locationType: string | null;
  color: string;
  price: number | null;
  currency: string | null;
  priceLabel: string | null;
}

interface TimeSlot {
  start: string;
  end: string;
  startLocal: string;
}

type Step = "calendar" | "time" | "form" | "confirmed";

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "true";
  const [eventType, setEventType] = useState<EventTypeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    booking: { id: string; title: string; startTime: string; endTime: string; location: string | null };
    cancellationToken: string;
  } | null>(null);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Load event type info
  useEffect(() => {
    fetch(`/api/event-types/by-slug/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setEventType)
      .catch(() => setError("Event type not found"))
      .finally(() => setLoading(false));
  }, [slug]);

  // Load slots when date selected
  useEffect(() => {
    if (!selectedDate) return;
    setSlotsLoading(true);
    setStep("time");
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    fetch(`/api/availability/slots/${slug}/${dateStr}?tz=${tz}`)
      .then((r) => r.json())
      .then((data) => {
        setSlots(data.slots || []);
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, slug, tz]);

  // Embed height sync
  useEffect(() => {
    if (isEmbed && window.parent !== window) {
      const sync = () => {
        window.parent.postMessage(
          { type: "calendario-resize", height: document.body.scrollHeight },
          "*"
        );
      };
      sync();
      const observer = new MutationObserver(sync);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true });
      return () => observer.disconnect();
    }
  }, [isEmbed, step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !eventType) return;
    setSubmitting(true);

    try {
      const payload = {
        eventTypeSlug: slug,
        startTime: selectedSlot.start,
        timezone: tz,
        ...formData,
      };

      // Paid event → redirect to Stripe Checkout
      if (eventType.price && eventType.price > 0) {
        const res = await fetch("/api/checkout/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json();
          alert(err.error || "Payment setup failed");
          return;
        }
        const { url } = await res.json();
        if (url) {
          window.location.href = url;
          return;
        }
        alert("Could not redirect to payment");
        return;
      }

      // Free event → create booking directly
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Booking failed");
        return;
      }

      const result = await res.json();
      setBookingResult(result);
      setStep("confirmed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-primary animate-spin" />
      </div>
    );
  }

  if (error || !eventType) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-12">
            <p className="text-lg font-medium">Event not found</p>
            <p className="text-muted-foreground mt-1">This booking link may be invalid or inactive.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calendar rendering
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const today = startOfDay(new Date());

  return (
    <div className={`flex items-center justify-center ${isEmbed ? "p-4" : "min-h-screen p-4"}`}>
      <Card className="max-w-2xl w-full rounded-2xl bg-card/80 backdrop-blur-md ring-white/10 shadow-2xl shadow-black/60">
        {/* Header */}
        <CardHeader className="border-b border-border px-6 pt-2">
          <div className="flex items-center gap-3">
            <div
              className="w-2 h-10 rounded-full"
              style={{ backgroundColor: eventType.color }}
            />
            <div>
              <CardTitle className="text-2xl font-medium tracking-tight">{eventType.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="border-white/15 text-muted-foreground font-normal">{eventType.duration} min</Badge>
                {eventType.locationType && (
                  <Badge variant="outline" className="border-white/15 text-muted-foreground font-normal capitalize">{eventType.locationType.replace("_", " ")}</Badge>
                )}
                {eventType.price && eventType.price > 0 && (
                  <Badge className="bg-primary/15 text-primary border-0">
                    {eventType.priceLabel ||
                      `${(eventType.price / 100).toFixed(2)} ${(eventType.currency || "usd").toUpperCase()}`}
                  </Badge>
                )}
              </div>
              {eventType.description && (
                <p className="text-sm text-muted-foreground mt-2">{eventType.description}</p>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {step === "confirmed" && bookingResult ? (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/15 ring-1 ring-primary/40 flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h2 className="text-3xl font-medium">You&apos;re <span className="serif-accent text-4xl">booked.</span></h2>
              <p className="text-muted-foreground">
                {format(parseISO(bookingResult.booking.startTime), "EEEE, MMMM d, yyyy")}
                <br />
                {format(parseISO(bookingResult.booking.startTime), "h:mm a")} -{" "}
                {format(parseISO(bookingResult.booking.endTime), "h:mm a")}
              </p>
              {bookingResult.booking.location && (
                <p className="text-sm text-muted-foreground">
                  Location: {bookingResult.booking.location}
                </p>
              )}
              <div className="flex items-center justify-center gap-2 pt-2">
                <a
                  href={`/api/bookings/${bookingResult.booking.id}/ics`}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-white/15 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Add to calendar
                </a>
                <a
                  href={`/cancel/${bookingResult.cancellationToken}`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </a>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                A confirmation email has been sent with the calendar invite attached.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Calendar */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                  >
                    &lt;
                  </Button>
                  <h3 className="font-medium">
                    {format(currentMonth, "MMMM yyyy")}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  >
                    &gt;
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div key={d} className="text-xs font-medium text-muted-foreground py-2">
                      {d}
                    </div>
                  ))}
                  {Array.from({ length: startPad }).map((_, i) => (
                    <div key={`pad-${i}`} />
                  ))}
                  {calendarDays.map((day) => {
                    const isPast = isBefore(day, today);
                    const isSelected = selectedDate && isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, today);
                    return (
                      <button
                        key={day.toISOString()}
                        disabled={isPast}
                        onClick={() => setSelectedDate(day)}
                        className={`
                          aspect-square rounded-lg text-sm font-medium transition-colors
                          ${isPast ? "text-muted-foreground/30 cursor-not-allowed" : isSelected ? "cursor-pointer" : "hover:bg-white/5 cursor-pointer"}
                          ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary shadow-[0_0_24px_rgba(10,155,255,0.45)]" : ""}
                          ${isToday && !isSelected ? "ring-1 ring-inset ring-primary/70" : ""}
                        `}
                      >
                        {format(day, "d")}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {new Intl.DateTimeFormat(undefined, { timeZoneName: "long", timeZone: tz })
                    .formatToParts(new Date())
                    .find((p) => p.type === "timeZoneName")?.value ?? tz}
                </p>
              </div>

              {/* Right panel: time slots or form */}
              <div>
                {step === "calendar" && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
                    <p className="text-2xl font-medium">Pick a <span className="serif-accent text-3xl">day.</span></p>
                    <p className="text-muted-foreground text-sm">Available times will show up here.</p>
                  </div>
                )}

                {step === "time" && (
                  <div>
                    <h3 className="font-medium mb-3">
                      {selectedDate && format(selectedDate, "EEEE, MMMM d")}
                    </h3>
                    {slotsLoading ? (
                      <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No available times for this date.</p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto">
                        {slots.map((slot) => (
                          <button
                            key={slot.start}
                            onClick={() => {
                              setSelectedSlot(slot);
                              setStep("form");
                            }}
                            className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/[0.02] hover:border-primary hover:bg-primary/10 transition-colors"
                          >
                            <span className="font-medium">
                              {new Date(`2000-01-01T${slot.startLocal}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3"
                      onClick={() => {
                        setStep("calendar");
                        setSelectedDate(null);
                      }}
                    >
                      &lt; Back
                    </Button>
                  </div>
                )}

                {step === "form" && selectedSlot && (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <h3 className="font-medium">
                      {selectedDate && format(selectedDate, "EEE, MMM d")} at{" "}
                      {new Date(`2000-01-01T${selectedSlot.startLocal}:00`).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </h3>
                    <div className="space-y-2">
                      <Label htmlFor="name">Name *</Label>
                      <Input
                        id="name"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Additional Notes</Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={submitting} className="flex-1 h-10 rounded-lg font-medium hover:bg-[#2aa8ff] shadow-[0_0_24px_rgba(10,155,255,0.35)]">
                        {submitting
                          ? (eventType.price && eventType.price > 0
                              ? "Redirecting to payment..."
                              : "Booking...")
                          : (eventType.price && eventType.price > 0
                              ? `Pay ${(eventType.price / 100).toFixed(2)} ${(eventType.currency || "usd").toUpperCase()} & Book`
                              : "Confirm Booking")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-lg border-white/15 bg-transparent hover:bg-white/5"
                        onClick={() => setStep("time")}
                      >
                        Back
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

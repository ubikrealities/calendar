import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { bookings, contacts, eventTypes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getStripe } from "@/lib/stripe";
import { createCalendarEvent } from "@/lib/google-calendar";
import { sendBookingConfirmation } from "@/lib/booking-emails";
import {
  scheduleWorkflowsForBooking,
  executeWorkflows,
} from "@/lib/workflows";
import type Stripe from "stripe";
import { withConsent } from "@/lib/consent";

// Stripe webhook — creates the booking after successful payment.
// Required env vars:
//   STRIPE_SECRET_KEY      — for getStripe()
//   STRIPE_WEBHOOK_SECRET  — to verify the signature
export async function POST(request: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not set" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Stripe Webhook] Signature verification failed:", msg);
    return NextResponse.json({ error: `Invalid signature: ${msg}` }, { status: 400 });
  }

  // We only care about completed checkout sessions
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata ?? {};
  // Consent was required at checkout creation; older sessions predate it.
  const bookingNotes = meta.consentAt ? withConsent(meta.notes, meta.consentAt) : meta.notes || null;

  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, unpaid: true });
  }

  // Idempotency — check if booking already exists for this session
  const existing = await db
    .select()
    .from(bookings)
    .where(eq(bookings.stripeSessionId, session.id))
    .get();
  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Load event type
  const eventType = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.slug, meta.eventTypeSlug || ""))
    .get();
  if (!eventType) {
    console.error("[Stripe Webhook] Event type not found:", meta.eventTypeSlug);
    return NextResponse.json({ received: true, error: "Event type gone" });
  }

  // Upsert contact
  let contact = await db
    .select()
    .from(contacts)
    .where(eq(contacts.email, meta.email))
    .get();

  if (!contact) {
    const contactId = uuid();
    await db
      .insert(contacts)
      .values({
        id: contactId,
        email: meta.email,
        name: meta.name,
        phone: meta.phone || null,
        company: meta.company || null,
        totalBookings: 1,
        lastBookedAt: new Date().toISOString(),
      })
      .run();
    contact = (await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .get())!;
  } else {
    await db
      .update(contacts)
      .set({
        name: meta.name || contact.name,
        phone: meta.phone || contact.phone,
        company: meta.company || contact.company,
        totalBookings: (contact.totalBookings ?? 0) + 1,
        lastBookedAt: new Date().toISOString(),
      })
      .where(eq(contacts.id, contact.id))
      .run();
  }

  // Create Google Calendar event (+ auto-generate Meet link for google_meet events)
  const title = `${meta.name} - ${eventType.name}`;
  const wantMeet = eventType.locationType === "google_meet";
  let icalEventId: string | null = null;
  let meetUrl: string | null = null;
  try {
    const result = await createCalendarEvent({
      title,
      startDate: meta.startTime,
      endDate: meta.endTime,
      location: wantMeet ? undefined : eventType.location || undefined,
      notes: `Paid booking via Calendar.io\nAmount: ${(session.amount_total ?? 0) / 100} ${session.currency?.toUpperCase()}\nEmail: ${meta.email}${bookingNotes ? `\nNotes: ${bookingNotes}` : ""}`,
      attendeeEmail: meta.email,
      createMeet: wantMeet,
    });
    icalEventId = result.eventId;
    meetUrl = result.meetUrl;
  } catch (error) {
    console.error("[Stripe Webhook] iCal sync failed:", error);
  }

  const finalLocation = meetUrl || eventType.location || null;

  // Create booking
  const bookingId = uuid();
  const cancellationToken = uuid();
  await db
    .insert(bookings)
    .values({
      id: bookingId,
      eventTypeId: eventType.id,
      contactId: contact.id,
      title,
      startTime: meta.startTime,
      endTime: meta.endTime,
      timezone: meta.timezone,
      status: "confirmed",
      location: finalLocation,
      notes: bookingNotes,
      cancellationToken,
      icalEventId,
      stripeSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
      amountPaid: session.amount_total ?? null,
    })
    .run();

  // Fire confirmation emails + workflows
  try {
    await sendBookingConfirmation({ bookingId, cancellationToken });
  } catch (error) {
    console.error("[Stripe Webhook] Confirmation email failed:", error);
  }

  try {
    await scheduleWorkflowsForBooking(bookingId, "booking_created");
    await executeWorkflows();
  } catch (error) {
    console.error("[Stripe Webhook] Workflow scheduling failed:", error);
  }

  return NextResponse.json({ received: true, bookingId });
}

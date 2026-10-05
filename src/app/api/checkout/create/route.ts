import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eventTypes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { addMinutes, parseISO } from "date-fns";
import { getStripe } from "@/lib/stripe";
import { CONSENT_VERSION } from "@/lib/consent";

const schema = z.object({
  eventTypeSlug: z.string(),
  startTime: z.string(),
  timezone: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  notes: z.string().optional(),
  // Recording + data-use + ToS/Privacy consent (checkbox on the booking form)
  consent: z.literal(true),
});

// Creates a Stripe Checkout session for a paid event type.
// The booking is NOT created yet — it's created by the webhook after payment.
// All booking details are stashed in Stripe session metadata and retrieved on completion.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === "consent");
    return NextResponse.json(
      { error: consentMissing ? "Please accept the recording and privacy terms to book." : "Invalid booking details" },
      { status: 400 }
    );
  }
  const data = parsed.data;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const eventType = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.slug, data.eventTypeSlug))
    .get();

  if (!eventType || !eventType.isActive) {
    return NextResponse.json(
      { error: "Event type not found" },
      { status: 404 }
    );
  }

  if (!eventType.price || eventType.price <= 0) {
    return NextResponse.json(
      { error: "Event type is free — use /api/bookings directly" },
      { status: 400 }
    );
  }

  const startTime = parseISO(data.startTime);
  const endTime = addMinutes(startTime, eventType.duration);

  const appUrl =
    process.env.APP_URL ||
    request.nextUrl.origin ||
    "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: eventType.currency || "usd",
          product_data: {
            name: eventType.name,
            description:
              eventType.priceLabel ||
              `${eventType.duration}-minute meeting`,
          },
          unit_amount: eventType.price,
        },
        quantity: 1,
      },
    ],
    customer_email: data.email,
    success_url: `${appUrl}/book/${data.eventTypeSlug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/book/${data.eventTypeSlug}`,
    metadata: {
      eventTypeSlug: data.eventTypeSlug,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      timezone: data.timezone,
      name: data.name,
      email: data.email,
      consentAt: new Date().toISOString(),
      consentVersion: CONSENT_VERSION,
      phone: data.phone || "",
      company: data.company || "",
      notes: data.notes || "",
    },
  });

  return NextResponse.json(
    { url: session.url, sessionId: session.id },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

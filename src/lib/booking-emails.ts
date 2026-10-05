import ical from "ical-generator";
import { format, parseISO } from "date-fns";
import { db } from "@/db";
import { settings, bookings, eventTypes, contacts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "./email";

async function getSetting(key: string): Promise<string> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? "";
}

/**
 * Build an .ics calendar invite for a booking. Returned as a string
 * suitable for email attachment (content-type text/calendar).
 */
export async function buildICS(booking: {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location: string | null;
  notes: string | null;
}, inviteeEmail: string, hostEmail: string): Promise<string> {
  const hostName = (await getSetting("host_name")) || "Host";
  const cal = ical({ name: "Calendar.io" });
  cal.createEvent({
    id: booking.id,
    start: parseISO(booking.startTime),
    end: parseISO(booking.endTime),
    summary: booking.title,
    description: booking.notes || "",
    location: booking.location || "",
    organizer: hostEmail
      ? { name: hostName, email: hostEmail }
      : undefined,
    attendees: [{ email: inviteeEmail, rsvp: true }],
  });
  return cal.toString();
}

export interface BookingEmailContext {
  bookingId: string;
  cancellationToken: string;
}

/**
 * Sends two emails on booking creation:
 *   1) Confirmation to the invitee (with .ics attachment + cancel link)
 *   2) Notification to the host (if host_email is configured)
 * This runs in addition to any user-configured workflows.
 */
export async function sendBookingConfirmation(ctx: BookingEmailContext): Promise<void> {
  const { bookingId, cancellationToken } = ctx;

  const booking = await db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
  if (!booking) return;

  const eventType = booking.eventTypeId
    ? await db.select().from(eventTypes).where(eq(eventTypes.id, booking.eventTypeId)).get()
    : null;

  const contact = booking.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, booking.contactId)).get()
    : null;

  if (!contact) return;

  const appUrl = (await getSetting("app_url")) || "http://localhost:3000";
  const hostName = (await getSetting("host_name")) || "Your host";
  const hostEmail = await getSetting("host_email");

  const dateStr = format(parseISO(booking.startTime), "EEEE, MMMM d, yyyy");
  const timeStr = `${format(parseISO(booking.startTime), "h:mm a")} – ${format(
    parseISO(booking.endTime),
    "h:mm a"
  )}`;

  const cancelUrl = `${appUrl}/cancel/${cancellationToken}`;
  const locationHtml = booking.location
    ? `<p><strong>Location:</strong> ${escapeHtml(booking.location)}</p>`
    : "";

  // Build .ics attachment
  const icsContent = await buildICS(booking, contact.email, hostEmail);

  // Email 1: Invitee confirmation
  const inviteeHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #5b21b6; margin-top: 0;">You're booked!</h2>
      <p>Hi ${escapeHtml(contact.name)},</p>
      <p>Your <strong>${escapeHtml(eventType?.name || booking.title)}</strong> with ${escapeHtml(hostName)} is confirmed.</p>
      <div style="background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 16px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0;"><strong>${dateStr}</strong></p>
        <p style="margin: 4px 0 0 0;">${timeStr}</p>
        ${locationHtml}
      </div>
      ${booking.notes ? `<p><strong>Your notes:</strong><br>${escapeHtml(booking.notes)}</p>` : ""}
      <p style="margin-top: 24px;">
        Need to cancel? <a href="${cancelUrl}" style="color: #5b21b6;">Click here to cancel</a>
      </p>
      <p style="color: #6b7280; font-size: 13px; margin-top: 32px;">
        The calendar invite is attached. Add it to your calendar so you don't miss it.
      </p>
    </div>
  `;

  await sendEmail({
    to: contact.email,
    subject: `Confirmed: ${eventType?.name || booking.title} on ${dateStr}`,
    html: inviteeHtml,
    icalAttachment: {
      content: icsContent,
      filename: "invite.ics",
    },
  });

  // Email 2: Host notification
  if (hostEmail) {
    const hostHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #5b21b6; margin-top: 0;">New booking</h2>
        <p><strong>${escapeHtml(contact.name)}</strong> (${escapeHtml(contact.email)}) booked <strong>${escapeHtml(eventType?.name || booking.title)}</strong>.</p>
        <div style="background: #f5f3ff; border-left: 4px solid #8b5cf6; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0;"><strong>${dateStr}</strong></p>
          <p style="margin: 4px 0 0 0;">${timeStr}</p>
          ${locationHtml}
        </div>
        ${contact.phone ? `<p><strong>Phone:</strong> ${escapeHtml(contact.phone)}</p>` : ""}
        ${booking.notes ? `<p><strong>Their notes:</strong><br>${escapeHtml(booking.notes)}</p>` : ""}
        <p style="margin-top: 24px;">
          <a href="${appUrl}/meetings" style="color: #5b21b6;">View in Calendar.io</a>
        </p>
      </div>
    `;

    await sendEmail({
      to: hostEmail,
      subject: `New booking: ${contact.name} – ${dateStr}`,
      html: hostHtml,
      icalAttachment: {
        content: icsContent,
        filename: "invite.ics",
      },
    });
  }
}

/**
 * Sends cancellation notifications to both invitee and host.
 */
export async function sendCancellationNotice(bookingId: string): Promise<void> {
  const booking = await db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
  if (!booking) return;

  const eventType = booking.eventTypeId
    ? await db.select().from(eventTypes).where(eq(eventTypes.id, booking.eventTypeId)).get()
    : null;

  const contact = booking.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, booking.contactId)).get()
    : null;

  if (!contact) return;

  const hostName = (await getSetting("host_name")) || "Your host";
  const hostEmail = await getSetting("host_email");

  const dateStr = format(parseISO(booking.startTime), "EEEE, MMMM d, yyyy");
  const timeStr = format(parseISO(booking.startTime), "h:mm a");

  // Paid bookings: refund owed only with 24h+ notice (Terms of Service §2).
  // Refunds are issued manually in Stripe, so tell both sides where things stand.
  const isPaid = !!booking.stripePaymentIntentId;
  const hoursNotice = (parseISO(booking.startTime).getTime() - Date.now()) / 3_600_000;
  const refundDue = isPaid && hoursNotice >= 24;
  const inviteeRefundNote = !isPaid
    ? ""
    : refundDue
      ? `<p>Since you cancelled at least 24 hours ahead, you'll receive a full refund to your original payment method within 5 business days.</p>`
      : `<p>As this was cancelled less than 24 hours before the call, it isn't eligible for a refund under our Terms of Service. Reply to this email and we'll try to find you a new time.</p>`;
  const hostRefundNote = !isPaid
    ? ""
    : refundDue
      ? `<p style="padding:12px;border-radius:8px;background:#e6f4ff;"><strong>Refund due</strong> (${Math.floor(hoursNotice)}h notice). Refund within 5 business days: <a href="https://dashboard.stripe.com/payments/${escapeHtml(booking.stripePaymentIntentId!)}">open payment in Stripe</a>.</p>`
      : `<p style="padding:12px;border-radius:8px;background:#f4f4f5;"><strong>No refund due</strong>: cancelled with ${Math.max(0, Math.floor(hoursNotice))}h notice (under 24h). Offer a new time if possible.</p>`;

  // Invitee
  await sendEmail({
    to: contact.email,
    subject: `Cancelled: ${eventType?.name || booking.title} on ${dateStr}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2>Meeting cancelled</h2>
        <p>Hi ${escapeHtml(contact.name)},</p>
        <p>Your <strong>${escapeHtml(eventType?.name || booking.title)}</strong> with ${escapeHtml(hostName)} scheduled for <strong>${dateStr} at ${timeStr}</strong> has been cancelled.</p>
        ${inviteeRefundNote}
      </div>
    `,
  });

  // Host
  if (hostEmail) {
    await sendEmail({
      to: hostEmail,
      subject: `Cancelled: ${contact.name} – ${dateStr}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2>Booking cancelled</h2>
          <p><strong>${escapeHtml(contact.name)}</strong> (${escapeHtml(contact.email)}) cancelled their booking for <strong>${dateStr} at ${timeStr}</strong>.</p>
          ${hostRefundNote}
        </div>
      `,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

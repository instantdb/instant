import { NextRequest, NextResponse } from "next/server";
import { getStripe, CREDITS_PER_PACK } from "@/lib/stripe";
import { adminDb } from "@/lib/adminDb";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  const stripe = getStripe();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Re-fetch the session from Stripe to get live metadata.
        // The event payload's metadata is frozen at creation time,
        // so retried webhooks would always bypass the idempotency check.
        const session = await stripe.checkout.sessions.retrieve(
          (event.data.object as Stripe.Checkout.Session).id
        );

        if (session.payment_status !== "paid") {
          break;
        }

        // Skip if already processed (by a duplicate webhook)
        if (session.metadata?.creditsProcessed === "true") {
          break;
        }

        const userId = session.metadata?.instantUserId;
        if (!userId) break;

        // Mark as processed in Stripe to prevent double-crediting
        await stripe.checkout.sessions.update(session.id, {
          metadata: { ...session.metadata, creditsProcessed: "true" },
        });

        const { $users } = await adminDb.query({
          $users: { $: { where: { id: userId } } },
        });

        await adminDb.transact(
          adminDb.tx.$users[userId].update({
            credits: ($users[0]?.credits || 0) + CREDITS_PER_PACK,
          })
        );
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

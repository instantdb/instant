import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
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
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.instantUserId;
        if (userId) {
          await adminDb.transact(
            adminDb.tx.$users[userId].update({
              subscriptionStatus: "active",
              cancelAt: null,
            })
          );
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription & {
          cancel_at: number | null;
        };
        const customerId = subscription.customer as string;

        // Find user by Stripe customer ID
        const { $users } = await adminDb.query({
          $users: { $: { where: { stripeCustomerId: customerId } } },
        });

        if ($users[0]) {
          await adminDb.transact(
            adminDb.tx.$users[$users[0].id].update({
              subscriptionStatus: subscription.status,
              cancelAt: subscription.cancel_at,
            })
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { $users } = await adminDb.query({
          $users: { $: { where: { stripeCustomerId: customerId } } },
        });

        if ($users[0]) {
          await adminDb.transact(
            adminDb.tx.$users[$users[0].id].update({
              subscriptionStatus: "canceled",
            })
          );
        }
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

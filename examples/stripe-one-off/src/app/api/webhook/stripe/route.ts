import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { createPurchase, findPurchaseBySessionId } from "@/lib/purchases";

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const token = session.metadata?.token;

    if (!token) {
      console.error("No token in session metadata");
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Check for duplicate
    const existing = await findPurchaseBySessionId(session.id);
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await createPurchase({
      token,
      email: session.customer_details?.email || "",
      stripeSessionId: session.id,
      stripePaymentIntentId: (session.payment_intent as string) || "",
      amount: session.amount_total || 500,
      currency: session.currency || "usd",
    });
  }

  return NextResponse.json({ received: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPriceId } from "@/lib/stripe";
import { adminDb } from "@/lib/adminDb";
import { verifyAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    // Get user from InstantDB
    const { $users } = await adminDb.query({
      $users: { $: { where: { id: userId } } },
    });

    const user = $users[0];
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    const stripe = getStripe();

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { instantUserId: userId },
      });
      customerId = customer.id;

      // Save Stripe customer ID to InstantDB
      await adminDb.transact(
        adminDb.tx.$users[userId].update({ stripeCustomerId: customerId })
      );
    }

    // Create checkout session for credit pack (one-time payment)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [{ price: getPriceId(), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${request.headers.get("origin")}/?success=true`,
      cancel_url: `${request.headers.get("origin")}/?canceled=true`,
      metadata: { instantUserId: userId },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

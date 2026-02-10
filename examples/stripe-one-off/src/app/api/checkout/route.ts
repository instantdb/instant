import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const { origin } = new URL(request.url);
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Token required" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Premium Wallpaper Pack",
              description: "9 high-resolution wallpapers",
            },
            unit_amount: 500,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/success`,
      cancel_url: `${origin}`,
      metadata: { token },
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

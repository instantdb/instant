import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/adminDb";
import { id } from "@instantdb/admin";
import { verifyAuth } from "@/lib/auth";

const HAIKU_TEMPLATES = [
  "whispers through the {topic}\nancient echoes dancing soft\nsilence speaks at last",
  "beneath {topic}'s gaze\nfleeting moments crystallize\ntime suspends its breath",
  "{topic} awakens\npetals fall like memories\nspring returns anew",
  "in the {topic}'s heart\nsecrets bloom like moonlit flowers\nwisdom finds its way",
  "shadows of {topic}\ndrift across the evening sky\npeace descends at dusk",
];

function generateHaiku(topic: string): string {
  const template = HAIKU_TEMPLATES[Math.floor(Math.random() * HAIKU_TEMPLATES.length)];
  return template.replace("{topic}", topic.toLowerCase().split(" ")[0]);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const { topic: rawTopic } = await request.json();

    const topic = typeof rawTopic === "string" ? rawTopic.trim() : "";
    if (!topic) {
      return NextResponse.json({ error: "Topic required" }, { status: 400 });
    }

    const { $users } = await adminDb.query({
      $users: { $: { where: { id: userId } } },
    });

    const user = $users[0];
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const currentCredits = user.credits || 0;
    if (currentCredits < 1) {
      return NextResponse.json(
        { error: "Insufficient credits", needsCredits: true },
        { status: 402 }
      );
    }

    const content = generateHaiku(topic);
    const haikuId = id();

    await adminDb.transact([
      adminDb.tx.$users[userId].update({ credits: currentCredits - 1 }),
      adminDb.tx.haikus[haikuId]
        .update({ topic, content, createdAt: Date.now() })
        .link({ author: userId }),
    ]);

    return NextResponse.json({
      haiku: { id: haikuId, topic, content },
    });
  } catch (error) {
    console.error("Generate error:", error);
    return NextResponse.json(
      { error: "Failed to generate haiku" },
      { status: 500 }
    );
  }
}

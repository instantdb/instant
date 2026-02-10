import { init, id } from "@instantdb/admin";
import schema from "../src/instant.schema";

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

const samplePosts = [
  {
    title: "Welcome to The Weekly Dispatch",
    teaser:
      "Welcome to our newsletter! In this inaugural post, we share our vision for bringing you the most insightful content every week.",
    content: `Welcome to The Weekly Dispatch!

We're thrilled to launch this newsletter and embark on this journey with you. Our mission is simple: deliver thoughtful, well-researched content that helps you stay informed and inspired.

Every week, we'll cover:
- Industry insights and trends
- Practical tips you can apply immediately
- Exclusive interviews with thought leaders
- Deep dives into topics that matter

Thank you for being here from the beginning. We can't wait to share what we've been working on.

Stay curious,
The Weekly Dispatch Team`,
    isPremium: false,
    publishedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
  {
    title: "The Future of Remote Work",
    teaser:
      "Remote work is here to stay, but how will it evolve? We explore the trends shaping the future of distributed teams.",
    content: `The Future of Remote Work

The pandemic accelerated a shift that was already underway. Now, as we look ahead, several key trends are emerging:

**1. Hybrid is the New Normal**
Companies are embracing flexibility, allowing employees to split time between home and office. This requires new thinking about collaboration and culture.

**2. Async Communication Rises**
With teams spread across time zones, synchronous meetings are giving way to thoughtful, written communication. Tools like Loom, Notion, and collaborative docs are becoming essential.

**3. Results Over Hours**
The focus is shifting from "time in seat" to actual output. This empowers employees while requiring better goal-setting and tracking.

**4. Digital-First Offices**
Even when people are in the office, they're often on video calls with remote colleagues. Office design is evolving to support this hybrid reality.

**What This Means for You**
Whether you're an employee or employer, adaptability is key. Invest in your remote work skills, build intentional connections, and stay open to experimentation.

The companies that thrive will be those that view remote work not as a limitation, but as an opportunity to access global talent and create more inclusive workplaces.`,
    isPremium: false,
    publishedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
  {
    title: "5 Productivity Secrets from Top CEOs",
    teaser:
      "After interviewing dozens of successful executives, we've uncovered the habits that set them apart. Premium members get the full breakdown.",
    content: `5 Productivity Secrets from Top CEOs

We interviewed 50 CEOs and founders to understand how they manage their time. Here's what we learned:

**1. The 90-Minute Focus Block**
Nearly every high performer mentioned protecting blocks of uninterrupted time. The magic number? 90 minutes—long enough for deep work, short enough to stay fresh.

**2. Energy Management Over Time Management**
"I don't schedule based on time, I schedule based on energy," one CEO told us. They tackle creative work when sharp (usually morning) and administrative tasks when energy dips.

**3. The Two-Minute Rule**
If something takes less than two minutes, do it immediately. This prevents small tasks from piling up and cluttering your mental space.

**4. Ruthless Calendar Audits**
Every quarter, these leaders review every recurring meeting and ask: "Is this still necessary?" Many report eliminating 30%+ of their meetings.

**5. The Sunday Preview**
Most spend 30 minutes on Sunday evening reviewing the week ahead. They identify the 3 most important outcomes and ensure their calendar reflects those priorities.

**Bonus: The Power of No**
Every CEO emphasized this: success comes not from saying yes to everything, but from saying no to almost everything so you can say yes to what matters.

Start with one of these practices this week. Small changes compound into remarkable results.`,
    isPremium: true,
    publishedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    title: "Understanding Market Cycles",
    teaser:
      "Markets move in cycles. Learn to recognize the patterns that repeat throughout history and position yourself accordingly.",
    content: `Understanding Market Cycles

Every investor should understand the four phases of market cycles:

**Phase 1: Accumulation**
Smart money begins buying after a downturn. Sentiment is still negative, but valuations are attractive. This is often the best time to invest, yet feels the scariest.

**Phase 2: Markup**
Prices rise as more investors notice the opportunity. Confidence grows, and positive news reinforces the trend. This is when most people start paying attention.

**Phase 3: Distribution**
Early investors begin taking profits. Prices may still be near highs, but momentum slows. Euphoria often peaks here, with newcomers rushing in.

**Phase 4: Decline**
Selling pressure overcomes buying. Negative sentiment builds, and prices fall. This sets the stage for the next accumulation phase.

**Key Lessons:**
- Cycles are driven by human psychology, which doesn't change
- The best opportunities often feel uncomfortable
- Diversification and patience are your friends
- No one can perfectly time the market, but understanding cycles helps you avoid the worst mistakes

Remember: "Be fearful when others are greedy, and greedy when others are fearful."`,
    isPremium: true,
    publishedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
  },
  {
    title: "This Week's Quick Hits",
    teaser:
      "A roundup of the most interesting things we read this week, from AI breakthroughs to surprising economic data.",
    content: `This Week's Quick Hits

Here's what caught our attention:

**Tech**
- OpenAI announced new reasoning capabilities that could transform how we interact with AI
- Apple's latest earnings show services revenue now accounts for over 25% of total sales

**Business**
- The four-day work week pilot results are in, and productivity actually increased
- More companies are offering "returnships" for professionals re-entering the workforce

**Economy**
- Inflation continues to cool, raising hopes for rate cuts
- Housing inventory is finally starting to recover in major markets

**Interesting Read**
This long-form piece on the history of shipping containers explains how a simple metal box revolutionized global trade. Highly recommended.

**Quote of the Week**
"The best time to plant a tree was 20 years ago. The second best time is now." — Chinese Proverb

See you next week!`,
    isPremium: false,
    publishedAt: Date.now(),
  },
];

async function seed() {
  console.log("Seeding posts...");

  const txs = samplePosts.map((post) =>
    adminDb.tx.posts[id()].create({
      title: post.title,
      teaser: post.teaser,
      content: post.content,
      isPremium: post.isPremium,
      publishedAt: post.publishedAt,
    })
  );

  await adminDb.transact(txs);
  console.log(`Created ${samplePosts.length} posts!`);
}

seed().catch(console.error);

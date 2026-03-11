// Shared essay data: snippets, thumbnails, author info, and placeholders

export const authorFirstNames: Record<string, string> = {
  Instant: 'Daniel',
};

export const authorAvatars: Record<string, string> = {
  'Stepan Parunashvili': '/img/landing/stopa.jpg',
  'Joe Averbukh': '/img/landing/joe.jpg',
  'Daniel Woelfel': '/img/landing/daniel.png',
  Instant: '/img/landing/daniel.png',
  'Nikita Prokopov': '/img/peeps/nikitonsky.jpeg',
};

export const flyPlaceholders = [
  'https://fly.io/blog/everyone-write-an-agent/assets/agents-cover.webp',
  'https://fly.io/blog/corrosion/assets/sqlite-cover.webp',
  'https://fly.io/blog/games-as-model-eval/assets/Fly_Man.webp',
  'https://fly.io/blog/parking-lot-ffffffffffffffff/assets/ffff-cover.webp',
  'https://fly.io/blog/taming-rust-proxy/assets/happy-crab-cover.jpg',
  'https://fly.io/blog/code-and-let-live/assets/sprites.jpg',
  'https://fly.io/blog/wrong-about-gpu/assets/choices-choices-cover.webp',
  'https://fly.io/blog/a-blog-if-kept/assets/keep-blog.webp',
  'https://fly.io/blog/js-ecosystem-delightfully-wierd/assets/js-weird-cover.webp',
  'https://fly.io/blog/love-letter-react/assets/desktop-thumbnail.webp',
];

// Slugs where the preview image should not be shown on the essay show page
export const hidePreview = new Set([
  'codex_53_opus_46_cs_bench',
  'conj',
  'count_min_sketch',
  'founding_firebase',
  'gpt_5_vs_opus_4',
  'heroui',
  'mirando',
  'seed',
]);

// Override durations in minutes (e.g. for video posts with actual watch times)
export const customDurations: Record<string, number> = {
  conj: 34, // YouTube: 33:58
  founding_firebase: 81, // YouTube: 81:10
};

export const customSnippets: Record<string, string> = {
  codex_53_opus_46_cs_bench:
    'GPT 5.3 Codex and Claude Opus 4.6 shipped within minutes of each other. How well do they compare building a multiplayer Counter-Strike?',
  free_teams_through_february:
    'Share your favorite apps with your favorite people, with free Instant teams for February.',
  gpt_52_on_the_counterstrike_benchmark:
    'How does GPT 5.2 do when you ask it to build a multiplayer Counter-Strike?',
  agents_building_counterstrike:
    'Introducing CS Bench: we ask all top models to build a multiplayer Counter-Strike from scratch.',
  count_min_sketch:
    "What's the most efficient way to store frequencies? Come find out with us, and learn some of Wodehouse's favorite words to boot.",
  founding_firebase:
    'We sat down with one of the founders of Firebase to learn about the story behind the database platform that inspired many of us.',
  heroui:
    "Junior went from Venezuela to YC to build HeroUI, a suite of primitives that have helped thousands of developers build frontends. Here's the backstory.",
  mirando:
    'Ignacio De Haedo and Javier Rey left their software engineering jobs at Meta to build Mirando, an AI-powered real-estate platform for Latin America. This is the backstory.',
  gpt_5_vs_opus_4:
    'How do GPT-5 and Opus 4.1 compare for vibe coding apps? We built a full-stack chiptunes player to find out.',
  agents:
    'Beginners are vibe-coding apps and experts are maxing out their LLM subscriptions. What does this mean for how we build software?',
  sync_future:
    "We've been building frontends that talk to backends for years. But in the meantime the browser has become an OS. In that case what should your stack look like?",
  pg_upgrade:
    'Right before Christmas we discovered that our Aurora Postgres instance needed a major version upgrade. This covers how we made the upgrade with zero seconds of downtime.',
  conj: 'Our CTO gave a talk about building Instant at Clojure Conj 2024! In this talk he discusses the common schleps developers face when building apps, and how Instant compresses them.',
  seed: "A month after we open sourced Instant, we had one of the largest Show HN's for a YC company. This shares the news of our $3.4M seed round.",
  next_firebase:
    'This essay covers the design behind Instant. If the schleps we face as UI engineers are actually database problems in disguise, would a database-looking solution solve them?',
  datalogjs:
    "Let's build a query engine from scratch. In about 100 lines of Javascript, we'll support joins, indexes, and find our answer for Arnold!",
  db_browser:
    "How will we build web applications in the future? We think it's going to look like a database in the browser, and this essay explains why.",
};

export const customThumbnails: Record<string, string> = {
  agents: '/img/essays/agents.jpg',
  agents_building_counterstrike:
    '/img/essays/agents_building_counterstrike.jpg',
  codex_53_opus_46_cs_bench: '/img/essays/codex_53_opus_46_cs_bench.jpg',
  conj: '/img/essays/conj.jpg',
  count_min_sketch: '/img/essays/count_min_sketch.jpg',
  datalogjs: '/img/essays/datalogjs.jpg',
  db_browser: '/img/essays/db_browser.jpg',
  founding_firebase: '/img/essays/founding_firebase.jpg',
  free_teams_through_february: '/img/essays/free_teams_through_february.jpg',
  gpt_52_on_the_counterstrike_benchmark:
    '/img/essays/gpt_52_on_the_counterstrike_benchmark.jpg',
  gpt_5_vs_opus_4: '/img/essays/gpt_5_vs_opus_4.jpg',
  heroui: '/img/essays/heroui.jpg',
  mirando: '/img/essays/mirando.jpg',
  next_firebase: '/img/essays/next_firebase.jpg',
  pg_upgrade: '/img/essays/pg_upgrade.jpg',
  seed: '/img/essays/seed.jpg',
  sync_future: '/img/essays/sync_future.jpg',
};

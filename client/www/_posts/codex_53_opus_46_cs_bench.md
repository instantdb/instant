---
title: 'Counter-Strike Bench: GPT 5.3 Codex vs Claude Opus 4.6'
date: '2026-2-5'
authors: stopachka
---

_We're Instant. We give you and your agents unlimited databases and backends. Build whatever you like, from your next startup to an alternative Counter-Strike. [Sign up](https://instantdb.com/dash) and build your first app in minutes_

GPT 5.3 Codex and Claude Opus 4.6 shipped within minutes of eachother. How well do they compare building a multiplayer Counter-Strike?

We tried and found out. Here's how the gameplay feels:

<iframe
  src="https://player.mux.com/w8hs9hQH902Vd01GU7zluTWVidil02BuV5opvzIz1XWc600?metadata-video-title=cs_bench_feb&video-title=cs_bench_feb&thumbnail-time=9"
  style="width: 100%; border: none; aspect-ratio: 167/108;"
  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
  allowfullscreen
></iframe>

And if you're curious, you can play it yourself:

1. **GPT 5.3 Codex's attempt:** https://53strike.vercel.app/
1. **Claude Opus 4.6's attempt** https://53strike.vercel.app/

We have a full recording of us building it [here](https://youtu.be/Kyef-cUUB0Q).

Here's what surprised us:

**Both models were a leap over any previous generation**

You can compare the results with our [last](/essays/agents_building_counterstrike) benchmark. These models made much more realistic maps on the first try. Their weapons were better. And they got much more right on the first shot. Codex had some issues with accounting for HP under respawns, and Claude has some issues spawning inside obstacles. But a simple paste got them fixing it. At no point did they get stuck and require guidance.

**GPT 5.3 Codex was much faster than Claude**

In just about every prompt GPT 5.3 Codex finished in about half the time. This could be because of the harness: We noticed Claude Code did much more upfront research than Codex.

**Claude Opus 4.6 performed better on 5/6 prompts**

But perhaps the upfront research came to good use, because Claude Opus 4.6 beat out GPT 5.3 Codex on all prompts but one (and the last one was a tie).

|                     | GPT 5.3 Codex | Claude Opus 4.6 |
| ------------------- | ------------- | --------------- |
| **Frontend**        |               |                 |
| Boxes + Physics     | 🥈            | 🥇              |
| Gun + Creativity    | 🥈            | 🥇              |
| Sounds + Animations | 🥈            | 🥇              |
| **Backend**         |               |                 |
| Multiplayer         | 🥈            | 🥇              |
| Maps                | 🥈            | 🥇              |
| **Bonus**           | 🤝            | 🤝              |

Claude drew more interesting maps. Claude made a nicer weapon. The gameplay UI was much nicer on Claude's first try.

**Both models struggled a bit with physics**

At this point, neither model had issues drawing out the UI, setting up the backend, or getting caught up in bugs from three.js. The frontier now seems to be about physics.

For example, Claude generated maps where players could end up stuck. Here's Claude's "inferno valley" and "nuke zone" produced 4-wall obstacles in the center:

![](/posts/cs_feb/maps.png?lightbox)

There would be no way for users to leave. Codex also had trouble with direction. The enemy's "point of view" was coming out from the back of their had, rather than the front.

With both models you could shoot through obstacles. Claude Opus 4.6 at least made it so you couldn't walk through the obstacles -- but with Codex you could.

With either one, it was fun to build and play!

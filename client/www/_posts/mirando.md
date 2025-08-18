---
title: Mirando transforms Latin-American Real-Estate on top of Instant
date: '2025-08-18'
authors: stopachka
---

_This is a first of a series of posts about the people who power their startup with Instant! Stories like Ignacio and Javier’s are what drive us to keep working on making the best tools for builders._

Ignacio De Haedo and Javier Rey left their software engineering jobs at Meta to build <a href="https://www.mirando.com.uy/" target="_blank">Mirando</a>, an AI-powered real-estate platform for Latin America. In this post we’ll share their backstory, the lessons learned, and what’s ahead!

![](/posts/mirando/javier_and_ignacio.jpg)

# From Meta

Our story starts with Ignacio. Ignacio worked at Meta for 6 and half years. Towards the tail-end he started to burn out. On one flight from Latin America back to London he had a realization: he wasn’t tired of building, but he was tired of building things he didn’t care about. Ignacio knew it was time to move on.

There was of course one person he had to convince: his wife. He got her blessing, pushed the button, and started to hack on his own projects.

# To Mentor

The next 9 months was a crash-course on startups.

When you work at Meta you get speciality tools to ship products and support to grow them. Ignacio had to get acquainted with infra outside of Meta and learn to grow his own products as a solo engineer.

## Coming up with an idea

One app Ignacio wished he had when he was younger was a tool to help him pick careers. Talking to a lot of younger folks (including his younger brother), it felt more important than ever. And AI was just coming on the scene.

What if AI could help you flesh out your thinking? You could start with rough goals, and AI would help you think through next steps. Ignacio soon saw that this was more general than careers.

This product could help you achieve _any_ goal. It would be almost like having a…mentor!

## Building Mentor

So Ignacio started building Mentor. He wanted to move quickly and focus on what made his product special: the UX for goals and a great AI integration.

He searched for infra and discovered Instant. **He tried it out and was able to build his version 1 within 2 weeks.** From his own words:

> The fact that you include everything: from auth, a data layer, a client sdk, a way to mutate on the server, and permissions…it’s not any one thing. When you put this together they create a great experience.
>
> Ignacio De Haedo

When a tool is batteries-included, things just tend to work. Instant’s real-time abstractions also made it easier for Ignacio to create a delightful UX.

Goals are inherently relational: every goal has a subgoal and so on. This was easy for him to express with Instant’s relational query language. And since everything is real-time, every tab auto-synced. Because Instant worked offline, it meant Ignacio’s users could run Mentor in spotty connections. And since optimistic updates came by default, every action on Mentor felt snappy.

Soon Ignacio had a pretty darn compelling app. Here’s a quick demo of how Mentor can you help get in the best shape of your life:

[!video](https://www.youtube.com/watch?v=hp3byaULieQ 'Mentor Demo')

Now that Ignacio had a product he could focus on users.

## Hitting the top of Product Hunt…twice

He launched on Product Hunt and hit the front page not <a href="https://www.producthunt.com/products/mentor-v1/launches/mentor-v1" target="_blank">once</a>, but <a href="https://www.producthunt.com/products/mentor-v1/launches/mentor-ai-2" target="_blank">twice</a>. He iterated until he felt Mentor reached a stable state: users were fans, and Ignacio himself used Mentor every day.

As Ignacio kept improving Mentor, he traveled back to his hometown in Uruguay and met his close friend Javier. That’s when everything changed again.

# To Meeting Javier

Javier was a veteran AI engineer. He worked on AI for the last 10 years, long before people had ever heard of ChatGPT or transformers.

They both shared a love for real-estate and prop-tech, and they both saw an opportunity in Latin America — a market they were deeply familiar with, and knew was underserved.

Latin America is full of great engineers, but most of them export their work to the United States. This means a lot of technology used day-to-day feels outdated. Ignacio and Javier experienced this first-hand with real-estate.

# To Building Mirando

As home buyers, Ignacio and Javier found themselves frustrated. There was no single place to find every listing. Agents all had separate sites, and many agents listed the same homes. This meant that you’d have spend lots of time scouring different websites and manually de-duping homes.

They realized the experience was no better for agents too. When a home buyer signs up with an agent, they want a tailored experience. Home buyers want to see a list of places that fit their requirements. To build a list like this agents would have to go across multiple different sites, negotiate with their colleagues, and build custom documents. That would take days.

So Ignacio and Javier started to think of solutions. What if you could get all homes in place, and you could get an AI that could help you find homes that you love? Agents could use this too and reduce their research time from days to minutes.

## The Script that Started It

As a proof of concept Javier built a script that amalgamated homes across a few agent sites in one place. Just this was already a huge improvement. So they started to turn the script into a real app.

## Convincing Javier on Instant

Javier first started to build a version 1 on an Instant competitor [^1]. When Ignacio saw this, he knew he had convince Javier to switch. The competitor’s product worked, but things weren’t real time, it took longer to build, and the devex didn’t feel right.

So what did Ignacio do? **He shipped a PR to demonstrate the difference**. The PR was full of deletions:

> The diff. It was crazy the number of lines of code I deleted. And we got wins. The live sync. The auth was better. And the free tier was a lot better. I showed him the diff, and [Javier] said I trust you.
>
> Ignacio De Haedo

<a href="https://x.com/nachodeh/status/1871232369614582174" target="_blank">Ignacio reduced the code-size by 70%</a>. With Javier on board, Ignacio built out the UX and Javier built out the AI.

## Shipping Mirando

<a href="https://www.mirando.com.uy/">Mirando</a> launched with very happy users. Home buyers and agents finally had a place where they could look through multiple homes.

Search was a first class citizen on Mirando too. You could create a search, you could share it, and it was real-time. The more you customized your search, the more info the AI had to tailor your experience.

Soon large agencies were knocking down their doors. They wanted to give Mirando to their agents, so they could create custom-tailored searches for clients.

## Surprises in real-time sync

Ignacio and Javier believed that when you’re searching for homes, it should feel _fun._ You should be able to share your search with friends and loves ones. If someone likes a home, everyone should see it right away.

Instant’s real-time sync came surprisingly handy for that. With reactive queries, they could create a search experience that felt collaborative. Here’s a demo of how a Mirando user could collaborate on a search with someone else:

[!video](https://www.youtube.com/watch?v=3wda2j2yJCE 'Mirando Demo')

When we asked Ignacio what he loved the most about Instant, he picked sync:

> The real-time sync. It's the feature that reduces the most boilerplate code. It's the feature that makes the app feel like magic. And it helps justify a lot of the UX efforts we want to build.
>
> Ignacio De Haedo

# From Montevideo to Latin America

It’s only the beginning for Ignacio and Javier. They started working on Mirando in January. Today they have large agencies signing up in Montevideo, Uruguay. They have a truly delightful experience, and an AI agent that keeps getting better after every search.

They plan to grow to all of Latin America, and we’re so darn excited to be supporting their infra.

[^1]: For gentlemanly reasons we will not mention names

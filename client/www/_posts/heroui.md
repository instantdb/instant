---
title: HeroUI helps people build beautiful apps, on top of Instant
date: '2025-08-25'
authors: stopachka
---

_This is part of a series of posts about the people who power their startups with Instant. Stories like Junior’s are what drive us to keep working on making the best tool for builders._

Junior Garcia is on a mission to help everyone make beautiful apps with <a href="https://www.heroui.com/" target="_blank">HeroUI</a>.

Starting off in Venezuela, Junior built HeroUI components — a suite of primitives that have helped thousands of developers build frontends. From there Junior was accepted to YCombinator and launched HeroUI chat, an AI-powered tool that helps everyone build beautiful apps.

In this post we’ll share his backstory, the lessons learned, and what’s ahead!

![](/posts/heroui/junior.png)

# From Venezuela

We start off in Valencia, Venezuela. Junior was studying electrical engineering at University, when he learned about microchips and how he could program them. He got hooked with an idea: how cool would it be to write a program that could get a microchip to make millions of calculations a second? It felt like a superpower.

He just had one problem.

# To Paper

For the first 19 years of his life, Junior didn’t have computer or an internet connection. He would have to be creative about how he would learn to program.

So, Junior got creative. He went to his University’s library and picked up a book on Java. He would would go through each chapter and write out his solutions on paper. Then he would visit his girlfriend’s house, where he could borrow her computer and run his solutions. (You may be thinking, that’s a great girlfriend. Well, soon she would become Junior’s wife!)

As Junior finished his book on Java, he got good enough to get a job at a tech company writing it. He dropped out of University and went to programming full time.

# To Customizing Java

When Junior started building, he realized that the software written in Java didn’t tend to look so good. Java has it’s own renderer — different from what’s native on Windows and MacOS. This meant that the software often came off foreign and outdated.

Bad UIs bothered Junior a lot more than many of his peers. In order to make Java programs beautiful, he would go through trouble after trouble. In those days it meant doing a bunch of black magic with PNGs to make Java programs feel natural. But once Junior went through the trouble he saw how users reacted, and he knew it was worth it.

# To discovering a love of Design

Junior felt it in his bones that when you make apps beautiful, it’s not just about cosmetics. It’s about building something accessible and intuitive. People use intuitive software differently and it has a meaningful effect on their lives. After all, many of us use software for hours a day.

This is when Junior realized that programming wasn’t his only passion. He loved design too.

After writing apps in Java, he moved onto web technologies. Soon Junior started building a side project: he wanted to make it easy for developers to build portfolio sites.

# To 25,000 stars on GitHub

To help developers build portfolio sites, Junior knew he’d need to use a series of shareable components. He couldn’t find anything that fit his needs, so he started to build them from scratch.

Junior built component after component. He made sure that every primitive was accessible, came with animations, and all the best practices that delight users. Soon Junior realized that he was building a full component system.

In early 2021, Junior packaged everything together and released HeroUI components (formerly NextUI). He was floored by the reception.

![](/posts/heroui/stars.png)

Developers loved HeroUI components. **Within a year, it hit 3000 stars. Within 2 years, 9000 stars. Today, over 25,000 stars.**

# To the first check

GitHub stars grew, but it didn’t mean the journey was easy.

Junior had a full-time job, which meant he did all of this work on nights and weekends. When he had doubts, Junior had his wife’s belief to fall back too. He would get energized and then focus on users.

One user reached out and surprised Junior. Turns out Vicente Zavarce was a happy HeroUI user. He was also the founder Yummy, one of Latin America’s biggest startups.

Vicente wanted meet the team behind the components and scheduled a call. He was expecting to see a large group, but he just found Junior.

Vicente was so impressed that he offered to make an investment. That kicked off a pre-seed round and HeroUI became a company. Junior could now focus full time on making it easy to create beautiful apps.

# To YC S24

What followed was a flurry of work. HeroUI kept getting better. Junior and his team launched support for Tailwind and started to work on a series of pro components.

When the team was building a checkout page for pro components, they released a secret URL to dogfood it. Users were so excited that they actually found the link and started buying.

At this point Junior knew he had to grow the team. So he applied to YCombinator.

Junior had no expectations, but YC saw the potential in him and in HeroUI. The YC partners know how hard it was to build a startup as a solo founder, and Junior was a solo founder. But after meeting him, the partners were convinced that he could do it, and HeroUI joined YC S24.

# To HeroUI Chat

Being surrounded by such talented people, Junior was invigorated and kept making HeroUI better. At this point he was able to hire some of the best HeroUI contributors full-time, and they were full-steam ahead.

During YC they started off by building a tool to help companies with design systems. They built the product, but the more they talked to users, the more they realized they actually wanted something else.

Users wanted help building their UIs. At this point Claude Sonnet 3 had come out. That’s when Junior thought, **what if you could use AI to help you create truly beautiful UIs?** That got Junior and the team excited. So they started building <a target="_blank" href="https://heroui.chat/">HeroUI Chat</a>.

## Optimizing for speed

The first step was to decide how to build it. If you’re making an app that helps users make beautiful apps, you better make sure the app itself is beautiful.

Junior was confident in the UI. He wanted to make sure the backend felt great too:

> I was obsessed with speed. I wanted HeroUI chat to be really fast. Creating a new conversation, modifying a title, every tiny detail should feel fast.
>
> Junior Garcia

They did an investigation, and they listed out what they needed to make apps feel fast. They would have to leverage the browser and work with IndexedDB. They would have to add caches and build out a suite of optimistic updates.

Most of the solutions they found were too constraining: either they were full frameworks, or they were exceptionally difficult to use. So they decided they would build a sync engine from scratch. Until they found Instant.

## Finding Instant: A fast _and_ realtime MVP in 2 days

Junior was scrolling Bookface, when he saw a post about Instant’s infra:

> Not only did you have the optimistic updates I was looking for, but you had the real-time updates. You handled collisions too. Basically everything we were worried about.
>
> Junior Garcia

Instant looked like an exact fit, so they decided to give it a try. **Within 2 days, HeroUI had a full MVP on Instant.** When we asked Junior how he thought about Instant after that, he answered:

> At that point I did not want to use any database other than Instant
>
> Junior Garcia

Junior and the team had used Firebase before, and knew how difficult it was to build apps when you don’t have relations. They were very happy with Instant’s relational query engine.

And the optimistic updates had paid off too. Many HeroUI users (and employees) lived across continents. Instant’s local caches made people feel like everything fast, without Junior and team having to worry about setting up replicas across the globe.

## Hitting #1 on Product Hunt

With the right infra in place, they could focus on their product, and they made a tool that was truly useful. They <a href="https://www.producthunt.com/products/heroui-chat/launches/heroui-chat" target="_blank">launched</a> on Product Hunt, and hit #1 for the day.

[!video](https://www.youtube.com/watch?v=rRT9lZfJjR0 'HeroUI Demo')

Users could build delightful UIs. Since everything was on top of hand-crafted components, AIs could focus on writing simpler code, which was easier for humans to maintain. And whenever AIs made a mistake, Junior and the team would jump and fix it in the platform.

This flywheel of improvement kept on going and making HeroUI better.

## The productivity benefits of real-time sync

Instant made it easy to build it MVP, but the HeroUI team saw that Instant helped them scale too. The biggest lever came from the client-side abstraction.

In traditional apps every feature requires (a) a frontend change (b) an update to the store (c) an update to endpoints, and (d) an update on the database. With Instant, all of this compressed to one change. This meant the codebase was easier for engineers to onboard too, and features were simpler to implement.

When we asked Junior what he would missed the most if he couldn’t use Instant anymore, this abstraction was what he mentioned:

> I think I couldn't deal with the frontend-backend request schlep anymore. Having to call an endpoint, send data, receive data, update the UI, handle the update, handle the rollback. Instant just does this automatically. You don't have to communicate to the backend, or listen to changes. Losing this would make our lives so much harder on Hero.
>
> Junior Garcia

# From UIs to full apps

It’s been 5 years of work, but Junior and the team are just getting started. Today developers, business owners, and big companies use HeroUI to build full frontends. But HeroUI keeps getting better faster.

Soon you’ll be able to build full-stack web apps and mobile apps, with the same design system across platforms. HeroUI keeps marching towards the same goal — to help make all apps beautiful — and we are so excited to support them!

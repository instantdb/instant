---
title: 'GPT 5.2 on the Counter-Strike Benchmark'
date: '2025-12-12'
authors: stopachka
---

About 2 weeks ago we asked all the latest AI models to a basic version of Counter Strike. The game had to be a 3D UI and it had to be multiplayer. They did a pretty [good job](/essays/agents_building_counterstrike).

Well GPT 5.2 just came out. How does it do building Counter-Strike? We tried and found out.

**Here's the TL:DR:** Even though GPT 5.2 is not a coding model, it did better than Codex 5.1 Max on almost every prompt. GPT 5.2 was still behind Claude on frontend changes, but it began to go toe-to-toe with Gemini on the backend.

Want to try the Counter-Strike GPT 5.2 built? Here are the links:

1. **Version 1**: https://codex52strike.vercel.app/
2. **Version 2: De Dust2**: https://codex52dust.vercel.app/

Here's a full video of us going through the build [here](https://www.youtube.com/watch?v=MeKBO9QOUFA), but for those who prefer text you get this post.

## Overview

We evaluated GPT 5 on the Codex CLI set to medium. [^]. All prompts were the same as our last benchmark post.

Take a look at how the leaderboard changed with GPT 5.2:

<gpt52-leaderboard></gpt52-leaderboard>

Claude still holds the top position on frontend changes (maps, characters, and threejs). But GPT 5.2 did much better than it's predecessor overall. The frontend changes were better, and the backend changes were about as good as Gemini: both of them effectively one shotted multiplayer positions, shots, and maps.

## 1. Boxes and Physics

The first thing we asked it to do was build a basic 3d map with polygons.

> **Prompt**
>
> I want you to create a browser-based version of counter strike, using three js.
>
> For now, just make this local: don't worry about backends, Instant, or
> anything like that.
>
> For the first version, just make the main character a first-person view with
> a cross hair. Put enemies at random places. Enemies have HP. You can
> shoot them, and kill them. When an enemy is killed, they respawn.
>
> Make everything simple polygons -- rectangles.

GPT 5.2 got one type error in it's first try. But we pasted the error back it built a working frontend.

Here's a side-by-side view of Codex Max 5.1 vs GPT 5.2:

[CODEX] | [GPT 5.2]

GPT 5.2 makes clear improvement over Codex 5.1 Max. If you compare this to Claude and Gemini, we think Claude still did the best job (the map and the lighting look more interesting), but at this point it feels like GPT 5.2 did about as well as Gemini.

[PREV]

## 2. Characters

The next challenge was to make the characters more interested. Instead of a simple box, we wanted enemis that looked like people:

> **Prompt**
>
> I want you to make the enemies look more like people. Use a bunch of square polygons to represent a person, and maybe a little gun

Here's what GPT 5.2 built in one shot, compared to 5.1 Max:

[CODEX] | [GPT 5.2]

That's a noticeable improvement in our book. If you compare to Claude and Gemini, it feels like Claude still wins, but GPT 5.2 is about as good as Gemini again:

[PREV]

## 3. Gun in our field-of-view

Next up was adding a gun in our field of view alongside an animation when we shoot:

> **Prompt**
>
> I want you to make it so I also have a gun in my field of view. When I shoot, the gun moves a bit.

We didn't notice much of an improvement here. In fact, GPT 5.2 had an error, when 5.1 Max got it done in one shot. Here's 5.1 max and 5.2 side by side:

[CODEX] | [GPT 5.2]

 t's interesting to note that the error it had was similar to Gemini's (troubles attaching the gun to the field of view).

[PREV]

In our last test Gemini 3 Pro got really stuck here, so despite the slight error from 5.2, the rankings didn't change.

## 3.Adding sounds and animations

The final challenge for the frontend was sounds and animations:

> **Prompt**
> I want you to use chiptunes to animate the sound of shots. I also want to animate deaths.

Here's 5.2's attempt:

[CODEX] | [GPT 5.2]

We didn't change the ratings here. We like the 5.2's animation, but Claude's version still felt more interesting.

[PREV]

## 4. Sharing positions

Things started to change when time came to add the backend! Goal 1 was to just make it so we shared positions for each player:

> **Prompt**
>
> I want you to use Instant presence.
> Don't save anything in the database, just use presence and topics. You can look up the docs.
> There should should just be one single room.
> You no longer the need to have the enemies that are randomly placed. All the players are what get placed.
> For now, don't worry about shots. Let's just make it so the positions of the players are what get set in presence.

Previously Codex 5.1 Max needed a few iterations to get things right. Codex 5.1 got this done out of the box.

[leaderboard-but-just-this-bit]

It was interesting to note that like Codex, GPT 5.2 was the rate model that relied _very_ heavily on REPLing to understand an API, rather than reading docs.
## 5. Sharing shots

Next up was making sure shots worked.

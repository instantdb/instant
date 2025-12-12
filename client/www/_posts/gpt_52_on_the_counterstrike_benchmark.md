---
title: 'GPT 5.2 on the Counter-Strike Benchmark'
date: '2025-12-12'
authors: stopachka
---

About 2 weeks ago we asked Codex 5.1 Max, Claude 4.5 Opus, and Gemini 3 Pro to [build Counter Strike](/essays/agents_building_counterstrike). It had to be a 3D UI, and it had to be multiplayer.

How good of a job does GPT 5.2 do at this task?

**Here's the TL:DR:** Even though GPT 5.2 is not a coding model, it did better than Codex 5.1 Max on almost every prompt. GPT 5.2 was still behind Claude on frontend changes, but it began to go toe-to-toe with Gemini on the backend.

You can try out the version that GPT 5.2 built here:

1. **GPT 5.2's first attempt**: https://codex52strike.vercel.app/
2. **A second version with a map reminiscient of de dust 2**: https://codex52dust.vercel.app/

Here's a full [video](https://www.youtube.com/watch?v=MeKBO9QOUFA) of us going through the build, but for those who prefer text you get this post.

## Overview

We evaluated GPT 5 on the Codex CLI set to medium. [^1]. All prompts were the same as our last benchmark post. Take a look at how the leaderboard [^2] changed with GPT 5.2:

<gpt52-leaderboard></gpt52-leaderboard>

Claude still holds the top position on frontend changes (maps, characters, and threejs).

But GPT 5.2 did much better than it's predecessor overall. GPT 5.2's frontend changes were noticeably better than Codex 5.1 Max.

And the backend changes were about as good as Gemini 3 Pro: both of them effectively one shotted multiplayer positions, shots, and maps.

You can see for yourself: let's dive into the prompts.

## 1. Boxes and Physics

The first thing we asked it to do was build a basic 3D map with polygons.

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

Here's GPT 5.2 versus it's predecessor:

| Codex 5.1 Max                                     | GPT 5.2                                            |
| ------------------------------------------------- | -------------------------------------------------- |
| ![](/posts/counter_strike/map_codex.png?lightbox) | ![](/posts/counter_strike_52/map_gpt52.png?lightbox) |

GPT 5.2 makes clear improvement over Codex 5.1 Max. If you compare this to Claude and Gemini, we think Claude still did the best job. The map and the lighting look the most interesting. But at this point it feels like GPT 5.2 did about as well as Gemini:

| Claude 4.5 Opus                                             | Gemini 3 Pro                                             |
| -------------------------------------------------- | -------------------------------------------------- |
| ![](/posts/counter_strike/map_claude.png?lightbox) | ![](/posts/counter_strike/map_gemini.png?lightbox) |


## 2. Characters

The next challenge was to make the characters more interesting. Instead of a simple box, we wanted enemis that looked like people:

> **Prompt**
>
> I want you to make the enemies look more like people. Use a bunch of square polygons to represent a person, and maybe a little gun

GPT 5.2 improved a bunch here:

| Codex 5.1 Max                                             | GPT 5.2                                        |
| --------------------------------------------------- | ---------------------------------------------------- |
| ![](/posts/counter_strike/enemy_codex.png?lightbox) | ![](/posts/counter_strike_52/character_gpt52.png?lightbox) |

That's a noticeable improvement in our book. If you compare to Claude and Gemini, it feels like Claude still wins, but GPT 5.2 is about as good as Gemini again:

| Codex                                               | Claude                                               | Gemini                                               |
| --------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| ![](/posts/counter_strike/enemy_codex.png?lightbox) | ![](/posts/counter_strike/enemy_claude.png?lightbox) | ![](/posts/counter_strike/enemy_gemini.png?lightbox) |


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

Next up was making sure shots worked. GPT 5.2 got a lot better with making shots work.

> **Prompt**
>
> Now let's make shots work. When I shoot, send the shot as a topic, and make it affect the target's HP. When the target HP goes to zero, they should die and respawn.

Just like Claude, it got this done in one shot. Codex 5.1 Max needed quite a few tries getting the API right.

[leaderboard-but-just-this-bit]

## 6. Maps

The final part of the game was to build maps. This included creating schema, seeding data, and making sure permissions worked.

> **Prompt**
>
> So, now I want you to make it so the front page is actually a list of maps. Since our UI is using lots of polygons, make the style kind of polygonish
Make the UI look like the old counter strike map selection screen. I want you to save these maps in the database. Each map has a name. Use a script to generate 5 random maps with cool names.
> Then, push up some permissions so that anyone can view maps, but they cannot create or edit them.
> When you join a map, you can just use the map id as the room id for presence.

GPT 5.2 improved quite from it's predecessor. It got everything done in one shot. We think Gemini's UI is a bit better, but the backends were similar.

One surprise here though, was that GPT 5.2 was a lot more sheepish about running CLI commands. It simply asked us to run the commands for it. We first thought this was a gotcha for Instant, but after prodding it to push it's changes to Vercel, it made the same mistake.

## Finishing thoughts

GPT 5.2 did do better than Codex 5.1 Max. It chose some surprising steps (like using REPLs instead of reading docs, or sharing commands rather than running them), but overall it did a good job. We're excited to see how the 5.2 codex model feels.


[^1]: You may ask: why medium? Lots of hackers prefer using `high`. For now we choose whatever the CLI default is. We didn't want to start customizing CLIs and introduce bias that way.

[^2]: A bit of a revealed preference in this leaderboard: we vibe-coded the animations using Claude 4.5 Opus.

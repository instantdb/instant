---
title: 'Codex, Opus, Gemini try to build Counter Strike'
date: '2025-11-26'
authors: stopachka
summary: 'Introducing CS Bench: we ask all top models to build a multiplayer Counter-Strike from scratch.'
thumbnail: /img/essays/agents_building_counterstrike.jpg
hero: /img/essays/agents_building_counterstrike.jpg
---

In the last week we’ve had three major model updates: Gemini 3 Pro, Codex Max 5.1, Claude Opus 4.5. We thought we’d give them a challenge:

**Build a basic version of Counter Strike.** The game had to be a 3D UI and it had to be multiplayer.

If you're curious, pop open (an ideally large computer screen) and you can try out each model's handiwork yourself:

1. **Codex Max 5.1**: https://cscodex.vercel.app/
1. **Claude Opus 4.5**: https://csclaude.vercel.app/
1. **Gemini 3 Pro**: https://csgemini.vercel.app/

We have a full video of us going through the build [here](https://youtu.be/fm-OoCWQlmc), but for those who prefer text, you get this post.

We'll go over some of our high-level impressions on each model, then dive deeper into the performance of specific prompts.

## The Setup

We signed up for the highest-tier plan on each model provider and used the defaults set for their CLI. For Codex, that’s 5.1 codex-max on the medium setting. For Claude it’s Opus 4.5. And with Gemini it's 3 pro.

We then gave each model about 7 consecutive prompts. Prompts were divided into two categories:

**Frontend:** At first agents only having to worry about the game mechanics. Design the scene, the enemies, the logic for shooting, and some sound effects.

**Backend:** Once that was done agents would then make the game multiplayer. They would need to build be selection of rooms. Users could join them and start shooting.

## A High-Level Overview

So, how'd each model do?

In a familiar tune with the other Anthropic models, **Opus 4.5 won out on the frontend**. It made nicer maps, nicer characters, nicer guns, and generally had the right scene from the get-go.

Once the design was done, **Gemini 3 Pro started to win in the backend**. It got less errors adding multiplayer and persistence. In general Gemini did the best with making logical rather than visual changes.

**Codex Max felt like an “in-between” model on both frontend and backend.** It got a lot of “2nd place” points in our book. It did reasonably well on the frontend and reasonably well on the backend, but felt less spikey then the other models.

Here’s the scorecard in detail:

|                   | Codex | Claude | Gemini |
| ----------------- | ----- | ------ | ------ |
| **Frontend**      |       |        |        |
| Boxes + Physics   | 🥉    | 🥇     | 🥈     |
| Characters + guns | 🥉    | 🥇     | 🥈     |
| POV gun           | 🥈    | 🥇     | 🥉     |
| Sounds            | 🥈    | 🥇     | 🥈     |
| **Backend**       |       |        |        |
| Moving            | 🥈    | 🥉     | 🥇     |
| Shooting          | 🥉    | 🥇     | 🥉     |
| Saving rooms      | 🥈    | 🥉     | 🥇     |
| **Bonus**         | 🥈    | 🥉     | 🥇     |

Okay, now let’s get deeper into each prompt.

# 1. Boxes and Physics

Goal number 1 was to set up the physics for the game. Models needed to design a map with a first-person viewpoint, and the ability to shoot enemies.

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

Here’s a side-by-side comparison of the visuals each model came up with:

| Codex                                             | Claude                                             | Gemini                                             |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| ![](/posts/counter_strike/map_codex.png?lightbox) | ![](/posts/counter_strike/map_claude.png?lightbox) | ![](/posts/counter_strike/map_gemini.png?lightbox) |

Visually Claude came up with the most interesting map. There were obstacles, a nice floor, and you could see everything well.

Gemini got the something nice working too.

Codex had an error on it’s first run [^1] (it called a function without importing it), but it fixed it real quick. Once bugs were fixed, it’s map was the least visually pleasing. Things were darker, there were no obstacles, and it was hard to tell the floor.

# 2. Characters

Now that we had a map and some polygons, we asked the models to style up the characters. This was our prompt:

> I want you to make the enemies look more like people. Use a bunch of square polygons to represent a person, and maybe a little gun

Here’s the result of their work:

| Codex                                               | Claude                                               | Gemini                                               |
| --------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| ![](/posts/counter_strike/enemy_codex.png?lightbox) | ![](/posts/counter_strike/enemy_claude.png?lightbox) | ![](/posts/counter_strike/enemy_gemini.png?lightbox) |

Again it feels like Claude did the best job here. The character look quite human — almost at the level of design in Minecraft. Gemini did well too. Codex made it’s characters better, but everything was a single color, which really diminished it compared to the others.

# 3. Gun in our field-of-view

We then asked each model to add a gun to our first-person view. When we shoot, we wanted a recoil animation.

> I want you to make it so I also have a gun in my field of view. When I shoot, the gun moves a bit.

Here’s the side-by-side of how the recoil felt for each model:

| Codex                                                | Claude                                                | Gemini                                                |
| ---------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| ![](/posts/counter_strike/recoil_codex.gif?lightbox) | ![](/posts/counter_strike/recoil_claude.gif?lightbox) | ![](/posts/counter_strike/recoil_gemini.gif?lightbox) |

Here both Claude and Codex got the gun working in one shot. Claude’s gone looks like a real darn pistol though.

Gemini had an issue trying to stick the gun to the camera. This got us in quite a back and forth, until we realized that the gun was transparent.

# 4. Adding sounds…and animations

We were almost done the frontend: the final step was sound. Here’s what we asked:

> I want you to use chiptunes to animate the sound of shots. I also want to animate deaths.

All models added sounds pretty easily. The ending part in our prompt: “I also want to animate deaths.” was added at the spur of the moment in the video. Our intention was to add sound to deaths. _But_ that’s not what happened.

All 3 models misunderstood the sentence in in the same way: they thought the wanted to animate how the characters died. Fair enough, re-reading the sentence again, we would understand it that way too.

Here’s the results they came up with:

<div class="essay-breakout grid grid-cols-1 gap-4 md:grid-cols-3">
  <div>
    <div class="text-center font-mono text-sm font-bold">Codex</div>
    <iframe
      src="https://player.mux.com/UTCslk3hyNOnXSVlZmodcIqkFoHwgkPIl007aJxQINJ00?metadata-video-title=sound_codex&video-title=sound_codex"
      style="width: 100%; border: none; aspect-ratio: 885/626;"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowfullscreen
    ></iframe>
  </div>
  <div>
    <div class="text-center font-mono text-sm font-bold">Claude</div>
    <iframe
      src="https://player.mux.com/E2bse7dt01Pap3Yrwr9aKyr00Hxw7pV5rXsJSMIx006TqM?metadata-video-title=sound_claude&video-title=sound_claude"
      style="width: 100%; border: none; aspect-ratio: 769/631;"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowfullscreen
    ></iframe>
  </div>
  <div>
    <div class="text-center font-mono text-sm font-bold">Gemini</div>
    <iframe
      src="https://player.mux.com/knIuqiEW9yVL4FB6BOCHl02102026GX4ZakdwIYb01y7WNg?metadata-video-title=sound_gemini&video-title=sound_gemini"
      style="width: 100%; border: none; aspect-ratio: 943/663;"
      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
      allowfullscreen
    ></iframe>
  </div>
</div>

All the models got the sound done easily. They all got animations, but we thought Claude’s animation felt the most fun.

# 5. Sharing positions

Now that all models had a real frontend, we asked them to make it multiplayer.

We didn’t want the models to worry about shots just yet: goal 1 was to share the movement positions. Here’s what we asked it to do:

> I want you to use Instant presence.
>
> Don't save anything in the database, just use presence and topics. You can
> look up the docs.
>
> There should should just be one single room.
>
> You no longer the need to have the enemies that are randomly placed. All the players are what get placed.
>
> For now, don't worry about shots. Let's just make it so the positions of the players are what get set in presence.

Gemini got this right in one shot. Both Codex and Claude needed some more prodding.

|        | Codex | Claude | Gemini |
| ------ | ----- | ------ | ------ |
| Moving | 🥈    | 🥉     | 🥇     |

It was interesting to see how each model tried to solve problems:

Codex used _lots_ of introspection. It would constantly look at the typescript library and look at the functions that were available. It didn’t seem to look at the docs as much.

Claude looks at the docs a bunch. It read and re-read our docs on presence, but rarely introspected the library like Codex did.

Gemini seemed to do both. It looked at the docs, but then I think because it constantly ran the build step, it found any typescript errors it had, and fixed it up.

Gemini made the fastest progress here, though all of them got through, as long as we pasted the errors back.

# 6. Making shots work

Then we moved to getting shots to work. Here was the prompt:

> Now let's make shots work. When I shoot, send the shot as a topic, and
> make it affect the target's HP. When the target HP goes to zero, they should die and respawn.

|          | Codex | Claude | Gemini |
| -------- | ----- | ------ | ------ |
| Shooting | 🥉    | 🥇     | 🥈     |

Claude got this right in one shot. Gemini and Codex had a few issues to fix, but just pasting the errors got them though.

# 7. Multiple maps

Now that all models had a single room working, it was time to get them supporting _multiple_ rooms.

The reason we added this challenge, was to see (a) how they would deal with a new API (persistence), and (b) how they would deal with the refactor necessary for multiple rooms.

> So, now I want you to make it so the front page is actually a list of
> maps. Since our UI is using lots of polygons, make the style kind of
> polygonish
>
> Make the UI look like the old counter strike map selection screen.
> I want you to save these `maps` in the database. Each map has a name.
> Use a script to generate 5 random maps with cool names.
>
> Then, push up some permissions so that anyone can view maps, but they cannot
> create or edit them.
>
> When you join a map, you can just use the map id as the room id for
> presence.

## The maps UI

All models did great with the UI. Here’s how each looked:

| Codex                                            | Claude                                            | Gemini                                            |
| ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------- |
| ![](/posts/counter_strike/ui_codex.png?lightbox) | ![](/posts/counter_strike/ui_claude.png?lightbox) | ![](/posts/counter_strike/ui_gemini.png?lightbox) |

We kind of like Gemini’s UI the most, but they were all pretty cool.

## The Persistence

And the persistence worked well too. They all dutifully created schema for maps, pushed a migration, and seeded 5 maps.

## The Refactor

_But_ things got complicated in the refactor.

|              | gpt 5.1 codex max (medium) | Claude 4.5 Opus | Gemini 3 Pro |
| ------------ | -------------------------- | --------------- | ------------ |
| Saving rooms | 🥈                         | 🥉              | 🥇           |

Gemini got things done in one shot. It also chose to keep the map id in the URL, which made it much handier to use. Codex took one back and forth with a query error.

But Claude _really_ got stuck. The culprit was hooks. Because useEffect can run multiple times, it ended up having a few very subtle bugs. For example, it made 2 canvas objects instead of 1. It also had multiple animation refs running at once.

It was hard to get it to fix things by itself. We had to put our engineer hats on and actually look at the code to unblock Claude here.

This did give us a few ideas though:

1. Claude’s issues were human-like. How many of us get tripped up with useEffect running twice, or getting dependency arrays wrong? I think improving the React DX on these two issues could really push humans and agents further.
2. And would have happened if a non-programmer was building this? They would have gotten really stuck. We think there needs to be more tools to go from “strictly vibe coding”, to “real programming”. Right now the jump feels too steep.

At the end, all models built real a multiplayer FPS, with zero code written by hand! That’s pretty darn cool.

## Parting thoughts

Well, models have definitely improved. They can take much higher-level feedback, and much higher-level documentation. What really strikes us though is how much they can iterate on their own work thanks to the CLI.

There’s still lots to go though. The promise that you never have to look at the code doesn’t quite feel real yet.

[^1]: Interestingly, Gemini was very eager to run `npm run build` over and over again, before terminating. Codex did not do this, and Claude did this more sparingly. This may explain why Gemini got fewer errors.

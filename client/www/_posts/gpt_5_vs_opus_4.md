---
title: GPT 5 vs Opus 4.1 for Vibe-Coded Apps
date: '2025-08-08'
authors: stopachka
---

How do GPT-5 and Opus 4.1 perform with building apps? To find out I asked them both to build a full stack app for making chiptunes in Instant. Here’s the prompt I used:

> Create a chiptunes app.
>
> - Log in with magic codes
> - Users should be able to compose songs
> - Users should be able to share songs
> - Users can only edit their own songs
> - Make the theme really cool
> - Let’s keep everything under 1000 lines of code.

I recorded myself going through the process in this [video](https://youtu.be/yzjC0wcMvxI). In this post I’ll share the results and some of the surprises I discovered when prompting!

# GPT5’s work

Here’s the result that GPT-5 came up with: https://gpt5-chiptunes.vercel.app/

You can log in, create songs, and share them. This was my creation:

<demo-iframe uri="https://gpt5-chiptunes.vercel.app/song/3b527d40-abab-43bc-ad82-61ad0f22b12c"></demo-iframe>

# Opus’ Work

And this is what Opus came up with: https://opus-chiptunes.vercel.app/

We needed a few more prompts to get sharing working, but once it did, here’s one song our co-founder Joe came up with:

<demo-iframe uri="https://opus-chiptunes.vercel.app/?song=79a4353d-8886-44a3-b905-b57b7bae27fd"></demo-iframe>

# How much got done in one shot

Both models got a _lot_ done in one shot.

| **What got done in one shot** |           |          |
| ----------------------------- | --------- | -------- |
|                               | **GPT-5** | **Opus** |
| Schema?                       | ✅        | ✅       |
| Permissions?                  | ✅        | ✅       |
| Create songs?                 | ✅        | ✅       |
| Share Songs?                  | ✅        | ❌       |
| UI?                           | ❌        | ✅       |

They both figured out auth, data models, permissions, and at least the flow to create songs in one go.

**One difference is that GPT-5 was able to get song sharing work in one shot.** Opus needed two additional nudges to get there. Initially Opus talked about making songs shareable, but did not actually implement it. First Opus added support for sharing songs, but gated it to logged in users. A second prompt helped Opus open songs for public consumption.

**However, Opus’ UI was more slick.** I do think OpenAI improved UI skills a lot compared to their earlier models. For now I think Opus has the edge.

# Hiccups

Both models made a few errors before the projects built. Here’s how that looked:

| **Places the models had an error** |           |          |
| ---------------------------------- | --------- | -------- |
|                                    | **GPT-5** | **Opus** |
| db.SignedIn?                       | 🐛        | ✅       |
| Query Issues?                      | ✅        | 🐛       |
| Next Query Params?                 | 🐛        | 🐛       |

Both models made about 2 errors. **They were all related with new features.** Next.js has a new flow for query params, and Instant just added a `db.SignedIn` component.

But **both models fixed errors in one shot**. All they needed was for a user to paste an error message and they were able to solve it.

It was interesting to see how GPT-5 made an error with "db.SignedIn". Instructions for how to use it were already included in the [rules.md](https://www.instantdb.com/mcp-tutorial/cursor-rules.md) file. I think this is related to how closely the models follow rules.

**Opus seemed to follow the rule file more closely**. It used the same pattern for "profiles" that we gave it, and skipped past the "db.SignedIn" bug. On the other hand, **GPT-5 followed the rules file less closely**. As a result it hit a bug that was explicitly warned against in the rules. However, it also skipped past adding a "profiles" namespace. Objectively that leads to a smaller schema, and still hits the requirements that we started out with.

# What a change in 4 months…

We actually ran the same test in April.

We compared o4-mini with Claude 3 Sonnet. o4-mini made a barebones version (see [here](https://codex-chiptunes.vercel.app/)). Sonnet made a good UI but couldn’t actually write the backend logic.

Now both apps look pretty cool, both apps have auth, permissions, and a much slicker way to compose songs. You can take a look at the source files the new models generated. This is [GPT-5 source](https://github.com/stopachka/gpt-5-chiptunes), This is [Opus source](https://github.com/stopachka/opus-chiptunes).

In the last few months it feels like Claude and Claude Code have been the dominant choice for vibe coding apps. With the new GPT5 model it feels like the gap is closing.

Really interesting times ahead!

# A plug for Instant

I am biased, but it’s really cool to see how Instant can sing with LLMs. It comes with lots of abstractions, so LLMs can write less code that’s easier to review.

If you actually want to look at the code your LLMs write, I think Instant is one of the best infrastructure bets you can make. Give us a try

---

_Thanks to Joe Averbukh, Daniel Woelfel for reviewing drafts of this post_

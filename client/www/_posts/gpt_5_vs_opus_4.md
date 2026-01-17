---
title: GPT 5 vs Opus 4.1 for Vibe-Coded Apps
date: '2025-08-08'
authors: stopachka
---

> We're InstantDB, we make it easy to add a backend with auth, file storage, and
> real-time updates to your web and mobile apps.

I've been seeing posts comparing GPT-5 and Sonnet, but thought comparing GPT-5
and Opus 4.1 would be more interesting!

So how do GPT-5 and Opus 4.1 perform with building apps? To find out I asked them both to build a full stack app for making chiptunes in Instant. Here’s the prompt I used:

```
Create a chiptunes app.

- Log in with magic codes
- Users should be able to compose songs
- Users should be able to share songs
- Users can only edit their own songs
- Make the theme really cool
- Let’s keep everything under 1000 lines of code.
```

I recorded myself going through the process in this <a href="https://youtu.be/yzjC0wcMvxI" target="_blank">video</a>. In this post I’ll share the results and some of the surprises I discovered when prompting!

# What a change in 4 months…

We actually ran the same test in April. We compared o4-mini with Claude 3 Sonnet. o4-mini made a barebones version (see <a href="https://codex-chiptunes.vercel.app/" target="_blank">here</a>). Sonnet made a good UI but couldn’t actually write the backend logic.

Now both apps look pretty cool, both apps have auth, permissions, and a much slicker way to compose songs.

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

**One difference is that GPT-5 was able to get song sharing working in one shot.** Opus needed two additional nudges to get there. Initially Opus talked about making songs shareable, but did not actually implement it. First Opus added support for sharing songs, but gated it to logged in users. A second prompt helped Opus open songs for public consumption.

**However, Opus’ UI was more slick.** You can also see that GPT-5's UI has some responsiveness issues on mobile. I do think OpenAI improved UI skills a lot compared to their earlier models. For now I think Opus has the edge in UI.

# Hiccups

Both models made a few errors before the projects built. Here’s how that looked:

| **Places the models had an error** |           |          |
| ---------------------------------- | --------- | -------- |
|                                    | **GPT-5** | **Opus** |
| db.SignedIn?                       | ❌        | ✅       |
| Query Issues?                      | ✅        | ❌       |
| Next Query Params?                 | ❌        | ❌       |

Both models made about 2 errors. **All errors were all related to new features.** Next.js has a new flow for query params, and Instant just added a "db.SignedIn" component.

But **both models fixed all errors in one shot**. They just needed me to paste an error message and they were able to solve it.

It was interesting to see how GPT-5 made an error with "db.SignedIn". Instructions for how to use it were already included in the <a href="https://www.instantdb.com/llm-rules/next/cursor-rules.md" target="_blank">rules.md</a> file. I think this is related to how closely the models follow rules.

**Opus seemed to follow the rule file more closely, while GPT-5 seems to explore more**. Opus used the exact same patterns that provided in the rules file. This let them skip past the "db.SignedIn" bug. On the other hand, GPT-5 seemed to be more free with what it tried. It did get more bugs, but it wrote code that was objectively more "different" then the examples that we provided. In one case, it wrote a simpler schema file.

# Gaps are closing

This is <a href="https://github.com/stopachka/gpt-5-chiptunes" target="_blank">GPT-5 source</a>, and this is the <a href="https://github.com/stopachka/opus-chiptunes" target="_blank">Opus source</a>. In the last few months it feels like Claude and Claude Code have been the dominant choice for vibe coding apps. With the new GPT5 model it feels like the gap is closing.

Really interesting times ahead!

---

_Thanks to Joe Averbukh, Daniel Woelfel for reviewing drafts of this post_

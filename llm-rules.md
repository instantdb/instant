You are an expert developer on the InstantDB team. You write clean and concise code. You make sure you
follow the style of the codebase you are working on. You write code that is easy
to read and understand.

# About InstantDB

Instant is the Modern Firebase. With Instant you can easily build realtime and
collaborative apps. You can get started for free at https://instantdb.com

# InstantDB Monorepo

This monorepo contains the source code for the InstantDB platform, including:

* client - The InstantDB client libraries for JavaScript, React, and React
  Native.
* server - The InstantDB server implementation in clojure that powers the
  backend.
* examples - Starter apps and example codebases demonstrating how to use InstantDB
  in various frameworks and environments.

# Writing Prose

Whenever writing prose for docs, announcments, or marketing materials you should
follow the style of those existing materials. You should also avoid tell-tale
signs of AI generated content like em-dashes.

# Writing an Announcement

If I ask you to make an announcement post can you do it in the style of how we usually do
announcements? You can see some example announcements in claude-docs/announcements

# Writing tweets / tweetstorm

Whenever I ask you to make tweets/tweetstorm look at claude-docs/tweets for our style of writing tweets.

Note: With twitter we should minimize useage of backticks and only use them for
code snippets. We should also avoid using double dashes and emojis as they are a common
sign of AI generated content.

## Best practices for announcements

* Use bullets for separate sections instead of headers
* If something is in a code block it doesn't need to be bolded or italicized

# Writing a team spec

If I ask you to write a spec for my team can you do it in the style how we
usually write specs? These specs are different than the spec we would write for
implementing. They are more high level and make it easy for the team to align on
the proposed solution before we implement. You can see some example specs in
claude-docs/specs

# Removing Slop

After you have a working solution you should go back and remove any slop in the
code. This includes any console logs, commented out code, or any code that is
not necessary for the final implementation. The code should be clean and easy to
read.

When reviewing code for removing slop be wary of aggresively abstracting components. If something is indeed repeated across multiple pages/screens/components etc. then it makes sense. But if it's only used once or twice, the abstraction may not be worth the cognitive overhead

# Checking your work

Do not run `pnpm build` to check your work. I'm running a live server and doing
`next build` will interrupt my workflow. Instead you can just check types by
doing `pnpm exec tsc --noEmit 2>&1`

# Updating Rules
Whenever working with the instant-rules (./client/www/lib/intern/instant-rules.md) keep the following in mind:

## Be concise but helpful
Instant rules are meant to give context to LLM agents about how to correctly use
Instant. They are not exhaustive documenation. We should write enough to be
complete but not waste tokens. Keep in the style of the existing document.

## Copying rules
If I ever ask you to copy our rules file to our example templates you can do so
via the following command

cd ./client/www && pnpm exec tsx scripts/gen-llm-rules.ts

# Updating docs
We should do our best to follow the style of existing docs when writing or
updating docs.

Never mention backwards compatibility in the docs. This is an implementation
detail that doesn't need to be exposed to users.

We should also never use double-dashes in our docs. This is a common sign of AI generated content and we want to avoid it. Instead we can use colons,
parentheses, or just break up sentences into multiple sentences.

# Saving screenshots

When you're asked to save screenshots related to some feature, announcement,
etc. put them in their own directory. This is especially useful when I'm
asking you to make mulitple screenshots

To learn about how to do this, read ./llm-docs/code-screenshot-skill.md
Save them in ./llm-docs/screenshots

# Querying InstantDB tables (e.g. for debugging the system)

Read ./llm-docs/prompts/query-local-postgres.md for context on how to query the local Postgres instance that InstantDB uses for storage. This is useful for debugging and verifying the state of the system.

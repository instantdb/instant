---
title: Using Instant with LLMs
description: How to use Instant with LLMs
---

To make it easier to use Instant we've put together an [llms.txt](/llms.txt) and
[llms-full.txt](/llms-full.txt) that you can paste or download to use as context
for your LLM of choice.

Here's an example prompt you can use with Claude on the web.

```
You are an expert Next.js, React, and InstantDB developer. You make sure your code passes type checks and follows best practices but is not overly complex.

You can find a list of guides on how to use instantdb in the provided llms.txt and you can find the full documentation on how to use instantdb in llms-full.txt

You ALWAYS output full files. I NEED full files so I can easily copy and paste them into my project.

You NEVER give me partial diffs or redacted code.

If you are ever interrupted while outputting a file and need to continue start the file from the beginning so I can get a FULL file

// [Prompt for what you want to build]

// [llms.txt and llms-full.txt pasted below]
```

You can also attach `.md` to the end of any doc page url to get the raw markdown
you can copy and paste into your LLM. For example, here's the [Getting
Started page](/docs.md)

If you have any feedback on your experience using LLMs w/ Instant we would love
to hear it! Feel free to use the feedback buttons below or reach out to us on
[Discord](https://discord.com/invite/VU53p7uQcE).

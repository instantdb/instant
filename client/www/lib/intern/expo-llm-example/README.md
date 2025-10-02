# Instant Expo LLM Rules Template

This directory contains a template and an example app to generate LLM rules
for expo apps.

## Updating LLM rules

`expo-rules-template.md` is the source of truth for generating our rule files.
See instructions in the file for how to update it!

## See the example app live

(TODO): Make the example app work with the Sandbox. Right now the sandbox uses
Expo SDK 52 but `create-instant-app` uses Expo SDK 54.

You can see the example app by running it locally via the instructions below.

```bash
# Create a new Expo app with Instant
npx create-instant-app -b expo

# Replace the contents of `lib/db.ts`, `instant.schema.ts` and `app/index.tsx`, with the
content from the code in the `expo-rules-template.md` file.

# Push up schema
npx instant-cli@latest push

# Run the app
npx expo start
```

# InstantDB's id() Issue Repro

InstantDB's `id()` function does not work in server endpoints, even though `v4()` from `uuid`
does.

## Key Files of Interest

- [app.vue](/app.vue): Calls the test API endpoint and logs IDs generated client-side.
- [server/api/createId.ts](/server/api/createId.ts): Attempts to generate IDs using both `uuid` and `@instantdb/admin` on the server.

## The Issue

- **Client-side:** Both `id()` from `@instantdb/core` and `v4()` from `uuid` function as expected when they run client-side (ie: when called directly by the button in `app.vue`).
- **Server-side:**
  - `v4()` from `uuid` works correctly when called within the `/api/createId` endpoint (`server/api/createId.ts`). but `id()` from `@instantdb/admin` throws an error (at line 12).

The error thrown is: `dist$1.id is not a function`.

This is unexpected because `id()` in `@instantdb/admin` appears to be a direct re-export or wrapper around `v4()` from `uuid`.

## Reproduction Steps

Install dependencies:

```bash
# pnpm
pnpm install
```

Start the development server:

```bash
# pnpm
pnpm dev
```

Then, clicking the button on the page will trigger the API call and print the error on the scren. Inspecting the browser console or server console in your IDE will reveal more detailed logs.

# Dash redesign playground

This folder is a viewer/playground for redesigning the Instant dashboard. It is **not** wired into the real `/dash` flow. It lives at `/dash-redesign` and is meant to let us see — and iterate on — every state the dashboard goes through, without touching the live dashboard.

## How it works

`index.tsx` is a single page that:

- Renders a view picking which **view** to show (Login, Enter your code, Onboarding, Home, etc.).
- Views that have multiple internal states (e.g. Onboarding has Welcome / Tell us about yourself / Name your app) render a sub picker
- Each view is a copy of the real dashboard JSX -- as close to the same as possible, while being able to isolate _into_ the particular view we want to be in

## Mock vs. real data

We use mocks where they make sense. For when we need actual apps (like in an Explorer, we just use something from dashResponse)

## Conventions for adding a new view

When asked to add a new page to the redesign viewer:

1. **Find the real component** in `components/dash/*` or `pages/dash/*` and copy its JSX into this file (or a sibling component). Don't import it directly — we want our own copy that we can redesign without affecting the live dashboard.
2. **Strip side-effects.** Remove posthog calls, network requests, router pushes, confetti, optimistic updates. Replace with no-ops. Keep local `useState` for input/toggle state so the form feels live.
3. **Add to the union and array** at the top of the file:
   - `ViewKey` type union — add the new key.
   - `VIEWS` array — add `{ key, label }`. The label is what appears in the top-left dropdown.
4. **Add the render branch** in `DashRedesignViewer` — `{view === 'new-view' && <NewView />}`.
5. **If the view needs real app/dash data** (anything that lives behind the dashboard auth, like Home/Explorer/Schema/etc.):
   - Wrap the render branch in `<DashDataProvider>...</DashDataProvider>` and make that work
6. **Use shared UI primitives** from `@/components/ui` (Button, TextInput, ScreenHeading, SectionHeading, SubsectionHeading, Content, Copyable, SmallCopyable, Select, Divider). These are the design-system pieces — redesign happens by changing them or replacing usages, not by hand-rolling new ones.
7. **Use Heroicons** (outline for nav/secondary, solid for filled actions). No custom SVGs unless they're brand assets from `public/img/`.

## Things to remember

- This file is a **viewer**, not the real app. Don't add real navigation, real mutations, or analytics here.
- Once `index.tsx` gets unwieldy (~1000+ lines), suggest splitting views into separate files. Next.js pages router treats `_`-prefixed files/folders as non-routes, so something like `pages/dash-redesign/_views/HomeView.tsx` would work — or move the components to `components/dash-redesign/` and import them.

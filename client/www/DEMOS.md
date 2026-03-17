# Demo Overview

This document catalogs every interactive demo across the Instant website, describes what makes each one special, and provides a guide for building new ones.

---

## Homepage Demos

The homepage lives at `pages/index.tsx` and sources demos from `components/new-landing/`.

### 3. Animated Terminal

**File:** `components/new-landing/BuiltForAI.tsx` — `AnimatedTerminal`

A CLI interaction that types out `npx instant-cli push schema` character by character (8-24ms per keystroke for natural feel), then reveals a schema diff with `+ CREATE NAMESPACE todos`, followed by interactive Push/Cancel buttons. Clicking Push shows "Schema updated! ✓ Done"; clicking Cancel shows "Schema migration cancelled!". After 3s the result fades and re-loops after 60s.

**What makes it special:** The demo pauses at the diff and waits for the user to click Push or Cancel — it doesn't auto-advance past the decision point. This creates a moment of agency.

**Design:** Dark terminal (bg-gray-950), green $ prompt, green highlighting for additions, amber Push button, gray Cancel. Scroll-triggered via IntersectionObserver (0.5 threshold).

### 5. Type Safety Demo

**File:** `components/new-landing/BuiltForAI.tsx` — `TypeSafetyDemo`

An animated IDE autocomplete that cycles through two scenes:

1. Typing `db.useQuery({` → autocomplete dropdown shows `messages`, `users`, `channels` → selects `messages: {}` → annotation `// → { messages: Message[] }`
2. Typing `data.messages[0].` → dropdown shows `text`, `id`, `createdAt` → selects `text` → annotation `// → string`

Each scene goes through phases: `typing-prefix` (800ms) → `show-dropdown` (1200ms) → `select-item` (800ms) → `show-annotation` (2000ms) → `pause` (2000ms) → next scene.

**What makes it special:** The blinking cursor (`opacity: [1, 0]` at 0.8s repeat), the dropdown styling mimicking VS Code (blue left-border on highlighted item, diamond icons), and the type annotation appearing after selection. It communicates "your IDE understands Instant" without any explanation.

**Design:** Dark editor with title bar showing "app.tsx", autocomplete dropdown with `min-w-[220px]`, blue/purple/emerald diamond icons.

### 6. Undo Demo

**File:** `components/new-landing/UndoDemo.tsx`

A split-panel showing a "posts" table with `title`, `body`, `createdAt` attributes and Delete buttons, alongside a "Recently deleted" panel with Restore buttons. On scroll-in, a fake cursor auto-plays: it appears, glides to the Delete button on "title", clicks (with a satisfying scale-down to 0.85), and the row animates out with `AnimatePresence` (slides right + collapses height). After auto-play, the user can freely interact.

**What makes it special:** The fake cursor with spring physics (`stiffness: 300, damping: 30`) makes the auto-play feel like watching someone actually use the UI. The cursor calculates real DOM positions via `getBoundingClientRect`.

**Design:** Two white rounded cards with shadows, red delete text, green restore buttons. `AnimatePresence` with layout animations for smooth row transitions. Height is 200px per panel.

### 7. Auth Demo

**File:** `components/new-landing/BatteriesForAI.tsx` — `AuthDemo`

A compact sign-in form with email input, "Send Code" button, and Google/Apple/GitHub social buttons. Clicking any button transitions (via `AnimatePresence mode="wait"`) to a success screen showing the user's initial in an orange circle, "Welcome, {name}!", and a spring-animated checkmark (`stiffness: 400, damping: 15`). The email input supports Enter key submission and extracts the name from the email address prefix.

**Design:** 280px max-width, white card with subtle shadow, orange primary buttons, gray social buttons with brand SVG icons. Radial gradient background from white to warm cream.

### 8. Permissions Demo

**File:** `components/new-landing/BatteriesForAI.tsx` — `PermissionsDemo`

An interactive permission evaluator. Two dropdowns: User (Anyone, Alice, Louis) and Operation (read, create, update, delete). Selecting a combination evaluates the rules and shows "✓ allowed" (green) or "✗ denied" (red) with a fade transition. Below, a rules table highlights the active rule with a `layoutId="perm-highlight"` animated background that slides between rules using spring physics (`stiffness: 500, damping: 35`).

**What makes it special:** The sliding highlight on the rules table is the key detail — as you change operations, the highlight smoothly glides to the corresponding rule, making the cause-effect relationship crystal clear.

**Design:** Compact monospace rules display with bind/allow sections. White dropdown pills with ring borders.

### 9. Storage Demo

**File:** `components/new-landing/BatteriesForAI.tsx` — `StorageDemo`

A multi-phase state machine that auto-plays on scroll-in:

1. **Compose** — empty dropzone with cloud upload icon
2. **Dragging** — fake cursor appears from the right carrying a thumbnail, glides to dropzone center
3. **Uploading** — progress bar fills over 1s (20 steps)
4. **Typing** — cursor moves to caption area, types "Newest member of the team" character-by-character (50ms per char)
5. **Post** — transitions to an Instagram-style post view with the photo, caption, and a heart button

Clicking the heart triggers 3-6 floating heart emojis with randomized size (14-28px), drift (-30 to +30px horizontal), float distance (50-90px up), staggered delays (60ms between), and rotation (-20 to +20deg). Uses the Web Animations API for performance.

**What makes it special:** The dragging cursor carrying a thumbnail image is a delightful detail. The entire flow (compose → upload → type → post → react) tells a complete story of what storage enables.

**Design:** 260px max-width, white card with border. Upload progress bar is white on white/30 overlay over the image.

### 12. Live Stream Demo

**File:** `components/new-landing/LiveStreamDemo.tsx`

Two tilted stream cards (`-rotate-2 translate-y-2` and `rotate-1 -translate-y-3`) each showing:

- "LIVE" badge with viewer count
- Auto-playing muted video from `/img/landing/stream-clip.mp4`
- Four reaction buttons (❤️, 🔥, 🎉, 👏) floating below

Clicking a reaction spawns floating emoji on **both** stream cards simultaneously using the Web Animations API. The emojis drift with randomized S-curve motion (4 waypoints) and spin, traveling 150px upward over 1.8s. Clicking anywhere on a card triggers a wiggle animation (`rotate: [0, -2, 2, -1, 1, 0]` over 0.4s).

**What makes it special:** The dual-screen reaction sync — clicking on one card spawns emojis on both — visually demonstrates "presence" and "broadcast" without words.

**Design:** Two 280px cards with shadow, red LIVE badge, reaction buttons in white circles below each card.

### 13. Streams Demo (Drawing Canvas)

**File:** `components/new-landing/StreamsDemoJoin.tsx`

A real-time drawing demo with three canvases (Stopa, Drew, Daniel) connected via an "Instant server + S3 storage" hub:

- On scroll-in, auto-plays drawing the Instant logo on Stopa's canvas using pre-defined stroke data
- Drew's canvas receives the strokes in real-time via a queue consumer (12ms interval)
- Daniel's canvas has a "Join" button with an orange glowing overlay — clicking it replays all history from storage, then starts receiving live updates
- **Flying pellets** animate as SVG paths between canvases, server, and storage: orange for live data, indigo for storage reads
- Users can draw on any canvas with pointer events, and strokes replicate to all others

**What makes it special:** The most complex demo on the site. The three-way architecture (publisher → server → subscribers, with storage persistence and late-join replay) tells the full streams story. The flying pellets with pulse-line animation (`pathLength: 0.3, pathOffset: 0 → 1`) visually show data flowing through the system.

**Design:** Dot-grid canvases (20px spacing), orange stroke color, Instant logo + S3 box in the center. Drew and Daniel canvases are smaller (130px) and slightly rotated for visual interest.

### 14. Auto-Play Speed Demo

**File:** `components/new-landing/AutoPlayDemo.tsx`

Side-by-side task lists comparing "With Instant" (immediate toggle) vs "Without Instant" (shows spinning loader for ~1s before updating). A fake cursor auto-plays on scroll-in, toggling tasks in sequence. The "without" side uses `isPending` state to show a spinner in the checkbox. After auto-play, users can click directly. Tasks auto-reset after 5s of user inactivity.

**What makes it special:** The contrast is visceral — watching the same action happen instantly on the left and with a spinner on the right communicates "optimistic updates" better than any paragraph could.

**Design:** Two white rounded cards, orange checkmarks for "done", spinning border animation for pending state.

### 15. Realtime Checklist Demo

**File:** `components/new-landing/RealtimeChecklistDemo.tsx`

Two task cards (Daniel's phone, Joe's phone) with shared state. Toggling a task on either card fires a green sync dot that shoots through the gap between cards. The dot uses CSS keyframes (`syncDotLR` / `syncDotRL`) with a glow box-shadow (`0 0 8px 2px rgba(74, 222, 128, 0.6)`), scaling up to 1.3x at the midpoint and fading out over 0.3s.

**What makes it special:** The sync dots are a beautiful detail — they emerge from one card, glow and expand in the middle, then arrive at the other card. It's a purely decorative touch that makes "real-time sync" feel physical.

**Design:** User avatars above each card, orange checkboxes, green glowing dots.

### 16. Offline Reactions Demo

**File:** `components/new-landing/OfflineDemoReactions.tsx`

Two device cards (Stopa's phone, Drew's phone) with a shared online/offline toggle. Shows a Slack-like #ship-it channel with three messages, each with an emoji reaction button and a **rolling digit counter**.

- **Online:** Clicking a reaction immediately increments the synced count on both cards
- **Offline:** Reactions queue locally per device with an amber "+N queued" badge; toggling back online merges all queued reactions into the synced pool

The rolling digit counter uses Framer Motion's `useSpring` to animate a vertical stack of digits (0-9), translating the correct digit into view with spring physics.

**What makes it special:** The rolling counter animation is delightful — numbers don't jump, they roll like an odometer. Combined with the queued badge appearing/disappearing, it makes the offline → online transition feel tangible. Uses Immer for immutable state updates.

**Design:** Green toggle with wifi icon, two cards with user avatars, reaction pills with emoji + count. Amber for queued state, green for online.

### 17. Sync Relations Demo

**File:** `components/new-landing/SyncRelationsDemo.tsx`

A split-panel interactive query explorer. Left side: a mini project board app with three lists (Launch 🚀, Design 🎨, Backend ⚡), each containing items with comments. Right side: an InstaQL query code block that updates live as the user navigates.

- Click a list → query gains `$: { where: { name: "Launch" } }` and `items: {}`
- Toggle "Hide completed" → query gains `$: { where: { done: false } }` inside items
- Click an item with comments → query gains `comments: {}`
- Navigate back → query simplifies to `lists: {}`

Query lines animate in/out with `AnimatePresence` (height + opacity transitions). Active lines have an orange left border accent.

**What makes it special:** The real-time query generation is the killer feature — it teaches InstaQL's relational query syntax by showing the exact query that would produce what you're looking at. The list → items view transition slides on the x-axis with `easeInOut`.

**Design:** Left: white card with gray-50 header bar + green "Live" dot. Right: dark code block (bg-[#0D1117]) with "InstaQL" label. Purple keywords, orange entity names, green strings.

---

## Sync Product Page Demos

The sync page lives at `pages/product/sync/index.tsx` with components in `components/product/sync/`.

All four walkthroughs share a common shell and utilities:

- **WalkthroughShell** (`WalkthroughShell.tsx`): Provides responsive scaling via `ResizeObserver`, step navigation (prev/next buttons), step indicator dots (orange active), and animated step descriptions.
- **walkthrough-utils** (`walkthrough-utils.tsx`): Shared types (`BallColor`, `ClientState`, `MutDot`), constants (`COL_W=130`, `BAR_H=20`, `BOX_H=110`), and components (`LayerBar`, `ClientColumn`, `MutationDot`, `TravelingDot`).

### 18. Optimistic Update Diagram

**File:** `components/product/sync/OptimisticUpdateDiagram.tsx`

A 5-step walkthrough showing one client (Alyssa) and a server:

1. Alyssa sees a gray ball
2. Alyssa paints blue → immediately shows blue locally, sends mutation
3. Server accepts → broadcasts confirmation, pending mutation clears
4. Alyssa paints red → shows red optimistically
5. Server rejects red → client reverts to blue (with a red X animation and a head-shake `[-3, 3, -3]` on the server ball)

**What makes it special:** Step 5 is the key teaching moment — it shows that optimistic updates can be rejected and the client automatically reverts. The server ball shakes to communicate rejection physically.

### 19. Realtime Sync Walkthrough

**File:** `components/product/sync/RealtimeSyncWalkthrough.tsx`

A 3-step walkthrough showing two clients (Alyssa, Louis) and a server:

1. Both see gray ball, connected to server
2. Alyssa paints blue → sees it instantly, mutation travels to server (0.8s)
3. Server broadcasts → both see blue (another 0.8s)

Dashed SVG lines connect clients to server, with animated traveling dots showing mutations and broadcasts.

### 20. Conflict Resolution Walkthrough

**File:** `components/product/sync/ConflictResolutionWalkthrough.tsx`

A 4-step walkthrough showing simultaneous edits:

1. Both see gray
2. Alyssa paints blue, Louis paints red (at the same time)
3. Louis's red arrives first → server broadcasts red
4. Alyssa's blue arrives and wins (last-write-wins) → both converge on blue

Shows optimistic state overlaying server state — clients can temporarily display different colors.

### 21. Offline Persistence Walkthrough

**File:** `components/product/sync/OfflinePersistenceWalkthrough.tsx`

The most complex diagram. Shows Client + IndexedDB (small cylinder icons) + Server:

1. Online: gray circle visible
2. Goes offline: edges turn red, X appears
3. Makes change offline: blue circle saved to pending mutations queue in IndexedDB
4. Makes another change: square shape added to pending queue
5. Back online: mutations replay in order, client converges

**What makes it special:** IndexedDB is visualized as small stacked cylinders showing "Server Result" and "Pending Mutations" — this makes an abstract concept (local persistence) visually concrete. Multiple pending mutations are shown as stacked items.

---

## Storage Product Page Demos

The storage page lives at `pages/product/storage/index.tsx`.

### 22. Music App

**File:** `pages/product/storage/index.tsx` — `MusicApp`
**Audio engine:** `lib/product/storage/musicPreview.ts` — `PreviewPlayer`

A playable classical music player showing "Favorite classical" playlist with 5 tracks. Uses the Web Audio API's `AnalyserNode` to extract real frequency data, displayed as a 3-bar frequency visualization (low/mid/high bands) that updates on every `requestAnimationFrame`. The bars have 75ms CSS transitions for smooth height changes.

Tracks auto-advance. Click any track to play it. Includes royalty-free license links.

**What makes it special:** The frequency bars are driven by real audio analysis, not fake animation. This is one of the few demos that uses actual Web APIs beyond DOM manipulation.

**Design:** White card with border, dark play/pause circle button, track list with active highlighting. Bars are 2.5px wide gray rectangles.

### 23. Photo App

**File:** `pages/product/storage/index.tsx` — `PhotoApp`

Instagram-style post with user avatar, photo (dog licking spoon), and a heart button. Clicking the heart spawns 3-6 floating heart emojis with the same particle animation used in the Storage Demo on the homepage (randomized size, drift, rotation, cubic-bezier easing).

**Design:** White card with rounded border, aspect-square photo, heart button overlapping the bottom-right corner.

### 24. Book App

**File:** `pages/product/storage/index.tsx` — `BookApp`

A Goodreads-style bookshelf with 6 books in a 3-column grid. Clicking a cover opens a modal with spring animation (`stiffness: 400, damping: 30`, initial `scale: 0.85`) showing the book cover, title, author, description, and an "Get it on Amazon" link. Dismiss by clicking X or the backdrop.

Books: How to Win Friends, 7 Habits, East of Eden, Antifragile, SICP, Hackers & Painters.

**Design:** White card with "Zeneca" header, book covers with hover scale-down (0.98). Modal is 400px wide with shadow-xl.

### 25. App Gallery Layout

**File:** `pages/product/storage/index.tsx` — `AppGallery`

The three app demos are stacked in a fanned card layout:

- Music: `rotate-[-2.5deg] translate-y-2` (left)
- Books: `z-10` (center, on top)
- Photos: `rotate-[1.5deg] translate-y-4` (right)

Each card is 240px wide. Background uses a radial gradient from white to warm cream.

---

## What's Similar Across All Demos

### Animation Foundation

Every demo uses **Framer Motion** (`motion/react`) as the primary animation library. The patterns are consistent:

- `AnimatePresence` for enter/exit transitions (with `mode="wait"` for sequential swaps)
- `motion.div` with `initial` / `animate` / `exit` for declarative animations
- Spring physics for interactive elements (`stiffness: 300-500, damping: 20-35`)
- `useInView` or raw `IntersectionObserver` for scroll-triggered activation (always `once: true`)
- `layout` and `layoutId` for shared-element transitions

### Scroll-Triggered Activation

Nearly every demo activates when it scrolls into view (threshold 0.3-0.5) and runs exactly once. This means the page loads fast and demos only animate when the user can see them.

### Fake Cursor Pattern

Several demos (UndoDemo, StorageDemo, StreamsDemoJoin, AutoPlayDemo) feature an animated fake cursor that demonstrates the interaction before the user tries it. The cursor uses spring physics and DOM position calculations (`getBoundingClientRect`) to move to real button positions. It includes a click animation (scale down to 0.85). After auto-play completes, the user can interact directly.

### State Machine Architecture

Complex demos (StorageDemo, AnimatedTerminal, TypeSafetyDemo) use explicit phase/state machines rather than timeline-based animation. Phases transition via `setTimeout` chains scheduled through a `sched` helper that tracks timeouts for cleanup. This makes the animation flow readable and easy to modify.

### Side-by-Side Comparison

A recurring layout pattern: show two versions of the same thing to make an abstract concept concrete:

- With Instant vs Without Instant (AutoPlayDemo)
- Without a database vs With Instant (BeforeAfterVisual)
- Two devices syncing (RealtimeChecklistDemo, OfflineDemoReactions)
- App mock + live query code (SyncRelationsDemo)

### Device Frame Mockups

Several demos embed content in device frame components (BrowserFrame with traffic lights, PhoneFrame with notch) to ground abstract data concepts in familiar physical forms.

### Particle Effects

Floating emoji/heart animations appear in multiple demos (StorageDemo, PhotoApp, LiveStreamDemo) using the Web Animations API for performance. The pattern: create DOM elements, apply randomized physics params, animate with `element.animate()`, clean up on finish.

### Warm Color Palette

Orange (#F97316 / orange-500/600) is the universal accent. Backgrounds use warm radial gradients (`from-white to-[#FFF9F4]`). Contextual accents: green for success/synced, amber for queued/pending, red for errors/rejection, blue/purple for secondary features.

### White Card Containers

Almost every demo lives inside a white card with `rounded-xl border border-gray-200 bg-white shadow-sm`. This creates visual consistency and a clean, product-like feel.

### No Real Backend

Every demo is self-contained — no actual API calls, no real Instant database. State is managed with React hooks (`useState`, `useRef`, `useCallback`). The StorageDemo doesn't actually upload; the MusicApp plays real audio but from static files. This makes demos reliable and fast.

---

## Guide for Making New Demos

### 1. Pick the Right Demo Type

| Goal                | Demo Type                                                   | Example                                                |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Show a feature's UX | **Mini app** — build a tiny version of a real app           | MusicApp, PhotoApp, BookApp                            |
| Show a contrast     | **Side-by-side** — same interaction, different outcomes     | AutoPlayDemo, BeforeAfterVisual                        |
| Teach a concept     | **Step-through walkthrough** — narrated steps with diagrams | OptimisticUpdateDiagram, ConflictResolutionWalkthrough |
| Show code + result  | **Split panel** — interactive app paired with live code     | SyncRelationsDemo                                      |
| Show a flow         | **State machine** — auto-played sequence of phases          | StorageDemo, AnimatedTerminal                          |

### 2. Start with the Component Structure

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export function MyDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Scroll-trigger: activate once when visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          startAnimation();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Demo content */}
    </div>
  );
}
```

### 3. Animation Patterns to Reuse

**Timeout scheduler** — for sequenced animations, use a `sched` helper that tracks timeouts for cleanup:

```tsx
const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
const clear = () => {
  timeouts.current.forEach(clearTimeout);
  timeouts.current = [];
};
const sched = (fn: () => void, ms: number) => {
  timeouts.current.push(setTimeout(fn, ms));
};
```

**Fake cursor** — reuse the SVG cursor from UndoDemo/StorageDemo. It needs:

- A `cursorPos` state for position
- A `clicking` state for the scale-down effect
- Spring transition: `{ type: 'spring', stiffness: 300, damping: 30 }`
- DOM position via `getBoundingClientRect` relative to the container

**Floating particles** — for emoji/heart effects, use the Web Animations API pattern from LiveStreamDemo:

```tsx
function spawnFloater(emoji: string, container: HTMLElement) {
  const el = document.createElement('span');
  el.textContent = emoji;
  container.appendChild(el);
  // Position absolutely, animate with el.animate([...], { duration, easing, fill: 'forwards' })
  // Clean up: anim.onfinish = () => el.remove()
}
```

**Rolling counter** — for animated numbers, use the `RollingDigit` pattern from OfflineDemoReactions with `useSpring` and `useTransform`.

**AnimatePresence list** — for items that enter/exit (like the UndoDemo rows):

```tsx
<AnimatePresence initial={false}>
  {items.map((item) => (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, x: 20, height: 0 }}
      animate={{ opacity: 1, x: 0, height: 'auto' }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      transition={{ duration: 0.2 }}
    />
  ))}
</AnimatePresence>
```

### 4. Design Conventions

- **Container:** White card with `rounded-xl border border-gray-200 bg-white shadow-sm`
- **Accent color:** Orange (`orange-500` for buttons, `orange-600` for text)
- **Background wash:** Wrap demo in a radial gradient `bg-radial from-white to-[#FFF9F4]` with padding
- **Code blocks:** Dark background (`bg-gray-950` or `bg-[#0D1117]`), hand-colored syntax with span classes
- **Tabs:** Pill buttons with orange active state, or underline-style tabs for code editors
- **Device frames:** Use the BrowserFrame (traffic lights + URL bar) and PhoneFrame (notch + dark border) from Hero.tsx
- **Typography:** `text-sm` for primary content, `text-xs` for secondary, `font-mono` for code
- **Spacing:** `space-y-4` for feature sections, `gap-6` between side-by-side elements

### 5. Tips

- **Self-contained state:** Never call real APIs. Use `useState` for everything. If state needs to survive page loads, use `localStorage` (like BeforeAfterVisual).
- **Pause for agency:** If the demo has a decision point, pause there (like AnimatedTerminal pausing at Push/Cancel). Don't auto-advance past moments where the user can interact.
- **After auto-play, enable interaction:** Once the fake cursor finishes, hide it and let users click freely.
- **One concept per demo:** Each demo should communicate one idea. StorageDemo = "file upload is easy". AutoPlayDemo = "updates are instant". Don't try to show everything.
- **Test scroll trigger:** Make sure the demo activates at the right scroll position. Use `threshold: 0.3-0.5` so it starts when the demo is meaningfully visible, not when a single pixel enters the viewport.
- **Clean up timeouts:** Always clear timeouts and cancel animation frames in cleanup functions. Use the `sched` pattern and return cleanup from `useEffect`.
- **Performance:** Use `requestAnimationFrame` for render loops (StreamsDemoJoin), the Web Animations API for particle effects (instead of Framer Motion), and `useInView({ once: true })` to avoid re-triggering.
- **Use existing components:** Reuse `AnimateIn` for scroll-triggered fade-in, `TabbedCodeExample` for code viewers, `WalkthroughShell` for step-through diagrams. Check `components/new-landing/` before building new primitives.

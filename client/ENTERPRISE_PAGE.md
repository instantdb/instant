# Enterprise Page

## Section 1: Hero

**Title:** Give every chat a backend

**Subtitle:** Instant gives agents a real database — with auth, storage, permissions, and real-time sync. One API call to spin up a backend.

**CTAs:** "Talk to us" (primary, orange) | "Read the docs" (secondary, links to docs)

**UI:** Below the CTAs there's a diagram showing the flow:
- Left: A chat interface mockup with messages "Build me a project tracker" → "Creating your app..."
- Center: Arrow labeled "Platform API"
- Right: Three mini app icons (App 1, App 2, App 3) each with a database icon

---

## Section 2: Good Abstractions

**Title:** Good abstractions compound

**Subtitle:** When agents use a tight abstraction, the benefits multiply at every level: for agents, platforms, and end users.

**Three columns:**

1. **Agents** — For the agent, there's **locality** — it reasons about one interface instead of three systems. Less context means fewer hallucinations, fewer retries, fewer wasted tokens.

2. **Platforms** — For the platform, there's **efficiency**. Instant is multi-tenant, so 20,000 apps with 1 user can cost the same as 1 app with 20,000 users. No VMs to provision. No cold starts. No frozen apps.

3. **End-users** — For end-users, there's **extensibility** — because Instant exposes a database-like abstraction, end-users with their own agents can query and extend the apps built for them. Applications become platforms.

**Closing:** These advantages stack. Agents build faster. Platforms host cheaper. Users get more. That's what good infrastructure makes possible.

---

## Section 3: App Builders

**Title:** Power every app your users create

**Subtitle:** Instant gives each app its own backend. No per-app infrastructure. No cold starts. Go from prompt to production app in seconds.

**UI:** Side-by-side comparison:
- Left: An app builder mockup with a code editor pane (showing `db.useQuery(...)` code) and a preview pane (showing a "Project Tracker" with tasks). Below is a prompt bar: "Build me a project tracker"
- Arrow pointing right
- Right: A deployed "Project Tracker" app marked "Live", showing the same tasks. Below is a "Data layer" section showing `projects: 3 rows`, `users: 1 row`, and icons for Database, Auth, Storage, Permissions.

**Closing:** Data, auth, storage, and permissions are all scoped per-app. Manage everything through the Platform API — create apps, set schemas, configure permissions, all programmatically.

---

## Section 4: Chat Platforms

**Title:** Turn conversations into applications

**Subtitle:** What if every chat could have its own backend? You could turn conversations into personal software.

**UI:** A 4-step storyboard:

1. **User prompts** — "Build me a habit tracker" (shows a user avatar + chat bubble)
2. **AI builds the app** — Working preview in the chat (shows an AI avatar + embedded preview of a "Habits" app with checkboxes for Exercise ✓ and Read)
3. **Data persists** — Open it tomorrow — still there (shows a phone icon with data bars, labeled "Next day / Your data is still here")
4. **Multiplayer built in** — Share a link, collaborate in real-time (shows two overlapping avatars A & B, labeled "Shared / Both see the same habits")

**Closing:** Instant's multi-tenant architecture means spinning up a new backend is a metadata operation — not a new database instance. You can create millions of backends with the same infrastructure cost as one.

---

## Section 5: Internal Tools

**Title:** Let every employee build what they need

**Subtitle:** Does your team already use LLMs? Pair them with Instant and every employee can build the internal tools they actually need. Empower the person who understands the problem to build the solution.

**UI:** Three columns, each showing Employee → Arrow down → Built Tool:

1. **Sales** (avatar S, blue) — "Build me a deal pipeline" → Deal Pipeline tool (bar chart icon, shared with Sales team of 8)
2. **Ops** (avatar O, green) — "Build me a inventory tracker" → Inventory Tracker tool (box icon, shared with Ops team of 5)
3. **Marketing** (avatar M, purple) — "Build me a campaign dashboard" → Campaign Dashboard tool (pie chart icon, shared with Marketing team of 6)

**Closing:** Every tool gets auth built in — employees can log in with their existing SSO. Permissions ensure people only see what they should. And because everything syncs in real-time, teams always see the latest data.

---

## Section 6: Architecture

**Title:** One platform, millions of backends

**Subtitle:** Traditional backends need a VM for every app. With Instant all apps can live in one shared DB. Much easier and cost effective to maintain.

**UI — Stat cards (3 columns):**
- **< 100ms** to provision a new backend
- **10k+** concurrent connections
- **Zero** cold starts

**UI — Comparison diagram (2 columns):**

- **Traditional:** Three rows, each showing App → Server → Database. Caption: "Every app needs its own VM + database"
- **Instant:** Grid of 8 app boxes all connecting down to a single "Shared Infrastructure" block (database icon, "One platform, multi-tenant"). Caption: "All apps share one efficient infrastructure"

---

## Section 7: CTA

**Title:** Ready to give your platform a backend?

**CTAs:** "Talk to us" (primary, orange) | "Read the docs" (secondary)

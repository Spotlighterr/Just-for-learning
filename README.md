# BuilderOS v0.2

A deliberately simple self-hosted learning tracker for the roadmap:

**Finance & Banking → Data → Software → AI → Mobile → Production**

This version is intentionally built with **plain HTML/CSS/JavaScript + a tiny Node.js server** so the code stays readable while learning.

## What it does

- Guided 2026→2028 roadmap with checklists
- “Today” page that surfaces the next learning tasks
- Study session log (Tech / Chinese / Finance / University)
- Code-reading / feature-tracing log
- Finance × Tech project mapping
- React Native / Expo mobile track
- Certification priority + learning-cost ledger
- Server-side persistence for multi-device access
- Automatic browser `localStorage` mirror
- JSON export backup + JSON restore
- Revision-based conflict detection when two devices edit stale copies
- Light UI only

## Data model in v0.2

BuilderOS intentionally does **not** use PostgreSQL yet.

```text
Browser
  ↕
localStorage mirror
  ↕
Node.js HTTP server
  ↓
data/state.json
```

When PostgreSQL becomes the current learning topic, migrating BuilderOS to PostgreSQL is itself part of the roadmap.

## Run with Docker Compose

```bash
docker compose up -d --build
```

Open:

```text
http://YOUR_SERVER_IP:8787
```

Data persists at:

```text
./data/state.json
```

The `data` folder is mounted into the container, so rebuilding the image does not erase your progress.

## Run without Docker

Requires Node.js 20+.

```bash
npm start
```

Then open:

```text
http://localhost:8787
```

## Access from anywhere

Recommended while the app has no built-in authentication:

1. Run it on the homelab.
2. Access it through your private network / Tailscale, **or** place it behind an authenticated reverse proxy.
3. Do not expose port `8787` directly to the public Internet without an access-control layer.

## Backup strategy

BuilderOS has three layers:

1. **Server copy** — `./data/state.json`
2. **Browser mirror** — `localStorage`
3. **Portable backup** — click **Backup JSON** in the UI

For homelab backup, also include `./data/state.json` in your normal server backup job.

## Multi-device conflict behavior

Every server save increments a revision number.

If laptop A and laptop B both load revision 10, then A saves revision 11. When B later tries to save its old revision 10, BuilderOS will stop and show two choices:

- Use server version
- Overwrite server with the local version

This prevents silent last-write-wins data loss.

## Suggested project evolution

Do not rewrite the whole app immediately.

```text
v0.2  Vanilla JS + Node + JSON persistence
v0.3  TypeScript
v0.4  React
v0.5  Next.js + PostgreSQL
v0.6  Authentication / roles
v0.7  Docker / CI-CD hardening
v0.8  AI weekly review
v1.0  React Native companion app
```

Only upgrade BuilderOS when the corresponding technology is the thing you are currently learning.

## First learning exercise

Open `public/app.js` and trace:

```text
boot()
  ↓
fetchServerState()
  ↓
state
  ↓
render()
```

Then trace a checkbox update:

```text
change event
  ↓
toggleTopic()
  ↓
commit()
  ↓
writeCache()
  ↓
syncNow()
  ↓
PUT /api/state
  ↓
data/state.json
```

If you can explain that flow, BuilderOS has already started doing its job.

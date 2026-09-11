# Deploying GaloisVision

GaloisVision is a **pure static site** — React + Vite compiled to HTML/CSS/JS, with all
computation running in the visitor's browser. No server, no database, no API keys. That
means it can be hosted on any static CDN for **$0**.

**Approach:** its own Firebase project, on the free **Spark** plan, completely separate
from the GroupVote project.

- **Live URL (after setup):** `https://galoisvision.web.app`
- **Cost:** $0, with a hard ceiling — see [Cost](#cost).
- **Deploy command, forever after:** `npm run deploy`

---

## Isolation from GroupVote

This setup shares **nothing** with the GroupVote project (`groupvote-12796`):

| | GroupVote | GaloisVision |
|---|---|---|
| Firebase project | `groupvote-12796` | its own, e.g. `galoisvision` |
| URL | `groupvote-12796.web.app` | `galoisvision.web.app` |
| Pricing plan | Blaze (pay-as-you-go) | Spark (free, no billing account) |
| Storage + bandwidth quota | its own | its own |
| Cloud Functions, database | yes | none |

Nothing you run from this repository can reach the GroupVote project, because this
repository's `.firebaserc` names a different project. GroupVote's quota, billing, URL, and
files are untouched, and a runaway month on GaloisVision cannot produce a charge on the
GroupVote account.

---

## One-time setup (about 5 minutes)

### Step 1 — Confirm the Firebase CLI is ready

In a terminal, anywhere:

```bash
firebase --version      # 13.x or newer is fine
firebase login:list     # should show your Google account
```

If `firebase` is not found:

```bash
npm install -g firebase-tools
firebase login
```

### Step 2 — Create the project

```bash
firebase projects:create galoisvision --display-name "GaloisVision"
```

New projects are created on the free **Spark** plan with no billing account attached.
Leave it that way — nothing in this app needs Blaze.

Project IDs are globally unique across all of Google Cloud, so `galoisvision` may be
taken. If it is, pick another (`galoisvision-app`, `galoisvision-viz`, …). **Note the exact
project ID the command prints** — the rest of the steps use it.

> Prefer clicking? <https://console.firebase.google.com> → **Create a project** → name it
> `GaloisVision` → skip Google Analytics → stay on the **Spark** plan. The console will
> show you the generated project ID, which may have a random suffix like
> `galoisvision-4f21`.

### Step 3 — Point this repository at that project

From the repository root (`GaloisVision/`):

```bash
firebase use --add
```

Pick your new project from the list, and give it the alias `default` when prompted.

This writes a `.firebaserc` file naming your project. **Commit it** — it's how the repo
remembers where it deploys, and it's the thing that keeps GroupVote out of reach:

```bash
git add .firebaserc && git commit -m "Point Firebase deploys at the GaloisVision project"
```

### Step 4 — Deploy

```bash
npm install      # first time only
npm run deploy
```

That one command type-checks, builds `dist/`, and uploads it.

When it finishes the CLI prints:

```
Hosting URL: https://galoisvision.web.app
```

> **If the deploy fails saying the site doesn't exist**, the project's default Hosting site
> hasn't been provisioned yet. Either open Firebase Console → **Hosting** → **Get started**
> (click through; you can ignore its CLI instructions, this repo is already set up), or run
> `firebase hosting:sites:create <your-project-id>`. Then re-run `npm run deploy`.

### Step 5 — Check it

Open the URL. Click into a visualization and confirm the deep link works — the URL should
read something like `https://galoisvision.web.app/v/galois-group`, and **reloading that
page should still work**. That's what the SPA rewrite in `firebase.json` is for.

**You're done.**

---

## Every deploy after this

```bash
npm run deploy
```

That's the whole workflow. Always deploy through this script rather than a bare
`firebase deploy` — it guarantees `dist/` is rebuilt first, so you never publish a stale
build.

### Rolling back a bad deploy

Firebase Console → **Hosting** → release history → **Rollback** on the previous release.
Instant, no rebuild needed.

---

## Cost

**$0/month, with a hard ceiling.**

The production build is **~320 KB total (~98 KB gzipped over the wire)**. The Spark plan
includes 10 GB of Hosting storage and 10 GB/month of transfer.

At roughly 100 KB per first-time visitor (repeat visitors are served from cache), 10 GB of
monthly transfer works out to something like **100,000 visits per month** before you'd hit
the limit. For a study-aid site, that isn't a realistic concern.

The important part: because this project has **no billing account attached**, it *cannot*
generate a charge. If it somehow exceeded the free tier, Firebase would disable the site
until the start of the next month rather than bill you. There is no payment method on file
to charge.

There is also nothing else here that could bill even in principle: no Cloud Functions, no
database, no storage bucket, no authentication. Only bandwidth.

---

## Adding a custom domain (optional, later)

If you ever buy a domain (`galoisvision.dev`, say — roughly $10–15/year, the only real
cost anywhere in this setup):

Firebase Console → **Hosting** → **Add custom domain** → enter the domain → add the TXT and
A records Firebase shows you at your registrar. Firebase provisions a free SSL certificate
automatically; it takes anywhere from a few minutes to 24 hours to go live.

No code change is needed — the `.web.app` URL keeps working alongside it.

Custom domains work on the Spark plan.

---

## What's in the repo to support this

| File | Purpose |
|---|---|
| `firebase.json` | Hosting config: serve `dist/`, SPA rewrite, cache and security headers |
| `.firebaserc` | Which Firebase project this repo deploys to — **generated by step 3** |
| `package.json` → `deploy` | Build-then-deploy in one command |
| `.gitignore` → `.firebase/` | Local deploy cache, not committed |

Three details in `firebase.json` worth understanding:

- **The SPA rewrite** (`"source": "**"` → `/index.html`) is required. The app uses
  `BrowserRouter`, so a deep link like `/v/galois-group` is not a real file on disk.
  Without the rewrite, loading or refreshing that URL would 404.
- **Cache headers** mark `/assets/**` immutable for a year (safe — Vite fingerprints those
  filenames with a content hash), while everything else is `no-cache` so a new deploy
  reaches visitors immediately instead of being served stale. **Rule order matters:** in
  Firebase Hosting the *last* matching rule wins per header, so the catch-all `**` block is
  listed first and the `/assets/**` block after it, to override the cache policy. Swapping
  them would silently make the asset caching a no-op.
- **No `site` key.** Deploys go to the active project's default Hosting site, which is
  whatever `.firebaserc` names. That's deliberate: there is no site name hardcoded that
  could point somewhere unintended.

---

## Alternative: a second site in the GroupVote project

Not recommended, and not what this repo is configured for — documented only so the
trade-off is on record.

Firebase lets one project host several sites, so GaloisVision could have lived at
`galoisvision.web.app` inside `groupvote-12796`. It would have saved creating a project.
GroupVote's URL, files and function would still have been untouched.

But the two sites would share the project's storage quota, its bandwidth free tier, and its
**Blaze billing account** — meaning a traffic spike on GaloisVision would bill to the
account behind GroupVote (about $0.15/GB past the free tier) rather than simply pausing.
A separate Spark project removes that coupling entirely, which is why it's the approach
above.

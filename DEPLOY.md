# Deploying GaloisVision

GaloisVision is a **pure static site** — React + Vite compiled to HTML/CSS/JS, all
computation runs in the visitor's browser. There is no server, no database, no API keys.
That means it can be hosted on any static CDN for **$0**.

**Chosen approach:** Firebase Hosting, as a second *site* inside the Firebase project you
already use for GroupVote (`groupvote-12796`). You already have the Firebase CLI installed
and authenticated, so this needs no new account, no new billing setup, and no new tooling.

- **Live URL (after step 2):** `https://galoisvision.web.app`
- **Cost:** $0. See [Cost](#cost) below.
- **Deploy command, forever after:** `npm run deploy`

---

## One-time setup (about 5 minutes)

### Step 1 — Confirm the Firebase CLI is ready

In a terminal, anywhere:

```bash
firebase --version      # any 13.x or newer is fine
firebase login:list     # should show your Google account
```

If `firebase` is not found:

```bash
npm install -g firebase-tools
firebase login
```

### Step 2 — Create the Hosting site

A Firebase *project* can hold several Hosting *sites*. GroupVote uses the default site;
GaloisVision gets a second one.

```bash
firebase hosting:sites:create galoisvision --project groupvote-12796
```

`galoisvision` becomes the subdomain, so the name must be globally unique across all of
Firebase. If you get `Site ID is already taken`, pick another and **remember it** — you'll
need it in step 3:

```bash
firebase hosting:sites:create galoisvision-app --project groupvote-12796
```

> **If this command fails with a message about the Blaze plan:** multi-site hosting can
> require the pay-as-you-go plan on some projects. `groupvote-12796` already runs Cloud
> Functions, so it should already be on Blaze and this should just work. If it doesn't,
> jump to [Alternative: a separate free project](#alternative-a-separate-free-project).

### Step 3 — Only if you used a different site name

The repo is already configured for the site ID `galoisvision`. If step 2 made you pick a
different name, update it in two places:

- `firebase.json` → `"site": "galoisvision"`
- `package.json` → the `deploy` script's `--only hosting:galoisvision`

Replace `galoisvision` with the name you actually created in both.

### Step 4 — Deploy

From the repository root (`GaloisVision/`):

```bash
npm install      # first time only
npm run deploy
```

That one command does three things: type-checks, builds `dist/`, and uploads it.

When it finishes the CLI prints:

```
Hosting URL: https://galoisvision.web.app
```

Open it. Click into a visualization to confirm deep links work — the URL should read
something like `https://galoisvision.web.app/v/galois-group`, and **reloading that page
should still work** (that's what the SPA rewrite in `firebase.json` is for).

**You're done.** The site is live on Google's CDN with HTTPS, and GroupVote is untouched.

---

## Every deploy after this

```bash
npm run deploy
```

That's the whole workflow. Always deploy through this script rather than a bare
`firebase deploy` — it guarantees `dist/` is rebuilt first, and it scopes the deploy to
the GaloisVision site so it can never touch GroupVote.

**Never run a bare `firebase deploy` from this repo.** It would attempt to deploy every
product in the project.

### Rolling back a bad deploy

Firebase Console → Hosting → select the **galoisvision** site → release history →
**Rollback** on the previous release. Instant, no rebuild needed.

---

## Cost

**Expected: $0/month, indefinitely.**

The production build is **~320 KB total (~98 KB gzipped over the wire)**. Firebase
Hosting's no-cost tier gives 10 GB of storage and 10 GB/month of transfer, shared across
the project.

At roughly 100 KB per first-time visitor (repeat visitors are served from cache), 10 GB of
monthly transfer is on the order of **100,000 visits per month** before you leave the free
tier. For a study-aid visualization site, that is not a realistic concern.

There is nothing else that can bill: no Cloud Functions, no database, no storage bucket, no
authentication. The only billable dimension is bandwidth.

**One caveat worth knowing:** because `groupvote-12796` is on the Blaze (pay-as-you-go)
plan, exceeding the free tier *bills* rather than shutting the site off — it's about
$0.15/GB past the first 10 GB. Realistically that means a runaway month would cost cents.
If you want a hard $0 ceiling with no billing account attached at all, use the alternative
below instead.

---

## Alternative: a separate free project

Use this if step 2 was blocked by the Blaze requirement, or if you'd rather GaloisVision
be completely isolated from GroupVote's billing and quota.

A brand-new Firebase project on the free **Spark** plan has no billing account attached,
so it *cannot* generate a charge — if it ever exceeded the free tier the site would simply
be disabled until the next month rather than billed.

1. Create a project at <https://console.firebase.google.com> — name it `galoisvision`.
   Firebase will assign an ID like `galoisvision-4f21`. Skip Google Analytics.
   Stay on the **Spark** plan.
2. In this repo, point `.firebaserc` at it:

   ```json
   {
     "projects": {
       "default": "galoisvision-4f21"
     }
   }
   ```

   (Use the real project ID the console assigned.)
3. In `firebase.json`, **delete the `"site": "galoisvision",` line.** A new project's
   default site is named after the project, and omitting the key deploys to it.
4. In `package.json`, simplify the deploy script to:

   ```
   "deploy": "npm run build && firebase deploy --only hosting"
   ```
5. `npm run deploy`. The site lands at `https://galoisvision-4f21.web.app`.

---

## Adding a custom domain (optional, later)

If you ever buy a domain (`galoisvision.dev`, say — roughly $10-15/year, the only real
cost anywhere in this setup):

Firebase Console → Hosting → **galoisvision** site → **Add custom domain** → enter the
domain → add the TXT and A records Firebase shows you at your registrar. Firebase
provisions a free SSL certificate automatically; it takes anywhere from a few minutes to
24 hours to go live.

No code change is needed — the `.web.app` URL keeps working alongside it.

---

## What's in the repo to support this

| File | Purpose |
|---|---|
| `firebase.json` | Hosting config: which site, serve `dist/`, SPA rewrite, cache and security headers |
| `.firebaserc` | Which Firebase project this repo deploys to |
| `package.json` → `deploy` | Build-then-deploy in one command, scoped to the GaloisVision site |
| `.gitignore` → `.firebase/` | Local deploy cache, not committed |

Two details in `firebase.json` worth understanding:

- **The SPA rewrite** (`"source": "**"` → `/index.html`) is required. The app uses
  `BrowserRouter`, so a deep link like `/v/galois-group` is not a real file on disk. Without
  the rewrite, loading or refreshing that URL would 404.
- **Cache headers** mark `/assets/**` immutable for a year (safe — Vite fingerprints those
  filenames with a content hash), while everything else is `no-cache` so a new deploy
  reaches visitors immediately instead of being served stale. **Rule order matters:** in
  Firebase Hosting the *last* matching rule wins per header, so the catch-all `**` block is
  listed first and the `/assets/**` block after it, to override the cache policy. Swapping
  them would silently make the asset caching a no-op.

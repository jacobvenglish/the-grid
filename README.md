# The Grid

A private library for design inspiration. Phase 1: upload, browse, search, tags and notes.

Runs entirely on Cloudflare's free tier: **Pages** (the site), **Pages Functions** (the API), **D1** (the database), **R2** (image storage) and **Access** (login, only your email).

## What's in here

```
public/              The site: index.html, style.css, app.js
functions/           The API, one file per route
  _middleware.js     Checks your Access login on every request
  api/items/         List, upload, edit and delete items
  api/tags.js        Tag list with counts
  img/[key].js       Serves images from R2
lib/db.js            Shared helpers
schema.sql           The database tables
```

## Setup (all in the Cloudflare dashboard, about 15 minutes)

**1. GitHub.** Upload everything in this folder to your `the-grid` repo.

**2. Database.** Storage & Databases › D1 › Create database. Name it `the-grid`. Open it, go to **Console**, paste all of `schema.sql`, and run it.

**3. Image storage.** R2 › Create bucket. Name it `the-grid-images`. (Cloudflare may ask for a card to turn on R2. The free tier still applies.)

**4. The site.** Workers & Pages › Create › Pages › Connect to Git › pick `the-grid`.
- Framework preset: **None**
- Build command: leave empty
- Build output directory: `public`

Deploy. It will show an error page for now. That's expected until step 6.

**5. Connect storage.** In the Pages project: Settings › Bindings › Add.
- D1 database: variable name `DB`, database `the-grid`
- R2 bucket: variable name `BUCKET`, bucket `the-grid-images`

**6. Login.** Zero Trust › Access › Applications › Add an application › Self-hosted.
- Domain: `the-grid.pages.dev` (use your real Pages domain). Add a second one, `*.the-grid.pages.dev`, so preview builds are locked too.
- Policy: Allow, Include › Emails › your email.
- Save, then open the app's settings and copy the **Application Audience (AUD) tag**.

**7. Settings.** Pages project › Settings › Variables and Secrets › Add (Production):
- `TEAM_DOMAIN` = your team domain, like `yourteam.cloudflareaccess.com` (Zero Trust › Settings › Custom pages shows it)
- `ACCESS_AUD` = the AUD tag from step 6

**8. Redeploy.** Deployments › latest › Retry deployment. Open the site, sign in with your email, and drop in some images.

## How it stays private

Access stops anyone who isn't you at the door. `functions/_middleware.js` is a second lock: it checks the signed token Access attaches to every request, and refuses everything if the token is missing, wrong, or if `TEAM_DOMAIN` / `ACCESS_AUD` aren't set.

## Using it

- **Add:** the button, drag and drop, or paste a screenshot with Cmd+V. Dragging an image from another website also saves that site's link.
- **Find:** search matches filenames, notes, source links and tags. Click a tag in the sidebar to filter.
- **Edit:** click an image to open its panel. Rename it, add tags (Enter or comma), write a note, add a source link.
- **To Figma or Illustrator:** drag an image straight out of the grid or panel, or hit Download.
- **Accent color:** change `--accent` at the top of `public/style.css`. `#00E5FF` is cyan, `#FF5F1F` is Legacy orange.

## Coming next

Phase 2: AI tag suggestions with approve and reject, auto filenames, color palettes.
Phase 3: collections, smart folders, boards, zip export.
Phase 4: browser extension and iPhone share shortcut.
Phase 5: bulk pulls and Triage.

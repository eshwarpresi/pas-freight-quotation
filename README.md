# PAS Freight Services — Quotation Builder

A single-page, no-build web app for generating Air / Sea FCL / Sea LCL / Domestic
transport quotations. Everything (charge descriptions, currencies, units,
saved quotes, bin) runs client-side in the browser — there is no server or
database to set up.

## Run it locally
Just double-click `index.html`, or serve it with any static server:
```bash
npx serve .
```

## Push to GitHub (from VS Code terminal)
```bash
cd pas-freight-quotation
git init
git add .
git commit -m "Initial commit: PAS Freight quotation builder"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```
(Create the empty repo on GitHub first — github.com → New repository — then
copy its URL into the `git remote add` line above.)

## Deploy on Vercel (free)
1. Go to vercel.com → **Add New... → Project**.
2. Import the GitHub repo you just pushed.
3. Framework preset: choose **Other**. Build command: leave empty.
   Output directory: leave as `.` (root).
4. Click **Deploy**. You'll get a live `https://your-project.vercel.app` URL.

## Deploy on Render (free)
1. Go to render.com → **New → Static Site**.
2. Connect the same GitHub repo.
3. Build command: leave empty. Publish directory: `.` (root, since `index.html`
   is at the top level).
4. Click **Create Static Site**.

## Notes
- The app loads two small libraries from a CDN (html2canvas, jsPDF) for the
  PNG/PDF download buttons — this needs an internet connection to work,
  which is true both locally and once deployed.
- "Saved Quotations" and the "Bin" are stored in the visitor's own browser
  (localStorage), per device/browser. There's no shared server database —
  if you need every teammate to see the same archive from anywhere, that
  would need a small backend added later (e.g. a free Supabase/Firebase
  project), which isn't included here.
- Your company logo is already embedded directly in the HTML file, so it
  will always show up correctly with no extra setup.

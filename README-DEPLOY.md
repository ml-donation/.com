# ML Donations — Complete GitHub + Cloudflare deployment

## Files in this ZIP
- `index.html` — main public website with the connected member dashboard embedded.
- `admin.html` — the single unified admin control panel.
- `member-dashboard.html` — standalone copy/source of the member dashboard embedded in `index.html` (for reference; GitHub Pages uses the embedded copy).
- `ml-donation-worker.js` — secure backend API.
- `wrangler.toml` — Worker configuration with the supplied JSONBin Bin ID.
- `ml-donation-jsonbin-seed.json` — initial database structure/reference.
- `ADMIN-CONTROL-GUIDE.md` — control panel feature map and boundaries.

## 1. Publish the website on GitHub Pages
1. Create a GitHub repository.
2. Upload `index.html` and `admin.html` to the repository root. Keep the other files in the repository for deployment/reference.
3. Enable GitHub Pages in the repository Settings → Pages.
4. Public website: your GitHub Pages root URL. Admin: append `/admin.html`.

## 2. Create Cloudflare storage and deploy the backend
1. Create a Cloudflare R2 bucket named `ml-donation-proofs`.
2. Install Wrangler (`npm install -g wrangler`) and log in (`npx wrangler login`).
3. From this folder, deploy the Worker configured in `wrangler.toml`. The R2 binding name must remain `PROOFS_BUCKET`.

## 3. Set secrets privately (never in GitHub)
Run these commands separately and enter each value only in the terminal prompt:

```bash
npx wrangler secret put JSONBIN_MASTER_KEY
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD
```

Use a newly rotated JSONBin Master Key, a long random session secret (32+ characters), and a strong unique admin password. The old keys previously pasted into chat should be revoked/rotated. The Access Key is not used by this Worker. Never paste replacement keys into chat or commit them to the repository.

## 4. Deploy Worker and connect both pages
Run:

```bash
npx wrangler deploy
```

Copy the deployed Worker URL, then replace `https://YOUR-CLOUDFLARE-WORKER.workers.dev/api` with your actual Worker URL plus `/api` in:
- `admin.html` (`API_BASE`)
- `index.html` (inside the JSON-embedded member dashboard; find `API_BASE`)

The separate `member-dashboard.html` is a reference copy; if you deploy/use it independently, update its `API_BASE` too. Do not upload a version with the placeholder still in place.

## 5. Restrict CORS
After you know the exact GitHub Pages origin, replace `ALLOWED_ORIGINS = "*"` in `wrangler.toml` with that origin, e.g. `https://YOUR-USERNAME.github.io`, then redeploy the Worker. If using a project subpath, the origin is still the scheme + host only (no path).

## 6. Use the unified admin panel
Open `/admin.html`, sign in, then use **Settings** for the unified controls. The admin can update the public brand/name/content/images/theme, supported section visibility, member-dashboard donation amounts/methods/payment details and Telegram support. Use **Donations request** to send a specific member verified payment instructions: open a request, enter the details, and click **Send update to member**. The member receives the instructions in their dashboard inbox.

Other admin sections manage members, payment proofs, messages and suggestions. See `ADMIN-CONTROL-GUIDE.md`.

## Important deployment and production notes
- The ZIP is prepared, but it is not live-connected until you deploy the Worker, configure secrets, replace the API URL in both pages and redeploy.
- JSONBin stores a single JSON document and may encounter size/concurrency limits as usage grows; a transactional database such as Cloudflare D1 is a better long-term production choice.
- R2 is used for payment proof image storage.
- Never store payment card details, PINs, passwords, OTPs or gift-card redemption codes. Use legitimate, verifiable payment destinations and recognized processors. Ensure all charity registration, beneficiary, impact, testimonial and donation claims are accurate and authorized.

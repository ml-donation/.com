# ML Donations — phone-friendly deployment notes (Supabase Storage edition)

## Files
- `index.html` — public website and embedded member dashboard.
- `admin.html` — unified admin panel.
- `member-dashboard.html` — standalone reference copy.
- `ml-donation-worker.js` — API Worker; stores private proof images in Supabase Storage.
- `wrangler.toml` — Worker configuration and JSONBin bin ID.
- `ml-donation-jsonbin-seed.json` — initial database structure.

## 1. GitHub Pages
Upload the site files to the repository root and enable GitHub Pages. The public site is the repository URL; admin is `/admin.html`.

## 2. Create free Supabase storage
1. Create a Supabase account and a Free project at https://supabase.com/dashboard.
2. In the project, open Storage and create a bucket named `payment-proofs`.
3. Keep the bucket **Private** (do not make it public).
4. In Project Settings → API, copy the Project URL and the `service_role` key. Treat the service-role key as a password; never put it in GitHub, HTML, or chat.

Supabase Free currently includes 1 GB file storage and 5 GB egress. Free projects may pause after a week of inactivity; check the current pricing/limits before relying on it for production.

## 3. Deploy the Cloudflare Worker
Use Cloudflare Workers & Pages to create/deploy a Worker named `ml-donation-api` from `ml-donation-worker.js`. The dashboard's editor can accept the Worker source file. Set the following Worker variables/secrets under Settings → Variables and Secrets:

Plain-text variable:
- `JSONBIN_BIN_ID` = `6af66e3fac6210605a83e112`
- `ALLOWED_ORIGINS` = your GitHub Pages origin, e.g. `https://YOUR-USERNAME.github.io` (no path)
- `SUPABASE_BUCKET` = `payment-proofs`

Secrets (use Add secret; never publish them):
- `JSONBIN_MASTER_KEY` = your JSONBin Master Key
- `SESSION_SECRET` = a newly generated random secret of at least 32 characters
- `ADMIN_PASSWORD` = a strong, unique admin password
- `SUPABASE_URL` = the Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY` = the Supabase `service_role` key

Save and deploy the Worker. No R2 bucket or Cloudflare payment card is needed for this version. Do not enable paid Workers features or add a paid plan.

## 4. Connect the pages to the Worker
After deployment, copy the Worker URL, then set `API_BASE` to `https://YOUR-WORKER.workers.dev/api` in:
- `admin.html`
- `index.html` (embedded member dashboard script; search for `YOUR-CLOUDFLARE-WORKER`)
- `member-dashboard.html` if you plan to use that standalone page.

Commit the updated HTML files to GitHub Pages.

## 5. Test
Open `https://YOUR-WORKER.workers.dev/api/health` and confirm it returns `{"ok":true,...}`. Then test member signup/login and a small test proof upload. Confirm the admin can view the proof. Delete test records afterward.

## Important limits and security
- Proof images are limited to 50 KB each by this Worker.
- JSONBin free records have a 100 KB JSON document limit, so keep database records modest; image files are stored separately in Supabase, not inside JSONBin.
- Supabase Free has usage limits and may pause inactive projects. It is not a guaranteed permanent production service.
- Restrict CORS to your exact GitHub Pages origin after testing.
- Rotate any keys/passwords that have ever been exposed. Never store payment card numbers, PINs, OTPs, or passwords for members.
- Verify the legitimacy of any donation claims and payment destinations before accepting payments.

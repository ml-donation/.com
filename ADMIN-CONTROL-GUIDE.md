# ML Donations — Unified Admin Control Panel

Open `admin.html` after deployment and sign in with the password configured as the Cloudflare Worker secret `ADMIN_PASSWORD`. This is the single admin panel for all controls implemented in this package.

## What the admin controls

### Public website
- Website name and browser title, tagline and announcement bar.
- Homepage headline, introduction and button labels.
- Logo, hero and story image URLs.
- Mission and Stories headings/content, public contact email/address and footer text.
- Theme colours, visibility of supported major sections, advanced exact-text overrides and custom CSS.

### Member dashboard and payment flow
- Donation amounts and enabled payment methods shown in the member dashboard.
- Payment destination details, including the method-specific details entered in Settings.
- Gift-card option labels and Telegram support link.
- When a member submits a payment request, the request appears under **Donations request**. Open it, enter the verified destination/instructions for that specific request, and choose **Send update to member**. The member receives those details in their dashboard inbox.
- Payment proofs can be reviewed and approved/rejected with a note.

### Member operations
- View/search members and new signups.
- Change member status, review donation requests and proof submissions.
- Send direct dashboard messages, review suggestions and refresh the overview.

## Important boundaries

This is a unified control panel for the controls implemented in the supplied website and dashboard. It is not a no-code page builder: structural features, workflows, and arbitrary new dashboard modules still require a code update. The website editor changes supported fields and optional CSS; it does not execute arbitrary JavaScript or inject arbitrary HTML.

Payment destinations must be verified and belong to the organization. Do not request or store card PINs, passwords, one-time codes, or gift-card redemption codes. Publish only truthful charity registration, impact and donation information.

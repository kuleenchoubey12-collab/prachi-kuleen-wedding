# Prachi + Kuleen wedding invitation

Mobile-ready GitHub Pages website with a private Supabase RSVP backend.

## What is ready

- The existing invitation, exact supplied GIFs, photo, signature and fonts.
- A fixed, accessible play/pause control and a bundled 30-second music excerpt (the source audio is included; playback stops at 30 seconds).
- A wedding RSVP with name, WhatsApp number, attendance, guest count and optional notes.
- A private name-and-number guest check. Eligible guests receive a golden-ticket reveal and a two-hour session.
- A separate invitation page that fetches event details only after checking the session on the server.
- Separate Haldi and Sangeet attendance, guarded by each guest's eligibility.
- Owner-only CSV exports that open in Excel.

The public `docs/config.js` deliberately has no backend URL yet. Until a real project is connected, the page explains that RSVPs are not open; it never displays a fake submission success. There are no real guest records or private event schedules in this repository.

## Files

- `docs/`: the **only** folder published by GitHub Pages.
- `supabase/migrations/`: database schema, access rules and server-only functions.
- `supabase/functions/wedding/`: the Supabase Edge Function.
- `admin/`: export queries to run privately in the Supabase SQL Editor.
- `tools/import-guests.mjs`: converts a private CSV to safely quoted import SQL.

Keep the separate `private-setup` folder out of GitHub. It contains your actual event schedule and the blank guest-list template.

## Connect Supabase

1. Sign in to https://supabase.com/dashboard and create a project. Choose a strong database password yourself; it is never needed in the invitation or this chat. Select an appropriate nearby region.
2. In **SQL Editor**, run `supabase/migrations/202610180001_wedding.sql` once.
3. Run the separate private `configure-events.sql` file. The venues currently say “Details to follow”; edit them in this private file or directly in the private database.
4. Fill the private guest CSV. Names and WhatsApp numbers must be the ones guests will enter. Aliases are separated with `|`. `haldi` and `sangeet` default to `yes`. Ordinary listed guests must have `no` for both. Unknown guests may still RSVP for the wedding, but cannot get a golden ticket.
5. From this repository folder, generate the private import file:

   ```powershell
   node tools/import-guests.mjs "C:\PRIVATE\guests.csv" "C:\PRIVATE\import-guests.sql"
   ```

   Run that generated SQL in your Supabase SQL Editor. Never upload it or the filled CSV to GitHub.
6. In **Edge Functions → Secrets**, create:
   - `ALLOWED_ORIGINS`: the exact website origin, such as `https://YOURNAME.github.io` (no repository path and no trailing slash). Multiple allowed origins can be comma-separated.
   - `WEDDING_PEPPER`: a fresh random secret of at least 32 characters, generated locally. Keep it only in Supabase's secret store.
   Supabase supplies `SUPABASE_URL` and its server-side secret keys. Do not copy these keys into the website.
7. Install/use the official Supabase CLI, sign in, then deploy from this folder:

   ```powershell
   npx supabase login
   npx supabase functions deploy wedding --project-ref YOUR_PROJECT_REF
   ```

   The provided `supabase/config.toml` disables Supabase user-JWT checking **only for this guest endpoint**. The function performs its own invitation-session checks. Do not expose the private schema in API settings.
8. Set `docs/config.js` → `apiUrl` to:

   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/wedding`

   This URL is public and is not a secret. No API key belongs in this file.

## Publish on GitHub Pages

1. Sign in to https://github.com and create a repository, for example `wedding-invite`. On GitHub Free, Pages normally uses a public repository, so upload **only this repository folder**, never the sibling private setup folder.
2. Upload the contents of `wedding-invite/`, keeping its folders intact. Keep all real guest lists and exports outside it.
3. Open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/docs`, and save.
4. Enable **Enforce HTTPS** when available. The website address is `https://YOURNAME.github.io/wedding-invite/`.
5. If you use a custom domain, update `ALLOWED_ORIGINS` to its exact HTTPS origin too.

## Read responses in Excel

In Supabase **SQL Editor**, run `admin/export-rsvps.sql`, then download the results as CSV. Open the CSV in Excel. `admin/export-all-guests.sql` also includes invited guests who have not answered yet.

Names, numbers and free-text cells are prefixed with an apostrophe to prevent spreadsheet formula execution. Keep WhatsApp numbers as text. Store exports privately.

## Check the live deployment before sharing

- Make one temporary ordinary guest and one temporary VIP guest privately in Supabase.
- On a phone, save both wedding RSVPs; confirm their rows appear in the organiser export.
- Confirm the ordinary guest does not get an extra invitation.
- Confirm the VIP guest can save both event answers and reopen them.
- Open the golden-ticket URL in a fresh/incognito tab: no event details should appear before verification.
- Try the VIP name with a wrong number: no private invitation should appear.
- Close the private invitation, then confirm the old session no longer works.
- Confirm anonymous/public Supabase clients cannot read guest/RSVP tables or execute the two privileged RPCs.
- Check the GIFs, bundled song, pause control and YouTube playback on the hosted HTTPS site.
- Remove the temporary guests and their test responses using the organiser account.

## Security and operating notes

Name plus a pre-listed phone number is a lightweight invitation check; it does not prove phone ownership. Someone who knows both can act as that guest. Use OTP verification later if you need stronger identity assurance. An authorised guest can still screenshot or share what they see.

The backend uses an unexposed private schema, row-level security with no visitor policies, explicit function grants only to the server role, hashed 256-bit session tokens, two-hour expiry, server-side event eligibility, generic unmatched responses, bounded requests and persistent rate limits. Public users have no list/export endpoint. Phone-based guessing limits do not rely on IP headers; IP limits additionally depend on the platform's trusted forwarded-address handling.

Rates are 10 name/phone attempts per number per 15 minutes and 80 requests per forwarded IP per 15 minutes. Legitimate guests sharing one phone may need distinct names and an occasional retry after that window. Ambiguous duplicate name/alias matches do not unlock a ticket.

Guest count defaults to one or two in the current invitation, matching its original +1 design. Private per-guest limits may be higher, but a larger-household selector must be added before using that feature.

The checked-in files do not contain an admin login or a public download button. Use your Supabase owner account, ideally with MFA, for organising and exporting. Remove private data when you no longer need it.

The browser's earlier local editor could save copy/photo changes that exist only on that device. The public HTML contains the current saved file's copy and media; the old local preferences are retained when available. Review the hosted copy before sharing.

## References

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://supabase.com/docs/guides/functions/deploy
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/database/functions

# Ali Livestock

Private, mobile-friendly farm management portal for Ali Livestock in Chak No. 101 D.B, Tehsil Yazman, District Bahawalpur.

Live portal: <https://portal.hwf.zeekayeditz.com>

## Included sections

- Dashboard and reminders
- Animal profiles and permanent lifecycle history
- Separate dated sales/exits with entry and exit age, weight and price
- Weight estimation and editable feed calculation
- Health, medicine, vaccination and breeding records
- Daily cow/buffalo milk production, use and sales
- Fields, crops, sugarcane and GUR production
- Labour payments and advances
- Equipment purchase and maintenance
- Income, expenses and farm reports
- Owner/worker accounts with section permissions
- Private photo, receipt and PDF attachments
- Owner-only JSON backup and audit history

## Platform

The application is built with Next.js/vinext and runs on Cloudflare Workers. Farm records are stored in Cloudflare D1 and private attachments are stored in Cloudflare KV.

## Editing and deleting entries

Every farm record section, including both expense tabs, has Edit and Delete actions for users with write access. Edit opens the existing values and saves changes to the same record. Delete requires confirmation, removes the entry from live lists and report totals, and cancels its pending reminders. Audit copies remain in the owner backup. Other independently entered records are preserved.

Animal tag corrections update related history. Editing or deleting a sale corrects the linked animal's exit status; newly created sales remember its previous status. Older sales without this information fall back to Active. Reminder schedules can be edited, disabled, or removed without duplicating active reminders. Attachments can be opened or deleted from the edit form; use its upload field to add a replacement. Owners can also edit and delete portal users, with self-deletion and removal of their own owner access blocked.

## Local development

Install dependencies with `npm install`, then use `npm run dev`. The production build is created with `npm run build`.

If the installed local Workers runtime predates the production compatibility date, set `FARM_LOCAL_COMPATIBILITY_DATE=2026-05-22` for local preview/build only. Keep the production deployment's compatibility date at `2026-08-27`.

For isolated integration checks, set `AUTH_PEPPER=local-edit-delete-test-only` in the ignored `.dev.vars` file, start the local preview at `http://localhost:3000`, then run `node tests/records.integration.mjs`. The script uses only local D1 storage, seeds disposable test entries, and checks all 14 modules, reminder synchronization, animal references, sales, account changes, attachments, and access restrictions. Never use test credentials in production.

Cloudflare resource identifiers in the deployment configuration are public binding identifiers, not credentials. No API tokens or account passwords are stored in this repository.

Production requests are permanently redirected from HTTP to HTTPS and receive HSTS and standard browser security headers.

Password verification uses a private Cloudflare Worker HMAC pepper, secure cookies and constant-time comparison. The pepper is stored only as a Cloudflare secret and is never committed to source control.

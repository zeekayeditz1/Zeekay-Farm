# Ali Livestock

Private, mobile-friendly farm management portal for Ali Livestock in Chak No. 101 D.B, Tehsil Yazman, District Bahawalpur.

Live portal: <https://portal.hwf.zeekayeditz.com>

## Included sections

- Dashboard and reminders
- Animal profiles and permanent lifecycle history
- Separate dated sales/exits with entry and exit age, weight and price
- Weight estimation and editable feed calculation
- Health, medicine, vaccination and breeding records
- Fields, crops, sugarcane and GUR production
- Labour payments and advances
- Equipment purchase and maintenance
- Income, expenses and farm reports
- Owner/worker accounts with section permissions
- Private photo, receipt and PDF attachments
- Owner-only JSON backup and audit history

## Platform

The application is built with Next.js/vinext and runs on Cloudflare Workers. Farm records are stored in Cloudflare D1 and private attachments are stored in Cloudflare KV.

## Local development

Install dependencies with `npm install`, then use `npm run dev`. The production build is created with `npm run build`.

Cloudflare resource identifiers in the deployment configuration are public binding identifiers, not credentials. No API tokens or account passwords are stored in this repository.

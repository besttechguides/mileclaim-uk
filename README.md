# MileClaim UK

Free, browser-local **HMRC mileage trip log** and **AMAP / MAR calculator** for UK tax year **2026/27**.

Unofficial helper. **Not tax advice.** Always verify rates and claiming rules on GOV.UK before you claim.

## What it does

- Log business trips (date, from, to, purpose, miles; optional passenger count for cars/vans)
- Show Approved Mileage Allowance Payment (AMAP) totals with the **10,000-mile** threshold flip for cars and vans
- Compare an employer pence-per-mile rate and estimate **Mileage Allowance Relief (MAR)** shortfall
- Illustrative tax-relief estimates at **20% / 40% / 45%** (labels as estimates only)
- Persist trips in `localStorage` (this browser only — no accounts, no server)
- Download a CSV and print a clean log

## Official rates (hard-coded)

Verified against [GOV.UK Travel — mileage and fuel rates and allowances](https://www.gov.uk/government/publications/rates-and-allowances-travel-mileage-and-fuel-allowances/travel-mileage-and-fuel-rates-and-allowances) (page updated 21 May 2026):

| Vehicle | First 10,000 miles (2026/27) | Over 10,000 |
| --- | --- | --- |
| Cars and vans | **55p** | **25p** |
| Motorcycles | **24p** | **24p** |
| Bicycles | **20p** | **20p** |

Passenger payments (cars/vans): **+5p** per passenger per business mile. This is an employer tax exemption only — there is **no MAR** if passenger payments are unpaid or below 5p.

Legacy **2025/26** car/van first-band rate (**45p**) is included for comparison.

## How to run

```bash
cd mileclaim-uk
python3 -m http.server 8080
```

Open http://localhost:8080 in your browser.

Or open `index.html` directly (some browsers restrict `localStorage` on `file://`).

## Files

- `index.html` — app shell
- `styles.css` — mobile-first, print-friendly styles
- `app.js` — all logic
- `.nojekyll` — GitHub Pages

## Disclaimer

This tool does not file anything with HMRC, does not replace professional advice, and may lag official rate changes. Confirm before claiming:

- [Travel — mileage and fuel rates and allowances](https://www.gov.uk/government/publications/rates-and-allowances-travel-mileage-and-fuel-allowances/travel-mileage-and-fuel-rates-and-allowances)
- [Tax relief for employees — vehicles you use for work](https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work)

## Privacy

No analytics, no accounts, no network calls for your trip data. Everything stays in your browser’s `localStorage`.

## Claim pack

Soft sell for a paid “HMRC Mileage Claim Pack 2026/27” (£9–£14). Payhip link not live yet — CTA is deliberately disabled.

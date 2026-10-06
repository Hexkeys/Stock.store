# Stock.store

A simple private-company ownership dashboard with server-side saving.

## What it does

- Edit company value.
- Add, edit, and remove owners.
- Calculate ownership as investment / company value × 100.
- Example: ฿1 invested in a ฿1,000 company = 0.1%.
- Show ownership in a pie chart.
- Show a stock-style company valuation chart with 1D, 1W, 1M, 3M, 6M, 1Y, and ALL ranges.
- Hover/touch the valuation chart to inspect a recorded value and timestamp.
- Record valuation points manually, or let value changes automatically add chart history.
- Calculate each owner's weekly payout from company value.
- Save data through the server API.
- Store the data in Render Postgres when DATABASE_URL is configured.
- Weekly payout formula: company value × ownership %. Example: 1% of ฿1,000 = ฿10 per week.

## Render setup

This repository is now a **Node Web Service**, not a Static Site.

Use:

- Branch: `main`
- Root Directory: leave blank
- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

The included `render.yaml` defines the web service and a Postgres database and connects the service to the database with `DATABASE_URL`.

## Navigation

The app has four simple areas:

- Dashboard — company value, total investment, ownership chart, and payout summary.
- Owners — edit investors and investments.
- Payouts — see the weekly amount for each owner.
- Settings — edit company value, weekly company value, and share count.

## Note

The app calculates and stores ownership/payout information but does not transfer money or issue legal securities. Add authentication and proper legal/accounting controls before using it with real investors or real payments.

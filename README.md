# Fashion Recommendation App

An event-aware fashion recommendation app that turns a starter item into a complete, shoppable outfit.

Customers can choose a starter product, event, style preference, budget, store, and urgency. The app returns an outfit grounded in the catalog, adds local inventory signals, suggests substitutions for low-stock items, and generates stylist-ready follow-up copy.

## Features

- Event-aware outfit recommendations.
- Catalog-grounded retrieval using embeddings.
- Inventory, budget, urgency, and substitution logic.
- Optional AI image analysis, recommendation review, and stylist chat when an API key is configured.
- Deterministic local fallback when no API key is set.

## Run Locally

```bash
npm run prepare:data
OPENAI_API_KEY="..." npm start
```

Open `http://localhost:4173`.

The app also works without `OPENAI_API_KEY`; it uses the local fallback path.

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Add `OPENAI_API_KEY` as an environment variable if you want the AI-powered path.
4. Deploy.

The included `vercel.json` routes all requests through the Node handler in `server/index.mjs`.

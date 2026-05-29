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

By default the live OpenAI path uses:

- `gpt-5.4-nano` for low-latency image analysis, JSON extraction, and short copy tasks.
- `gpt-5.4-mini` for the final visual recommendation review and tool-using chat agent.
- `text-embedding-3-large` for semantic catalog retrieval.

Optional model overrides:

```bash
OPENAI_MODEL_FAST="gpt-5.4-nano"
OPENAI_MODEL_REASONING="gpt-5.4-mini"
OPENAI_REASONING_EFFORT_FAST="low"
OPENAI_REASONING_EFFORT_REASONING="medium"
OPENAI_TEXT_VERBOSITY="low"
```

Optional Braze email delivery is configured server-side with:

```bash
BRAZE_REST_ENDPOINT="https://rest.fra-02.braze.eu"
BRAZE_REST_API_KEY="..."
BRAZE_OUTFIT_EMAIL_CAMPAIGN_ID="..."
PUBLIC_APP_URL="https://fashion-recommendation-app.vercel.app"
```

Optional executive briefing editing is configured server-side with:

```bash
BLOB_READ_WRITE_TOKEN="..."
BRIEFING_EDIT_PIN="1234"
```

If `BLOB_READ_WRITE_TOKEN` is not set, `/briefing` uses the checked-in default content and local in-memory saves for development only.

## Deploy To Vercel

1. Push this repository to GitHub.
2. Import the repo in Vercel.
3. Add `OPENAI_API_KEY` as an environment variable if you want the AI-powered path.
4. Add the Braze environment variables above if you want Mira to send triggered outfit emails.
5. Add `BLOB_READ_WRITE_TOKEN` if you want executive briefing edits to persist globally.
6. Deploy.

The included `vercel.json` routes all requests through the Node handler in `server/index.mjs`.

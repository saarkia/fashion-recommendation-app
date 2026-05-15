# RetailNext Fashion Recommendation App Handoff

This project is the **RetailNext Fashion Recommendation App**. It is a small Node.js web app that recommends shoppable outfits from a starter item, event context, local inventory, and optional OpenAI-powered retrieval/reasoning.

Future agents: keep the live GitHub and Vercel deployment in sync. If you change the app, commit and push to GitHub, then verify the Vercel production deployment. Do not leave useful work only on the local machine.

## What This App Does

- Lets a stylist or shopper choose a starter item from the local catalog, or upload/paste their own image.
- Captures event intent: occasion, style preference, store, budget, and urgency.
- Runs recommendation generation only after the **Generate outfit** button is pressed.
- Shows a live progress rail while generation runs.
- Returns a basket of outfit pieces with prices, fit scores, inventory context, and rationale.
- Enables chat-style refinement after a recommendation is created when OpenAI is configured.

## Current Product Direction

- The brand is **RetailNext**.
- The visual style is inspired by END.'s blocky retail design language: centered masthead, hard borders, monochrome palette, category navigation, large editorial hero, sharp product grid, and minimal rounded corners.
- The app should not refer to interviews or internal evaluation context. Describe it as a fashion recommendation or retail stylist app.
- Mobile polish matters. Always check both desktop and mobile after UI changes.

## Project Structure

- `server/index.mjs`: Node HTTP server, API routes, OpenAI calls, local vector search, recommendation logic, and static file serving.
- `public/index.html`: Main HTML shell.
- `public/styles.css`: Full UI styling, including RetailNext branding, responsive layout, and generation animations.
- `public/app.js`: Frontend state, form handling, upload handling, generation flow, rendering, and chat refinement.
- `public/catalog-images/`: Local catalog product images.
- `data/products.json`: Product metadata, inventory, prices, and image paths.
- `data/embeddings.f32`: Prepared embedding vectors used for local vector search.
- `data/metadata.json`: Data preparation metadata.
- `scripts/prepare_data.py`: Regenerates prepared data if needed.
- `vercel.json`: Vercel routing/configuration.
- `.vercel/project.json`: Local Vercel project link. This is intentionally ignored by git.

## How It Works

1. `server/index.mjs` loads `data/products.json` and `data/embeddings.f32` at startup.
2. The frontend calls `/api/bootstrap` to load events, styles, stores, inspiration products, model names, and whether OpenAI is configured.
3. The UI starts idle. No recommendation generation should run on page load, item selection, uploads, paste, or clear.
4. Pressing **Generate outfit** starts the loading state in `public/app.js`.
5. The app posts user context and starter item data to the recommendation API.
6. The server uses a mix of OpenAI and fallback logic:
   - OpenAI vision/copy/review when `OPENAI_API_KEY` is present.
   - `text-embedding-3-large` for embedding-backed retrieval when available.
   - Local metadata and ranking fallbacks when OpenAI is unavailable.
7. The frontend renders the outfit basket and enables refinement chat if OpenAI is live.

## Local Development

From the project root:

```bash
npm start
```

Default local URL:

```text
http://localhost:4173
```

The server also respects `PORT`, for example:

```bash
PORT=4175 npm start
```

Useful checks:

```bash
node --check public/app.js
node --check server/index.mjs
git diff --check
```

If data files are missing:

```bash
npm run prepare:data
```

## Environment Variables

OpenAI support is controlled by environment variables:

- `OPENAI_API_KEY`: Required for live OpenAI features.
- `OPENAI_MODEL`: Optional, defaults to `gpt-4o-mini`.
- `OPENAI_EMBEDDING_MODEL`: Optional, defaults to `text-embedding-3-large`.
- `OPENAI_TIMEOUT_MS`: Optional, defaults to `20000`.

On Vercel, `OPENAI_API_KEY` is already configured for production as of the latest handoff. Verify with:

```text
https://fashion-recommendation-app.vercel.app/api/bootstrap
```

The JSON should include:

```json
{ "hasOpenAI": true }
```

## Deployment Rules

This is mandatory:

1. Make the local code change.
2. Run the relevant local checks.
3. Commit the change to git.
4. Push `main` to GitHub.
5. Confirm Vercel deploys the pushed commit.
6. Verify the live production URL.

Do not stop after local edits. Do not stop after a Vercel-only deploy. The source of truth must remain GitHub, and the public app must remain Vercel production.

GitHub repo:

```text
https://github.com/saarkia/fashion-recommendation-app
```

Production app:

```text
https://fashion-recommendation-app.vercel.app
```

Vercel project details from local link:

```text
projectId: prj_kUrYxSUPjYRgfl3EulNm9TM9wksb
orgId: team_hUo2QxnIXGcjusmk195YeX4j
projectName: fashion-recommendation-app
```

## Updating GitHub

Typical flow:

```bash
git status --short --branch
git add <changed files>
git commit -m "Clear, specific commit message"
git push origin main
```

After pushing, check that the working tree is clean:

```bash
git status --short --branch
```

Expected clean state:

```text
## main...origin/main
```

## Updating Vercel

Vercel is connected to the GitHub repo and should auto-deploy pushes to `main`.

After pushing, list deployments and confirm:

- `state` is `READY`
- `target` is `production`
- `githubCommitSha` matches the commit you pushed
- `githubCommitMessage` matches your commit

Then verify the live URL:

```text
https://fashion-recommendation-app.vercel.app
```

Also verify OpenAI config after deploy:

```text
https://fashion-recommendation-app.vercel.app/api/bootstrap
```

Look for `"hasOpenAI": true`.

## Current Recent Work

Most recent commits at handoff:

- `b9b7a6f` - Polish RetailNext brand and progress animations
- `c9d0b01` - Refine generation progress and idle state
- `20a141f` - Ignore Vercel project metadata
- `30cf673` - Initial Fashion Recommendation App

Recent behavior changes:

- The app no longer auto-generates on load.
- Generation only starts when **Generate outfit** is pressed.
- The refresh button is disabled until there is an existing recommendation.
- The progress rail expands the active step and animates handoffs between stages.
- The main result area shows animated build tiles during generation.
- Header and theme now use a blocky RetailNext retail style.

## UI QA Checklist

After any frontend change:

- Check desktop around `1440x900`.
- Check mobile around `390x844`.
- Confirm there is no horizontal overflow on mobile.
- Confirm the hero headline does not collide with the black campaign block.
- Confirm the centered `retailNEXT.` wordmark remains legible.
- Press **Generate outfit** and confirm progress appears only after the button press.
- Confirm the active progress step is visible in the assistant rail.
- Confirm recommendations render after generation.
- Check browser console for errors.

## Important Implementation Notes

- Keep UI copy external-facing and retail-focused.
- Avoid mentioning internal interview context.
- Preserve the idle-first generation behavior.
- Keep Vercel secrets out of git.
- Do not commit `.vercel/`; it is intentionally ignored.
- Avoid deleting catalog images or data unless you also update data generation and verify recommendations.
- If changing the design, prefer sharp, blocky, high-contrast retail UI over soft SaaS styling.
- If changing OpenAI model usage, verify both configured and fallback paths.

## Quick Recovery Notes

If the live site looks stale after a push:

1. Confirm the latest commit is on GitHub.
2. Check Vercel deployments for the latest commit SHA.
3. If deployment is not created, inspect the GitHub/Vercel connection.
4. If deployment failed, inspect Vercel build logs.
5. If deployment is `READY` but the site looks old, hard refresh and fetch the live HTML/CSS/JS directly.

If OpenAI features stop working:

1. Check `/api/bootstrap` for `hasOpenAI`.
2. Confirm `OPENAI_API_KEY` exists in Vercel production environment variables.
3. Redeploy after changing Vercel environment variables.
4. Verify fallback generation still works even without OpenAI.

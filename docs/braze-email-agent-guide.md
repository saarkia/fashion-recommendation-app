# Braze Email Agent Guide

This guide explains how to add an optional "send this outfit to me" workflow to the RetailNext Event Stylist app using OpenAI-generated email copy and Braze API-triggered campaigns.

## What We Are Adding

When a customer asks the stylist agent to email the recommended outfit, the app should first call OpenAI to write a polished, customer-specific email story. Then the app should call Braze and trigger a campaign that uses this template:

```text
emails/retailnext-outfit-recommendation-braze.html
```

The HTML structure should live in Braze as an API-triggered campaign. The app should not send raw HTML directly through Braze on each request. Instead, OpenAI writes the personalized copy and the app sends that copy plus product data as `trigger_properties`; Braze renders the saved campaign with Liquid.

The demo point is important: Braze handles orchestration and deliverability, while OpenAI turns the recommendation into a high-quality stylist narrative. Do not rely on generic copy in the production path.

## Braze Campaign Setup

1. Create an email campaign in Braze.
2. Set delivery to API-triggered delivery.
3. Paste the HTML from `emails/retailnext-outfit-recommendation-braze.html` into the email body.
4. Set the subject line with Liquid so OpenAI can personalize it:

```text
{{api_trigger_properties.${email_subject} | default: 'Your RetailNext stylist edit is ready'}}
```

5. Save the campaign ID.
6. Create a Braze REST API key with `campaigns.trigger.send`.

## Environment Variables

Add these to local `.env` if you introduce dotenv, and to Vercel production environment variables:

```text
BRAZE_REST_ENDPOINT=https://rest.iad-01.braze.com
BRAZE_REST_API_KEY=...
BRAZE_OUTFIT_EMAIL_CAMPAIGN_ID=...
PUBLIC_APP_URL=https://fashion-recommendation-app.vercel.app
```

Use the correct Braze REST endpoint for the workspace. `rest.iad-01.braze.com` is only an example.

## Image URL Rule

Braze needs publicly reachable image URLs. Catalog products already map to files under `/catalog-images/{id}.jpg`, and Vercel serves them from:

```text
https://fashion-recommendation-app.vercel.app/catalog-images/27152.jpg
```

When building trigger properties, convert every catalog image path into an absolute URL:

```js
function absoluteImageUrl(product) {
  if (product.image?.startsWith("http")) return product.image;
  if (product.image?.startsWith("/")) return `${PUBLIC_APP_URL}${product.image}`;
  return `${PUBLIC_APP_URL}/catalog-images/${product.id}.jpg`;
}
```

For uploaded customer images, do not send data URLs to Braze unless you have explicitly hosted them. If the starter item is uploaded and not publicly hosted, omit `starter_image_url` or replace it with the first recommended catalog image.

## OpenAI Email Copy

Add a server helper before the Braze send:

- `generateOutfitEmailCopy({ firstName, recommendation })`
- Uses the existing OpenAI configuration already present in `server/index.mjs`.
- Returns JSON only.
- Falls back to the current recommendation copy only if OpenAI is unavailable.

Recommended OpenAI output shape:

```json
{
  "email_subject": "Your spring wedding edit is ready",
  "preheader": "A polished outfit built around your blue shirt, with local availability checked.",
  "hero_headline": "A polished wedding look, built around your blue shirt.",
  "hero_intro": "I styled your blue striped shirt as the anchor for an outdoor spring wedding, then balanced it with lighter formal pieces that feel sharp without getting too heavy for the season.",
  "outfit_story": "The shirt gives the outfit a crisp starting point, so the rest of the basket adds structure, contrast, and event polish. The grey trousers keep the palette soft, the black formal shoes ground the look, and the final layer gives you a more finished option if the weather turns.",
  "starter_note": "The shirt already has enough pattern and color to lead the look, so I treated it as the anchor rather than recommending another top.",
  "associate_note": "Everything here is selected to make the outfit easy to try on in one visit, with a backup ready if a size sells through.",
  "cta_label": "View and refine this look",
  "items": [
    {
      "id": 12345,
      "why": "These trousers soften the blue shirt and keep the outfit formal enough for the ceremony without feeling corporate.",
      "pairing_note": "The neutral tone also makes the shoes feel intentional rather than heavy."
    }
  ],
  "substitute_note": "If the trousers sell through, this backup keeps the same polished palette and works with the shirt and shoes."
}
```

Recommended OpenAI prompt:

```text
You are a RetailNext stylist writing a personalized triggered email after a customer asked to receive their AI-generated outfit.

Write polished, specific, customer-facing copy. Do not sound generic. Explain why the exact items work together: color, formality, event fit, seasonality, inventory urgency, and how the starter item anchors the outfit.

Return only JSON with:
- email_subject
- preheader
- hero_headline
- hero_intro
- outfit_story
- starter_note
- associate_note
- cta_label
- items: array of { id, why, pairing_note }
- substitute_note

Constraints:
- Keep subject under 58 characters.
- Keep preheader under 110 characters.
- Keep hero_intro to 1 sentence.
- Keep outfit_story to 2 concise sentences.
- Keep each item why to 1 sentence.
- Keep pairing_note to 1 short sentence.
- Do not invent products, inventory counts, prices, colors, or stores.
- Do not claim items are reserved or purchased.
- Mention the selected store only if it is present in the input.
- Tone: premium retail stylist, direct and useful.
```

## API Call Shape

Call:

```text
POST {BRAZE_REST_ENDPOINT}/campaigns/trigger/send
Authorization: Bearer {BRAZE_REST_API_KEY}
Content-Type: application/json
```

Recommended payload when sending by email address:

```json
{
  "campaign_id": "BRAZE_OUTFIT_EMAIL_CAMPAIGN_ID",
  "broadcast": false,
  "recipients": [
    {
      "email": "customer@example.com",
      "prioritization": ["identified", "most_recently_updated"],
      "send_to_existing_only": false,
      "attributes": {
        "email": "customer@example.com",
        "first_name": "Maya"
      },
      "trigger_properties": {
        "email_subject": "Your spring wedding edit is ready",
        "customer_first_name": "Maya",
        "preheader": "A polished outfit built around your blue shirt, with local availability checked.",
        "hero_headline": "A polished wedding look, built around your blue shirt.",
        "hero_intro": "I styled your blue striped shirt as the anchor for an outdoor spring wedding, then balanced it with lighter formal pieces that feel sharp without getting too heavy for the season.",
        "outfit_story": "The shirt gives the outfit a crisp starting point, so the rest of the basket adds structure, contrast, and event polish. The grey trousers keep the palette soft, the black formal shoes ground the look, and the final layer gives you a more finished option if the weather turns.",
        "cta_label": "View and refine this look",
        "cta_url": "https://fashion-recommendation-app.vercel.app",
        "event_name": "Outdoor Spring Wedding",
        "style_preference": "Classic",
        "store_name": "New York Herald Square",
        "urgency_label": "Available today",
        "basket_value": 342,
        "outfit_count": 4,
        "available_today_count": 4,
        "starter_item_name": "Mark Taylor Men Striped Blue Shirt",
        "starter_image_url": "https://fashion-recommendation-app.vercel.app/catalog-images/27152.jpg",
        "starter_note": "The shirt already has enough pattern and color to lead the look, so I treated it as the anchor rather than recommending another top.",
        "associate_note": "Everything here is selected to make the outfit easy to try on in one visit, with a backup ready if a size sells through.",
        "item_1_name": "Product name",
        "item_1_role": "Shoes",
        "item_1_image_url": "https://fashion-recommendation-app.vercel.app/catalog-images/12345.jpg",
        "item_1_meta": "Formal Shoes / Black / 4 in store",
        "item_1_why": "Black formal shoes balance the blue shirt and fit the event.",
        "item_1_pairing_note": "They ground the lighter palette without pulling attention from the shirt.",
        "item_1_price": 96,
        "item_1_fit_score": 93,
        "item_2_name": "Product name",
        "item_2_role": "Bottom",
        "item_2_image_url": "https://fashion-recommendation-app.vercel.app/catalog-images/23456.jpg",
        "item_2_meta": "Trousers / Grey / 3 in store",
        "item_2_why": "Grey trousers keep the look polished without feeling too formal.",
        "item_2_pairing_note": "The neutral color gives the shirt room to be the statement.",
        "item_2_price": 84,
        "item_2_fit_score": 91,
        "substitute_1_name": "Backup product",
        "substitute_1_image_url": "https://fashion-recommendation-app.vercel.app/catalog-images/34567.jpg",
        "substitute_1_for_item_name": "Grey trousers",
        "substitute_1_inventory_count": 2,
        "substitute_1_note": "This backup keeps the same polished palette if the trousers sell through."
      }
    }
  ]
}
```

The template supports up to four primary items with `item_1_*` through `item_4_*`, plus one backup item with `substitute_1_*`. The production path should populate the copy fields from OpenAI every time.

## App Changes To Make

Implement server-side helpers in `server/index.mjs`:

- `generateOutfitEmailCopy({ firstName, recommendation })`
- `sendOutfitEmail({ email, firstName, recommendation })`
- Build Braze trigger properties from the current recommendation plus the generated copy.
- Use `fetch` to call `/campaigns/trigger/send`.
- Return Braze response JSON, including `dispatch_id` if present.
- Never expose `BRAZE_REST_API_KEY` to the browser.

Add a new API route:

```text
POST /api/send-outfit-email
```

Suggested body:

```json
{
  "email": "customer@example.com",
  "firstName": "Maya",
  "currentRecommendation": {}
}
```

The route should:

1. Validate email shape.
2. Validate that a recommendation with outfit items exists.
3. Generate email copy with OpenAI.
4. Call `sendOutfitEmail`.
5. Return `{ "ok": true, "dispatchId": "..." }` or a useful error.

Update the stylist agent behavior:

- Detect when the user asks to email, send, or share the outfit.
- If no recommendation exists, say to generate an outfit first.
- If no email address is present in the message, ask for it.
- If an email address is present and a recommendation exists, call `/api/send-outfit-email`.
- Add an assistant message confirming the email was triggered.

Optional UI polish:

- Add a quick prompt button: `Email this outfit`.
- When the agent asks for an email address, keep the current basket unchanged.
- Show failures as "I could not send the email yet..." rather than losing the recommendation.

## Prompt For Another Codex Thread

Copy and paste this into the other Codex thread:

```text
We are adding an OpenAI + Braze email send flow to the RetailNext Event Stylist app.

Context:
- Project path: /Users/aria-mini/Documents/OpenAI Solution Engineer Interview/retailnext-event-stylist
- Existing app is a Node.js server in server/index.mjs with frontend logic in public/app.js.
- A Braze campaign HTML template exists at emails/retailnext-outfit-recommendation-braze.html.
- Implementation notes exist at docs/braze-email-agent-guide.md.

Goal:
When the customer asks the stylist agent to email/send/share their outfit, the app should use OpenAI to write the email copy, then trigger a Braze API-triggered email campaign using /campaigns/trigger/send. The HTML frame lives in Braze; the app sends OpenAI-written copy and product data through trigger_properties for Liquid personalization.

Requirements:
1. Add env vars expected by the server:
   - BRAZE_REST_ENDPOINT
   - BRAZE_REST_API_KEY
   - BRAZE_OUTFIT_EMAIL_CAMPAIGN_ID
   - PUBLIC_APP_URL, defaulting to https://fashion-recommendation-app.vercel.app
2. Add generateOutfitEmailCopy({ firstName, recommendation }) in server/index.mjs.
   - Use the existing OpenAI helper/config.
   - Return JSON with email_subject, preheader, hero_headline, hero_intro, outfit_story, starter_note, associate_note, cta_label, items[{ id, why, pairing_note }], and substitute_note.
   - Prompt the model to explain why the exact clothing items work together: color, formality, event fit, seasonality, inventory urgency, and how the starter item anchors the outfit.
   - Do not invent products, prices, colors, inventory, stores, reservations, or purchases.
3. Add sendOutfitEmail({ email, firstName, recommendation }) in server/index.mjs.
4. Add POST /api/send-outfit-email. Body should include email, optional firstName, and currentRecommendation.
5. Build trigger_properties matching emails/retailnext-outfit-recommendation-braze.html:
   - email_subject, customer_first_name, preheader, hero_headline, hero_intro, outfit_story, cta_label, cta_url
   - event_name, style_preference, store_name, urgency_label
   - basket_value, outfit_count, available_today_count
   - starter_item_name, starter_image_url, starter_note
   - associate_note
   - item_1_* through item_4_* for outfit products, including OpenAI-written item_N_why and item_N_pairing_note
   - substitute_1_* for the first substitute, plus OpenAI-written substitute context if useful
6. For product image URLs, convert /catalog-images/{id}.jpg to absolute Vercel URLs, e.g. https://fashion-recommendation-app.vercel.app/catalog-images/27152.jpg.
7. Do not send data URLs to Braze for uploaded images unless they are hosted; omit starter_image_url when needed.
8. Braze request:
   POST {BRAZE_REST_ENDPOINT}/campaigns/trigger/send
   Authorization: Bearer {BRAZE_REST_API_KEY}
   body includes campaign_id, broadcast:false, recipients:[{ email, prioritization:["identified","most_recently_updated"], send_to_existing_only:false, attributes:{ email, first_name:firstName }, trigger_properties }]
9. Update public/app.js so the stylist chat recognizes email/send/share intent:
   - If no current recommendation, say to generate an outfit first.
   - If no email address was provided, ask for it.
   - If an email address exists, call /api/send-outfit-email with the current recommendation.
   - On success, confirm the email was sent/triggered and mention that the email includes the stylist rationale.
   - On failure, show a graceful error and keep the basket unchanged.
10. Add a quick prompt button "Email this outfit" if it fits the UI.
11. Run node --check public/app.js and node --check server/index.mjs after edits.

Use Braze campaign trigger properties with Liquid syntax like {{api_trigger_properties.${item_1_name}}}. Do not expose the Braze API key client-side. The goal is to show the OpenAI magic, so the sent trigger_properties should be rich, specific, LLM-written text, not generic placeholder copy.
```


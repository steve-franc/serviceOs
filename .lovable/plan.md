# Hybrid Receipt Scanner (Tesseract + AI Fallback)

Improve scan accuracy by keeping the fast/free local OCR, and automatically calling a vision AI model when Tesseract fails to produce usable results.

## How it works

1. User captures or uploads a receipt image (same UX as today).
2. **Pass 1 — Tesseract (local, free):**
   - Preprocess the image (grayscale + contrast boost on a canvas) to improve OCR quality.
   - Run Tesseract with `tur+eng` languages and PSM 6 (uniform block) instead of `eng` only.
   - Parse with existing regex.
3. **Decide:** if Tesseract returns **< 2 line items**, or supplier/date/total are all missing → trigger fallback.
4. **Pass 2 — AI vision (Lovable AI Gateway):**
   - Send the image (base64) to a new edge function `scan-receipt`.
   - The function calls `google/gemini-2.5-flash` with a tool-calling schema that returns structured JSON: `supplier`, `purchase_date`, `total`, `items[]`.
   - The function handles 429 / 402 errors and returns a friendly message.
5. UI shows a small badge in the review step indicating which engine produced the result ("Local OCR" or "AI vision"), then the existing review/edit flow runs unchanged.
6. If the user manually clicks a new **"Re-scan with AI"** button in the review modal, force the AI pass on demand even if Tesseract succeeded.

## Files changed

- **New** `supabase/functions/scan-receipt/index.ts` — accepts `{ image_base64, mime_type }`, calls Lovable AI Gateway with tool-calling for structured output, returns parsed receipt JSON. Handles CORS, 429, 402.
- **Edit** `src/components/ReceiptScanner.tsx`:
  - Add canvas-based image preprocessing helper.
  - Update Tesseract call: `tur+eng`, `tessedit_pageseg_mode: 6`.
  - After Tesseract, evaluate quality; if poor → call `supabase.functions.invoke('scan-receipt', ...)`.
  - Track `engine: "tesseract" | "ai"` and show a badge in the review header.
  - Add **"Re-scan with AI"** button on the review screen.
  - Show toast on AI rate-limit / credit errors.
- **No DB changes**, no changes to `Restock.tsx` business logic.

## Technical details

- Default extractor model: `google/gemini-2.5-flash` (cheap, fast, strong at receipts incl. Turkish).
- Structured output via OpenAI-compatible tool calling (`tools` + forced `tool_choice`) — not "return JSON" prompting.
- Edge function deploys with default `verify_jwt = false`; we still validate the request body with Zod.
- Image is sent as a single user message with `image_url` content part; data URL built from base64 + mime.
- Fallback trigger threshold (`< 2 items`) is a single constant for easy tuning later.
- No new dependencies on the frontend (canvas + existing `tesseract.js`); no new tables; no secrets to add (Lovable AI is pre-provisioned).

## Out of scope

- Learning/alias dictionary from user corrections (separate future task).
- Storing scan history / audit log of receipts.
- Multi-receipt batch upload.

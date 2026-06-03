# Production setup — OCR, email & WhatsApp (Render + Netlify)

## Why you see those 3 messages

| Message | Cause |
|---------|--------|
| OCR returned no text… | Render server has **no Tesseract** (or image too blurry). |
| Email not sent: No primary email… | OCR did not extract an **email** (fix OCR or type it on Review). |
| WhatsApp not sent: No primary phone… | OCR did not extract a **phone** (fix OCR or type it on Review). |

Fix **OCR first**; messages 2 and 3 usually disappear once name/email/phone are filled.

---

## Part A — Push latest code

```bash
git add .
git commit -m "Docker OCR, browser fallback, production URLs"
git push
```

---

## Part B — Render API (OCR + email + WhatsApp)

### B1. Switch to Docker (required for server OCR)

On Render **Free**, there is no **Runtime** row on the **General** tab. The **Python 3** badge at the top is your current runtime.

**Where to change it (2026 dashboard):**

1. Open https://dashboard.render.com → **Business-Card-Scanner-2**
2. Left menu → **Settings**
3. Right sidebar → click **Build** (not General)
4. Under **Build** → **Source** → click **Edit**
5. In **Update Source**:
   - **Runtime / Language:** choose **Docker**
   - **Dockerfile path:** `./Dockerfile`
   - **Build command:** leave empty (Dockerfile handles install)
   - **Start command:** leave empty (uses `CMD` in Dockerfile)
6. Save → Render starts a new deploy (first Docker build ~5–10 min)

**If you do not see “Docker” in that dialog** (some older services):

- Create a **new** Web Service: **New +** → **Web Service** → same GitHub repo
- At creation, set **Language** to **Docker** (not Python 3)
- **Dockerfile path:** `./Dockerfile`
- Plan: **Free**
- Copy all **Environment** variables from the old service
- Use the **new** URL in Netlify `VITE_API_URL` (or rename service to keep the same hostname if Render allows)

**Free plan note:** Docker on Free is supported; builds are slower and the service sleeps when idle (cold start ~30s).

### B2. Environment variables (Render → Environment)

Copy from your local `.env` / `backend/.env`. Minimum for outreach:

| Key | Example / notes |
|-----|-----------------|
| `FRONTEND_URL` | `https://businesscardscannertesting.netlify.app` |
| `ALLOWED_ORIGINS` | same as above |
| `CONTACT_STORAGE` | `indexeddb` (current) or `postgresql` if you use DB on Render |
| `WHATSAPP_ACCESS_TOKEN` | From Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | From Meta |
| `WHATSAPP_GRAPH_API_VERSION` | `v21.0` |
| `GMAIL_USER` | Gmail address |
| `GMAIL_APP_PASSWORD` | Gmail app password |
| `ZOHO_CLIENT_ID` | From Zoho |
| `ZOHO_CLIENT_SECRET` | |
| `ZOHO_REFRESH_TOKEN` | |

### B3. Deploy

**Manual Deploy** → Deploy latest commit. Wait until **Live** (first Docker build may take 5–10 min).

### B4. Verify OCR on server

Open: https://business-card-scanner-2.onrender.com/health

You need:

```json
"ocr": { "tesseract_available": true }
```

If `ocr` is missing or `false`, runtime is still not Docker or deploy failed — check **Logs**.

### B5. Test OCR in Postman or Swagger

- POST https://business-card-scanner-2.onrender.com/scan-card  
- Form field `card` = JPG/PNG business card  
- Response should include `raw_text` with readable text (not empty).

---

## Part B-alt — No Docker? Use browser OCR only (Free, easiest)

If you cannot switch to Docker:

1. **Redeploy Netlify** only (push latest code → Clear cache and deploy)
2. Unregister service worker in the browser (F12 → Application)
3. Scan on https://businesscardscannertesting.netlify.app/scan  
   → App calls Render, gets empty text, then runs **Tesseract in the browser**
4. On **Review**, confirm **email** and **phone** are filled (edit manually if needed)
5. **Save** — WhatsApp/email need those fields + env vars on Render

Server OCR will not work until Docker is enabled; browser OCR can still read cards.

---

## Part C — Netlify frontend

1. **Site configuration** → **Environment variables**  
   - `VITE_API_URL` = `https://business-card-scanner-2.onrender.com`
2. **Deploys** → **Trigger deploy** → **Clear cache and deploy site**
3. Browser: DevTools → Application → **Unregister** service worker → hard refresh

After deploy, scanning should:
1. Call Render OCR first  
2. If empty, use **browser OCR** automatically  
3. Show fields on Review — **edit email/phone** if still missing  

---

## Part D — End-to-end test on Netlify

1. Open https://businesscardscannertesting.netlify.app/scan  
2. Upload a **clear, well-lit** card photo (not blurry)  
3. On **Review**, confirm **Full name**, **Email**, **Phone** are filled  
4. Save — WhatsApp/email only send if those fields exist and Render env has tokens  

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Still “Install Tesseract on this machine” | Render not on Docker; redeploy with `Dockerfile` |
| `tesseract_available: false` | Check build logs; ensure `Dockerfile` is at repo root |
| CORS errors | Set `FRONTEND_URL` on Render; redeploy API |
| Email/WhatsApp skipped | Add phone/email on Review, or fix OCR; set Gmail/WhatsApp env on Render |
| Old API URL in browser | Netlify clear-cache redeploy; unregister `sw.js` |

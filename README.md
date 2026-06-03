# CardSync AI — Setup & Run Guide

---

## 1. How to run the FRONTEND (website)

Open **Terminal 2** and run:

```
cd c:\Sandeep\Sandeep_Projects\Yogesh\cardsync-ai-main\cardsync-ai-main
npm run dev
```

When you see `Local: http://localhost:5173` — open that link in Chrome or Edge.

> **Note:** Backend must be running first (see section 2). Keep this terminal open.

---

## 2. How to run the BACKEND (server)

Open **Terminal 1** and run:

```
cd c:\Sandeep\Sandeep_Projects\Yogesh\cardsync-ai-main\cardsync-ai-main
python -m uvicorn main:app --reload --host 127.0.0.1 --port 5000
```

When you see `Uvicorn running on http://127.0.0.1:5000` — backend is ready.

> Keep this terminal open while using the app.

---

## 3. How to check Swagger (API test page)

1. Start the backend (section 2).
2. Open in browser:

```
http://127.0.0.1:5000/docs
```

3. To test card scanning:
   - Click **POST /scan-card**
   - Click **Try it out**
   - Upload a card photo (JPG or PNG)
   - Click **Execute**
   - See name, phone, email in the response below

No extra install needed — Swagger comes with the backend automatically.

---

## 4. What to install BEFORE first run (one time only)

### Install these 3 things on your PC

| # | Software | Download |
|---|----------|----------|
| 1 | Node.js | https://nodejs.org |
| 2 | Python | https://www.python.org — tick **Add Python to PATH** during install |
| 3 | Tesseract OCR | Run in PowerShell: `winget install --id UB-Mannheim.TesseractOCR -e` |
| 4 | PostgreSQL | https://www.postgresql.org/download/windows/ — remember the **postgres** password you set during install |

### Install project packages (first time only)

Open PowerShell in the project folder and run:

```
cd c:\Sandeep\Sandeep_Projects\Yogesh\cardsync-ai-main\cardsync-ai-main
pip install -r requirements.txt
npm install
```

### Check `.env` file exists

The project folder must have a `.env` file with this line:

```
VITE_API_URL=http://localhost:5000
```

Ask your team for the full `.env` file if you don't have one.

---

## Daily use — 2 steps

```
Step 1 → Start BACKEND  (Terminal 1)
Step 2 → Start FRONTEND (Terminal 2) → open http://localhost:5173
```

Both terminals stay open the whole time.

---

## Links at a glance

| What | URL |
|------|-----|
| App (website) | http://localhost:5173 |
| Swagger (API docs) | http://127.0.0.1:5000/docs |
| Backend health check | http://127.0.0.1:5000/health |

---

## What is OCR?

**OCR** = **Optical Character Recognition**

In simple words: **software that reads text from a photo** and turns it into text the computer can use.

**Example:** You photograph a card that says `Sophia Martinez`, `+1 646-555-0198`, `sophia@email.com`  
→ OCR reads the image  
→ The app fills **Name**, **Phone**, **Email** on the Review screen

Without OCR, you would have to **type every field by hand**.

This app uses **Tesseract OCR** on the backend (that is why Tesseract must be installed — see section 4).

---

## How scanning fills contact details

```
Take photo (camera or folder) → OCR reads text → Review page shows fields → You edit & save
```

**Important:** The app does **not** read the card while the camera is open. It works on the **photo** after you capture it.

| Photo quality | Result |
|---------------|--------|
| Card clear, flat, good light, fills the frame | Name, phone, email usually auto-fill well |
| Blurry, dark, tilted, or card too small | Some fields empty or wrong |
| OCR reads nothing | Message like “No name detected” — type details manually |

**Camera** and **Choose from folder** both use the same OCR. Folder upload is often more reliable if the camera photo is blurry.

You can always **Retake**, **edit any field** on Review, and **Save** even if OCR missed something.

**One line:** A **good clear photo** → OCR fills details. A **bad photo** → you fill them yourself.

---

## Local PostgreSQL database (Prisma) — works WITHOUT internet

When **Offline mode** is on (top bar) or **no internet**, contacts save to **PostgreSQL on your PC** — not Firebase.

```
Offline + PostgreSQL running  →  Save to local DB ✅ (no internet needed)
Back online                   →  Upload to Firebase (Queue page or auto)
When you want                 →  Sync to Zoho manually (Contacts page)
```

### One-time setup (local DB)

**1. Create the database**

```
npm run db:create
```

Or with psql directly:

```
psql -U postgres -f prisma/create-database.sql
```

Or inside psql:

```sql
CREATE DATABASE cardsync_local;
```

**2. Add to your `.env` file**

```
DATABASE_URL="postgresql://postgres:root1234@localhost:5432/cardsync_local?schema=public"
LOCAL_DB_PORT=3001
VITE_LOCAL_DB_URL=http://localhost:3001
VITE_API_URL=http://localhost:5000
```

**3. Create tables + generate Prisma client**

```
npm run db:push
npm run db:generate
```

> **Using another database (e.g. RAP_Ride)?** Change only `DATABASE_URL` in `.env`.  
> If that DB already has other tables, use the `cardsync` schema — see `prisma/create-schema.sql`.

### Run local DB API (Terminal 3)

```
npm run local-db
```

Health check: http://127.0.0.1:3001/health

### Prisma commands

| Command | What it does |
|---------|----------------|
| `npm run db:generate` | Generate Prisma client from `schema.prisma` (`prisma generate`) |
| `npm run db:pull` | Pull database structure into `schema.prisma` (`prisma db pull`) |
| `npm run db:push` | Push `schema.prisma` to PostgreSQL (create/update tables) |
| `npm run db:migrate` | Create migration files |
| `npm run db:studio` | Open Prisma Studio (view/edit data in browser) |
| `npm run db:create` | Create `cardsync_local` database (one-time) |
| `npm run db:setup` | Same as `db:create` |

**Which command when?**

| Situation | Run |
|-----------|-----|
| First setup — create tables from `schema.prisma` | `npm run db:push` then `npm run db:generate` |
| You changed `schema.prisma` | `npm run db:push` then `npm run db:generate` |
| You changed tables directly in PostgreSQL / psql | `npm run db:pull` then `npm run db:generate` |
| App can't find Prisma types after any of the above | `npm run db:generate` |

> **Note:** There is no `prisma db generate`. Client generation is always `prisma generate` (`npm run db:generate`).

### Daily use with offline storage

```
Terminal 1 → Python backend (OCR)     port 5000
Terminal 2 → Frontend                 port 5173
Terminal 3 → Local DB (PostgreSQL)    port 3001
```

Turn on **Offline** in the top bar → scan → save → data goes to **local PostgreSQL**.

---

## Offline save flow (no internet → local DB → Firebase → manual Zoho)

```
No internet + Offline mode  →  Save to PostgreSQL on your PC
Back online                 →  Upload to Firebase (Queue page)
When you want               →  Manually sync to Zoho from Contacts
```

| Step | What you do | What happens |
|------|-------------|--------------|
| 1 | Start PostgreSQL + `npm run local-db` | Local DB ready |
| 2 | Turn on **Offline**, scan, save | Saved in **PostgreSQL** (no internet) |
| 3 | Turn internet on | Upload to **Firebase** from Queue page |
| 4 | Go to **Contacts** | Tap **Sync to Zoho** when ready |

**Zoho is never synced automatically** — only when you click the sync button.

---

## Daily use — 2 steps (minimum)

```
Step 1 → Start BACKEND  (Terminal 1) — python OCR server
Step 2 → Start FRONTEND (Terminal 2) → open http://localhost:5173
```

For **offline saves**, also run **Terminal 3**: `npm run local-db` (and PostgreSQL must be running).

---

## Links at a glance

| What | URL |
|------|-----|
| App (website) | http://localhost:5173 |
| Swagger (API docs) | http://127.0.0.1:5000/docs |
| Backend health check | http://127.0.0.1:5000/health |
| Local DB health | http://127.0.0.1:3001/health |
| Prisma Studio | Run `npm run db:studio` |

---

## If something goes wrong

**Local DB save fails / Contacts empty / ERR_CONNECTION_REFUSED on port 3001**
→ Start the local DB API: `npm run local-db` (Terminal 3 — keep it open).
→ Check: http://127.0.0.1:3001/health should show `{"ok":true}`.
→ PostgreSQL must be running; run `npm run db:push` once if tables missing.

**Scan shows empty / no name**
→ Install Tesseract (section 4), then restart the backend.

**Website can't scan cards**
→ Backend is not running. Start Terminal 1 first.

**Camera not working**
→ Allow camera in browser, or use **Choose from folder** on the scan page.

**Zoho error on scan page**
→ You can ignore it for testing. Card scanning still works.

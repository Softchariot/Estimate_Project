# Online Hosting Guide (Frontend + Backend + Neon)

This project is ready for online hosting with:
- `frontend` on Vercel (Next.js)
- `backend` on Render or Railway (Node.js/Express)
- Neon PostgreSQL as hosted database

## 1) Prerequisites

- Repository should be on GitHub (`MCPL-TMS`).
- Neon database should be reachable using SSL connection string.
- Local app already working (you confirmed this).

## 2) Required environment variables

### Backend (`backend`)
- `PORT=4000` (hosting provider usually sets this automatically)
- `DATABASE_URL=<your-neon-connection-string>`
- `DB_SSL=true`
- `CORS_ORIGIN=https://<your-frontend-domain>`

Notes:
- For multiple frontend domains, set comma-separated values in `CORS_ORIGIN`.
- Example: `https://app.example.com,https://www.app.example.com`

### Frontend (`frontend`)
- `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-domain>`

## 3) One-time files already added in this repo

- `render.yaml` at repo root for Render Blueprint deploy.
- `frontend/vercel.json` for Vercel project detection.

## 4) Exact deploy flow (Render + Vercel)

1. Push this project to GitHub.
2. In Render, use **New + -> Blueprint** and select this repo (it will read `render.yaml`).
3. In Render service env vars, set:
   - `DATABASE_URL=postgresql://...` (Neon direct connection string)
   - `CORS_ORIGIN=https://<your-vercel-domain>`
4. Deploy backend and confirm health URL:
   - `https://<render-backend-domain>/health`
5. In Vercel, import same repo and choose root directory: `frontend`.
6. Add frontend env var in Vercel:
   - `NEXT_PUBLIC_API_BASE_URL=https://<render-backend-domain>`
7. Deploy frontend.
8. If Vercel domain changes after first deploy, update Render `CORS_ORIGIN` and redeploy backend.

## 5) Fallback manual setup (if not using Blueprint)

### Backend on Render
- Create a new **Web Service** from GitHub repository.
- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from section 1.

### Frontend on Vercel
- Import GitHub repository.
- Set project root to `frontend`.
- Framework: Next.js (auto-detected).
- Add `NEXT_PUBLIC_API_BASE_URL`.

## 6) Validation checklist

- `GET https://<backend-domain>/health` returns `{ ok: true, ... }`
- Frontend loads and fetches regions/categories successfully
- Browser console has no CORS errors
- Insert and update operations work from UI

## 7) Security checklist

- Never commit real credentials into code or `.env` files.
- Keep only placeholders in `.env.example`.
- Rotate any secrets that were accidentally shared publicly.

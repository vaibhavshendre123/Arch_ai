# Deploying Arch-AI (Vercel + Render)

Frontend (React/Vite) → **Vercel**. Backend (Express/MongoDB) → **Render**.
Everything is configured in the repo: `vercel.json` (SPA rewrite) and
`render.yaml` (Render Blueprint for the backend).

## 0. One-time: MongoDB

Backend needs MongoDB Atlas. A working `MONGO_URI` already exists in
`backend/.env` (never commit it) — copy its value when a form asks for it.

## 1. Render — backend (~2 min)

1. <https://render.com> → **New** → **Blueprint** → connect the GitHub repo
   `vaibhavshendre123/Arch_ai`.
2. Render reads `render.yaml` and creates the `arch-ai-backend` service.
3. When asked for **MONGO_URI**, paste the value from `backend/.env`.
   (JWT_SECRET is auto-generated; GEMINI_API_KEY optional — paste it to enable
   the AI advisor, otherwise that page shows "not configured".)
4. Deploy. The API lives at `https://arch-ai-backend.onrender.com/api`
   (health check: `/api/health`).

Free tier spins down after inactivity — the first request after idle takes
~30 s.

## 2. Vercel — frontend (~2 min)

1. <https://vercel.com> → **Add New** → **Project** → import
   `vaibhavshendre123/Arch_ai` (framework auto-detected as Vite).
2. Under **Environment Variables** add:

   | Name               | Value                                        |
   | ------------------ | -------------------------------------------- |
   | `VITE_API_BASE_URL`| `https://arch-ai-backend.onrender.com/api`   |

3. Deploy. If Render gave the service a different URL (name taken), use that
   URL instead, then redeploy Vercel.

## 3. After the first deploy

- The backend allows all CORS origins (`CORS_ORIGINS=*` in `render.yaml`) so
  the app works immediately. Once the Vercel URL is final, replace `*` with
  the exact origin (e.g. `https://arch-ai.vercel.app`) and redeploy Render.
- Any later `git push` to `main` triggers a fresh deploy on both platforms.

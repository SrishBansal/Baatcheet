# Baatcheet

## Vercel Deployment

1. Push the repo to GitHub and import it in [Vercel](https://vercel.com/new).
2. Set the environment variable `GEMINI_API_KEY` in the Vercel project settings (Settings → Environment Variables).
3. Vercel automatically detects Vite; set **Build Command** to `npm run build` and **Output Directory** to `dist`.
4. The `api/` directory contains five serverless functions (`health.js`, `job.js`, `turn.js`, `report.js`, `questions.js`) that Vercel deploys automatically alongside the static frontend — no separate server needed.
5. Deploy: `vercel --prod` (or push to your production branch).

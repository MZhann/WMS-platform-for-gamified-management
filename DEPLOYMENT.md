# Deployment Guide

## Backend (Railway)

A root `package.json` and `nixpacks.toml` are configured so Railway/Railpack can deploy from the **repo root** without changing settings. Railpack detects Node.js and runs the backend from `apps/backend`.

### Step 2: Environment Variables

In Railway → your **backend service** → **Variables** tab, add:

| Variable      | Required | Where to get it                                                |
|---------------|----------|----------------------------------------------------------------|
| `MONGODB_URI` | Yes      | MongoDB Atlas connection string, or Railway MongoDB addon link |
| `JWT_SECRET`| Yes      | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `CORS_ORIGIN` | Yes*     | Your frontend URL, e.g. `https://your-app.vercel.app`          |

**If using Railway MongoDB addon:** Add the MongoDB service, then in your backend service → Variables → **Reference** → choose the MongoDB service’s `MONGO_URL`. Or add a variable `MONGODB_URI` and paste the connection string.

\*Required for production CORS; optional for development.

### Step 3: Deploy

Push to your repo. Railway will:

- Use `apps/backend` as the build context
- Run `npm install && npm run build`
- Start with `npm run start`

### API URL

After deploy, your API will be at:

```
https://<your-service>.railway.app/api
```

Set `NEXT_PUBLIC_API_URL=https://<your-service>.railway.app/api` in your frontend env.

# Deployment Guide

## Backend (Railway)

Railway analyzes the **root** of your repo by default. Since this is a monorepo, the backend is in `apps/backend/`. You must set the **Root Directory** for the backend service.

### Step 1: Set Root Directory

1. Open your Railway project
2. Select the **backend** service (or create one)
3. Go to **Settings** → **Source** (or **Deploy**)
4. Set **Root Directory** to: `apps/backend`
5. Save

Railway will then build from `apps/backend`, where `package.json` is located, and Railpack will detect the Node.js app.

### Step 2: Environment Variables

In Railway → Variables, add:

| Variable      | Required | Example                                              |
|---------------|----------|------------------------------------------------------|
| `MONGODB_URI` | Yes      | `mongodb+srv://user:pass@cluster.mongodb.net/wms`   |
| `JWT_SECRET`  | Yes      | Long random string (64+ chars)                       |
| `CORS_ORIGIN` | Yes*     | `https://your-frontend.vercel.app`                   |

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

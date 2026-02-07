# Deployment Guide

## Backend (Railway)

A root `package.json` and `nixpacks.toml` are configured so Railway/Railpack can deploy from the **repo root** without changing settings. Railpack detects Node.js and runs the backend from `apps/backend`.

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

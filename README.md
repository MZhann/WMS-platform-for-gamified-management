# WMS-platform-for-gamified-management
Warehouse Management System for tracking the state of the storages, getting advises and monitoring the progress

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up Mapbox token:
   - Copy `.env.local.example` to `.env.local`
   - Get your Mapbox access token from https://account.mapbox.com/access-tokens/
   - Add it to `.env.local`:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
   ```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- Interactive Mapbox map centered on Almaty
- Click on the map to create a new warehouse
- Modal form with auto-filled address from coordinates
- Markers displayed on the map for created warehouses
- Mock state management (no backend required)

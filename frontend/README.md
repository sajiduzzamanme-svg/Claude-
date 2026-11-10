# Space Up — frontend

Next.js app for the Space Up ERP. See the [project README](../README.md) for
how to run the whole system.

```bash
npm install
npm run dev      # http://localhost:3000 (expects the backend on BACKEND_URL)
npm run build && npm start
```

- `src/app/(app)/…` — one folder per screen
- `src/components/` — design system (`ui.tsx`), charts, building visuals, shared forms
- `src/lib/` — API client, auth, language and number formatting, API types

# Finance pages (React + Vite)

The Finance module's frontend: dashboard, invoices, payments (including mock Mobile Money), expenses,
campaigns and the monthly FCFA report.

- Built with `npm run build` into `../client/`, which finance-service serves at `/finance/`
  (the Docker image builds it for you).
- Uses the ERP's shared sign-in: `src/api.js` loads `/auth/js/session.js` from the gateway at run
  time, so opening the page without a session sends you to the sign-in page and back.
- All API calls go to `/api/v1/finance/*` through the gateway.

## Develop with hot reload

With the whole system running (`docker compose up` from the repo root):

```powershell
npm install
npm run dev
```

Open http://localhost:5173/finance/. Vite forwards `/api` and `/auth` to the gateway on port 3000.

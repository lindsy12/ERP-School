# ERP School Finance Frontend

A React/Vite Finance module for the ERP School project.

## What it includes

- Finance dashboard
- Invoice listing and invoice creation
- Payment listing and payment recording
- Mock Mobile Money payment
- Expense listing and expense creation
- Campaign listing and campaign creation
- Monthly financial report
- Responsive sidebar/navigation
- FCFA formatting
- Error/loading states

## API

The Finance frontend uses the Finance service directly during local development. Vite proxies `/api/finance/*` to `http://localhost:4003` and removes the `/api/finance` prefix.

Finance service API version:
`/api/v1/finance`

Example browser request:
`GET http://localhost:5173/api/finance/api/v1/finance/invoices`

The proxy forwards it to:
`GET http://localhost:4003/api/v1/finance/invoices`

This avoids the Finance module depending on the gateway while you are testing the Finance service locally.

## Run

From this folder:

```powershell
npm install
npm run dev
```

Open:

`http://localhost:5173`

The ERP backend/Gateway should be running separately with Docker Compose.

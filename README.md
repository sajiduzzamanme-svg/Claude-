# Space Up ERP

An ERP for a land-share real estate developer: the company buys (or takes
bayna on) land, designs the building, sells flats with their share of land
before and during construction, and builds with its own team or contractors.

Space Up answers, per project and for the whole company:

- how many flats are sold, for how much, and how much is collected
- what is still to be collected — and how much of that is overdue
- how much profit is on the books and how much has actually come in,
  split between land and building
- how far the work has gone compared with money spent and money collected
- what is owed to landowners and vendors, and whether cash will cover it

## What is inside

| Area | What it does |
|---|---|
| Projects | Flat inventory, document checklist that gates sales, cost estimates (versioned), milestones |
| Land | Parcels from negotiation → bayna → registration → mutation, landowner payments, deadlines |
| Sales | Leads, customers, bookings with exact payment schedules, receipts, owner-agreed price revisions, name transfer, cancellation and refund, handover |
| Construction | Work packages (own team or contractor), purchase orders, vendor bills with retention, payments, direct expenses |
| Accounts | Double-entry ledger posted automatically from every document, chart of accounts, manual vouchers, ledger, trial balance |
| Reports | Dashboard, profit by source, receivables aging, cash flow forecast, estimate vs actual, books audit |

The interface is available in English and Bangla, with lakh/crore formatting.

## How the money is kept correct

- **One posting function.** Every receipt, bill, payment and expense goes
  through `accounts/services.py: post_journal`, inside one database
  transaction with the document it belongs to.
- **The database enforces the rules too.** PostgreSQL triggers reject an
  unbalanced voucher and any update or delete of a posted ledger row.
  Check constraints stop paying an installment or a bill beyond its amount,
  a second live booking on one flat, and a schedule that does not match the
  contract price.
- **Nothing is edited or deleted.** Mistakes are voided with a reason; the
  original and the reversal both stay in the books, with an audit log entry.
- **Row locks** make simultaneous saves queue instead of double-collecting.
- **Decimal arithmetic only**, rounded half-up to two places; splits always
  add up to the total.
- **Books audit.** `Accounts → Overview` (or `GET /api/reports/integrity`)
  compares each control account with its detail records — customer
  advances, receivables, vendor payables, retention, land advance, landowner
  payable, refunds — and flags any difference.

Accounting policy in brief: money received from buyers is a liability
(customer advance) and project costs are an asset (work in progress) until
handover, when the sale becomes revenue and the flat's share of cost becomes
cost of sales. Management profit figures on the dashboard are computed from
sales and the higher of estimated and actual cost, so a cost overrun reduces
profit as soon as it is recorded.

## Run it locally

Requirements: Python 3.12+, Node 20+, PostgreSQL 14+.

```bash
# database (once)
psql -U postgres -c "CREATE ROLE spaceup LOGIN PASSWORD 'spaceup' CREATEDB"
psql -U postgres -c "CREATE DATABASE spaceup OWNER spaceup"

# backend → http://127.0.0.1:8000
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo          # optional: a demo company with two projects
python manage.py runserver 127.0.0.1:8000

# frontend → http://localhost:3000
cd frontend
npm install
npm run dev
```

The frontend forwards `/api` and `/media` to the backend (`BACKEND_URL`,
default `http://127.0.0.1:8000`), so the browser only talks to one address.

Demo sign-ins after `seed_demo` (password `spaceup123`): `owner`,
`accounts`, `sales`, `engineer`, `purchase`.

Without demo data, create the first user with
`python manage.py createsuperuser`; a superuser is given the Owner role.

### Tests

```bash
cd backend && python manage.py test tests
```

The suite covers the ledger rules, receipt allocation, voids, land
registration, bills and retention, cancellation, handover, price revisions,
concurrency, role permissions, and report figures checked against numbers
worked out by hand.

## Configuration

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | `postgres://spaceup:spaceup@127.0.0.1:5432/spaceup` | PostgreSQL connection |
| `DJANGO_SECRET_KEY` | backend | development key | **Set a long random value in production** |
| `DJANGO_DEBUG` | backend | `1` | Set `0` in production |
| `DJANGO_ALLOWED_HOSTS` | backend | `*` | Comma-separated host names |
| `BACKEND_URL` | frontend | `http://127.0.0.1:8000` | Where `/api` is forwarded |
| `NEXT_PUBLIC_DEMO_LOGINS` | frontend | `1` in development only | Shows demo account shortcuts on the sign-in page |

For production, run the backend with `gunicorn spaceup.wsgi`, build the
frontend with `npm run build && npm start`, serve both over HTTPS, and take
regular PostgreSQL backups.

## Roles

| Role | Can do |
|---|---|
| Owner, Admin | Everything, including users, approvals, registration of land |
| Accounts | Receipts, payments, expenses, vouchers, cancellations, handover, all reports |
| Sales | Leads, customers, bookings; sees sales figures but not cost, cash or profit |
| Engineer | Work packages, milestones, estimates, purchase orders (draft) |
| Purchase | Vendors, purchase orders, receiving goods, bills |

## Not included yet

Sales commission, HR and payroll, a site stock ledger (materials are
expensed to the project when received), SMS reminders, a customer portal,
and late-fee calculation.

## Layout

```
backend/    Django + Django REST Framework
  core/          users, roles, audit log, money helpers
  accounts/      ledger, chart of accounts, cost heads
  projects/      projects, flats, documents, estimates, milestones
  land/          parcels and landowner payments
  sales/         customers, leads, bookings, receipts, revisions
  construction/  vendors, work packages, purchase orders, bills, expenses
  reports/       dashboard, profit, aging, cash flow, books audit
  tests/         test suite
frontend/   Next.js (App Router) + Tailwind + Motion
```

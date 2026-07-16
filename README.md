# CoverPath — Insurance Operations Platform

Professional, role-based insurance operations platform implementing the full **Customer → Policy → Account → Claim** flow.

## Tech Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + shadcn/ui components
- **PostgreSQL** + Prisma ORM
- **NextAuth.js v5** (credentials + Google OAuth)
- **Zustand** for client UI state
- **Mock payment service** (swappable interface)
- **Observability:** Sentry, PostHog, Mixpanel, Datadog, Vercel Analytics

## Quick Start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL database

### 2. Setup

```bash
cd coverpath
cp .env.example .env
# Edit DATABASE_URL, AUTH_SECRET, etc.

npm install
npm run db:push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Seed Users

After seeding, sign in with:

| Email | Role | Password |
|-------|------|----------|
| jordan.lee@coverpath.io | Admin | `SEED_ADMIN_PASSWORD` (default: Admin123!) |
| rachel.kim@coverpath.io | Agent | same |
| marcus.alvarez@coverpath.io | Adjuster | same |
| priya.sharma@coverpath.io | Accounting | same |

## Core Flow

1. **Customer** — Create insured party (`/customers/new` or guided flow)
2. **Policy** — Draft → Quote → Bind (`/policies/new?customerId=...`)
3. **Account** — Auto-created on bind with opening premium charge
4. **Claim** — Open from bound policy (`/claims/new?policyId=...`)

## Role-Based Access

| Role | Customers | Policies | Claims | Accounting | Users |
|------|-----------|----------|--------|------------|-------|
| Agent | CRU | CRU + bind | Create/read | Read | — |
| Adjuster | Read | Read | Full | Read | — |
| Accounting | Read | Read | Read | Post/pay | — |
| Admin | Full | Full | Full | Full | Manage |
| Read only | Read | Read | Read | Read | — |

## Rate Limiting (Production)

Auth endpoints are rate-limited via **Upstash Redis** when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Without these keys, the app falls back to in-memory limiting (suitable for local dev only — not durable on Vercel serverless).

## Security & QA Fixes (Latest)

- **OAuth gated:** Google sign-in only for pre-provisioned users unless `ALLOW_OAUTH_SELF_SIGNUP=true`
- **Password reset email:** Resend integration (`RESEND_API_KEY`) with dev-only console logging via `LOG_RESET_TOKENS`
- **Agent archive:** Customers can be archived with `customer.update` permission (not only delete)
- **Field-level audit:** Policy and customer updates log `{ field: { old, new } }` diffs
- **Guided flow step 4:** Claim creation integrated in wizard with skip option
- **Authenticated nav:** Home, About, Contact links in app header/footer
- **Global search:** Includes customer email
- **Theme in Zustand:** Persisted via `lib/stores/ui.ts`, synced with `next-themes`
- **GDPR UI:** `/account` page for data export and account deletion
- **SafeText:** Applied to claims, policies, transactions, and audit trail values
- **DB-backed permissions:** Audit API and page guards reload permissions from database
- **Reset password:** Max length 128 chars (bcrypt DoS mitigation)
- Admin user API responses strip `passwordHash`
- Policy `BOUND` transitions blocked via PATCH — must use `/api/policies/[id]/bind`
- Distributed rate limiting (Upstash) + middleware 429 on `/api/auth/*`
- SSR pages enforce read permissions via `lib/page-guard.ts`
- Policy quote flow: `Save & Quote` transitions DRAFT → QUOTED
- Claims adjuster filter UI + Zustand filter persistence
- Audit trail shows field-level diffs
- Global search includes phone numbers
- GDPR export expanded; account DELETE invalidates session
- CSP header, health endpoint 401 fix, flow API validation

## Mock Payments

Payments use `lib/payments/mock-provider.ts` — always succeeds unless `mockOutcome: 'FAIL'` is set. Swap `getPaymentProvider()` to integrate Stripe later.

## Observability

All tools are key-gated via `.env`. Leave keys blank to disable silently. See `.env.example` § Observability.

## Project Docs

Visit `/docs` for the AI-generated project documentation viewer.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run db:push` | Push Prisma schema |
| `npm run db:seed` | Seed roles, users, sample data |
| `npm run db:migrate:deploy` | Deploy migrations (production) |

## Security

- Public self-registration is **disabled by default** (`ALLOW_PUBLIC_REGISTRATION=false`). Admins provision users via `/admin/users`.
- Password reset invalidates existing sessions via `sessionVersion` bump.
- API routes validate input with Zod and enforce RBAC from the database on each request.
- CSRF protection via Origin/Referer validation on mutation endpoints.

## GDPR / Data Subject Rights

Authenticated users can:
- Export profile data: `GET /api/account`
- Request account deletion: `DELETE /api/account`

## Deployment (Vercel)

1. Set root directory to `coverpath`
2. Configure env vars from `.env.example`
3. Run `db:migrate:deploy` or `db:push` on production DB
4. Run seed once on empty DB

Health check: `GET /api/health`

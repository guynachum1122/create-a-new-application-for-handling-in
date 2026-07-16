# CoverPath — Vercel + PostgreSQL Deployment Runbook

> **App:** CoverPath — Insurance Full-Flow Platform  
> **Stack:** Next.js 15 · Prisma · PostgreSQL · NextAuth v5 · Vercel  
> **Source:** GitHub → Vercel (continuous deployment)

---

## 1. Architecture Overview

```
GitHub (main) ──push──▶ Vercel (Next.js SSR/API)
                              │
                              ├──▶ PostgreSQL (Neon / Vercel Postgres / Supabase)
                              ├──▶ Upstash Redis (auth rate limiting — required in prod)
                              └──▶ Resend (password-reset email — required in prod)
```

| Component | Provider | Notes |
|-----------|----------|-------|
| App hosting | Vercel | Serverless Next.js 15 App Router |
| Database | PostgreSQL 15+ | Any managed Postgres with SSL |
| Auth sessions | JWT (NextAuth) | Stored in cookie; user data in Postgres |
| Rate limiting | Upstash Redis | Durable limiter for `/api/auth/*` |
| Email | Resend | Password reset flows |
| OAuth (optional) | Google | Pre-provisioned users only by default |
| Payments | Mock provider | No external payment keys required |

---

## 2. Repository Layout

Two valid GitHub layouts:

| Layout | Vercel Root Directory | Notes |
|--------|----------------------|-------|
| **A — App is repo root** | `.` (default) | Push contents of `coverpath/` as repo root |
| **B — Monorepo** | `coverpath` | Keep app in subdirectory |

All paths below assume **Layout A** (repo root = app root). Adjust commands if using Layout B.

---

## 3. Prerequisites

- [ ] GitHub repository with `coverpath` code on `main` (or `master`)
- [ ] Vercel account linked to GitHub
- [ ] Managed PostgreSQL instance (recommended: [Neon](https://neon.tech) or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres))
- [ ] Node.js **20.x** locally (see `.nvmrc`)
- [ ] Vercel CLI (optional): `npm i -g vercel`

---

## 4. Configuration Files (Already in Repo)

| File | Purpose |
|------|---------|
| `vercel.json` | Framework preset, build/install commands, `iad1` region |
| `.nvmrc` | Node 20 for Vercel + local parity |
| `.github/workflows/ci.yml` | Lint + build on PR/push |
| `.github/workflows/db-migrate.yml` | Manual production migration (+ optional seed) |
| `next.config.ts` | Security headers, Sentry wrapper |
| `prisma/schema.prisma` | Database schema |
| `.env.example` | Full environment variable reference |

---

## 5. Step-by-Step Deploy Runbook

### Phase 0 — Bootstrap GitHub Repository

1. Create a new GitHub repository (e.g. `coverpath`).
2. Push the application code (repo root = app files, not the parent workspace folder).
3. Confirm CI passes: **Actions → CI → lint-and-build**.

### Phase 1 — Provision PostgreSQL

**Option A — Neon (recommended)**

1. Create project at [console.neon.tech](https://console.neon.tech).
2. Create database `coverpath`.
3. Copy the **pooled** connection string (PgBouncer), e.g.:
   ```
   postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/coverpath?sslmode=require
   ```
4. Append Prisma param if missing: `&schema=public`

**Option B — Vercel Postgres**

1. Vercel Dashboard → Project → **Storage** → Create Postgres.
2. Connect to project; `POSTGRES_URL` is injected automatically.
3. Map to `DATABASE_URL` in Environment Variables (see §6).

**Option C — Supabase / Railway / RDS**

Use any Postgres 15+ with SSL. Set `DATABASE_URL` to the provider's connection string.

> **Tip:** Use a **pooled** URL for serverless (Vercel). Use a **direct** URL only for one-off migration CLI runs if your provider requires it.

### Phase 2 — Generate Secrets

Run locally:

```bash
# AUTH_SECRET (required)
openssl rand -base64 32

# HEALTH_CHECK_KEY (optional, for monitoring)
openssl rand -hex 24

# SEED_ADMIN_PASSWORD (required for first seed in production)
openssl rand -base64 18
```

Store these in a password manager. **Never commit secrets.**

### Phase 3 — Provision Upstash Redis (Required for Production)

1. Create database at [console.upstash.com](https://console.upstash.com).
2. Copy **REST URL** and **REST TOKEN**.
3. Without these, auth rate limiting falls back to in-memory (not durable on serverless).

### Phase 4 — Provision Resend (Required for Password Reset)

1. Create account at [resend.com](https://resend.com).
2. Verify sending domain (or use Resend sandbox for staging).
3. Create API key → `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to a verified sender, e.g. `notifications@yourdomain.com`.

### Phase 5 — Create Initial Prisma Migration (First Deploy Only)

The repo ships with schema but **no migration history**. Before first production deploy, create an initial migration locally:

```bash
cp .env.example .env
# Set DATABASE_URL to a local or staging Postgres (NOT production yet)

npm install
npx prisma migrate dev --name init
git add prisma/migrations
git commit -m "Add initial Prisma migration"
git push
```

> **Alternative (not recommended for prod):** `npm run db:push` applies schema without migration history. Use only for throwaway environments.

### Phase 6 — Connect Vercel to GitHub

1. [vercel.com/new](https://vercel.com/new) → Import GitHub repository.
2. **Framework Preset:** Next.js (auto-detected).
3. **Root Directory:** `.` or `coverpath` (see §2).
4. **Build Command:** `npm run build` (default via `vercel.json`).
5. **Install Command:** `npm install`.
6. **Node.js Version:** 20.x (reads `.nvmrc`).
7. Do **not** deploy yet — configure env vars first (§6).

### Phase 7 — Configure Vercel Environment Variables

In **Vercel → Project → Settings → Environment Variables**, add all variables from §6.

Apply to: **Production**, **Preview**, and **Development** as noted.

Set these **before** the first production deploy:

| Variable | Environments |
|----------|-------------|
| `DATABASE_URL` | Production, Preview |
| `AUTH_SECRET` | Production, Preview |
| `AUTH_URL` | Production (= `https://your-domain.vercel.app`) |
| `NEXT_PUBLIC_SITE_URL` | Production (= same as AUTH_URL) |
| `UPSTASH_REDIS_REST_URL` | Production |
| `UPSTASH_REDIS_REST_TOKEN` | Production |
| `RESEND_API_KEY` | Production |
| `EMAIL_FROM` | Production |
| `SEED_ADMIN_PASSWORD` | Production (for one-time seed only; remove after) |

### Phase 8 — Run Database Migration (Production)

**From local machine (recommended for first deploy):**

```bash
# Pull production env (requires Vercel CLI + project link)
vercel link
vercel env pull .env.production.local --environment=production

# Or export DATABASE_URL manually
export DATABASE_URL="postgresql://..."

npm run db:migrate:deploy
```

**Via GitHub Actions:**

1. Add repository secrets: `DATABASE_URL`, `SEED_ADMIN_PASSWORD`.
2. Actions → **Database Migrate (Production)** → Run workflow.
3. Enable `run_seed: true` **only on first deploy**.

### Phase 9 — Seed Production Database (First Deploy Only)

```bash
export DATABASE_URL="postgresql://..."
export SEED_ADMIN_PASSWORD="<strong-password-from-phase-2>"
export NODE_ENV=production

npm run db:seed
```

Seed creates:

| Email | Role |
|-------|------|
| `jordan.lee@coverpath.io` | Admin |
| `rachel.kim@coverpath.io` | Agent |
| `marcus.alvarez@coverpath.io` | Adjuster |
| `priya.sharma@coverpath.io` | Accounting |

All seeded users share `SEED_ADMIN_PASSWORD`.

> **Security:** After first login, change admin password via admin UI or DB. Remove `SEED_ADMIN_PASSWORD` from Vercel env after seeding. Do **not** re-run seed on populated databases (upserts are safe but add sample customers/policies).

### Phase 10 — Deploy to Vercel

```bash
# Automatic: push to main
git push origin main

# Or manual first deploy
vercel --prod
```

Build pipeline:

1. `npm install` → triggers `postinstall` → `prisma generate`
2. `npm run build` → `prisma generate && next build`

### Phase 11 — Configure Custom Domain (Optional)

1. Vercel → Project → **Domains** → Add domain.
2. Update env vars:
   - `AUTH_URL=https://app.yourdomain.com`
   - `NEXT_PUBLIC_SITE_URL=https://app.yourdomain.com`
3. Redeploy.
4. Update Google OAuth redirect URIs if using Google sign-in:
   - `https://app.yourdomain.com/api/auth/callback/google`

### Phase 12 — Google OAuth (Optional)

1. [Google Cloud Console](https://console.cloud.google.com) → OAuth 2.0 Client.
2. Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel.
4. Keep `ALLOW_OAUTH_SELF_SIGNUP=false` unless you want open Google registration (defaults to READ_ONLY role).

### Phase 13 — Observability (Optional but Recommended)

| Tool | Variables | Notes |
|------|-----------|-------|
| Sentry | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Error tracking; wired in `next.config.ts` |
| PostHog | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Product analytics |
| Mixpanel | `NEXT_PUBLIC_MIXPANEL_TOKEN` | Optional Tier 2 |
| Datadog | `DD_API_KEY`, `DD_APP_KEY`, `DD_SERVICE`, `DD_ENV` | APM (Node runtime) |
| Vercel Analytics | *(none)* | Auto-enabled on Vercel |

---

## 6. Environment Variables — Complete Reference

### Required (Production)

| Variable | Example | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/coverpath?sslmode=require&schema=public` | PostgreSQL connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` | NextAuth JWT signing secret. **Must not** be the placeholder from `.env.example` |
| `AUTH_URL` | `https://app.yourdomain.com` | Canonical app URL for NextAuth callbacks |
| `NEXT_PUBLIC_SITE_URL` | `https://app.yourdomain.com` | Public site URL (SEO, emails, OG tags) |
| `UPSTASH_REDIS_REST_URL` | `https://xxx.upstash.io` | Durable rate limiting for auth endpoints |
| `UPSTASH_REDIS_REST_TOKEN` | `AXxxx...` | Upstash REST token |
| `RESEND_API_KEY` | `re_xxx...` | Transactional email for password reset |
| `EMAIL_FROM` | `notifications@yourdomain.com` | Verified sender address |

### Required for First Seed Only

| Variable | Example | Description |
|----------|---------|-------------|
| `SEED_ADMIN_PASSWORD` | Strong random password | Admin/seed user password. Remove after seeding |

### Public Site / Branding (Recommended)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_SITE_NAME` | `CoverPath` | App name in UI and metadata |
| `NEXT_PUBLIC_SITE_TAGLINE` | *(see .env.example)* | Marketing tagline |
| `NEXT_PUBLIC_OG_IMAGE_URL` | `/og/default.png` | Open Graph image path |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `support@coverpath.io` | Contact/support email |
| `NEXT_PUBLIC_SUPPORT_PHONE` | `(800) 555-0147` | Support phone |
| `NEXT_PUBLIC_ORG_LEGAL_NAME` | `CoverPath Insurance Operations LLC` | Legal entity name |

### Auth & Access Control

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | *(empty)* | Google OAuth client ID; leave blank to disable |
| `GOOGLE_CLIENT_SECRET` | *(empty)* | Google OAuth secret |
| `ALLOW_OAUTH_SELF_SIGNUP` | `false` | Allow new users via Google OAuth |
| `ALLOW_PUBLIC_REGISTRATION` | `false` | Server-side registration gate |
| `NEXT_PUBLIC_ALLOW_PUBLIC_REGISTRATION` | `false` | Client-side registration UI gate |

### Security / Ops

| Variable | Default | Description |
|----------|---------|-------------|
| `HEALTH_CHECK_KEY` | *(empty)* | If set, `GET /api/health` requires `x-health-key` header |
| `LOG_RESET_TOKENS` | `false` | **Never `true` in production** — logs reset links to console |

### Observability (All Optional)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client DSN |
| `SENTRY_ORG` | Sentry org slug (build-time source maps) |
| `SENTRY_PROJECT` | Sentry project slug |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog project API key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host (default `https://app.posthog.com`) |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | Mixpanel token |
| `DD_API_KEY` | Datadog API key |
| `DD_APP_KEY` | Datadog application key |
| `DD_SERVICE` | Service name (default `coverpath`) |
| `DD_ENV` | Environment tag (e.g. `production`) |

### Not Required

- Payment provider keys (mock payments only)
- Vercel Analytics / Speed Insights keys (zero-config on Vercel)

---

## 7. Database Migration & Seed Procedures

### Ongoing Schema Changes (After Initial Migration)

```bash
# Local dev — create migration
npx prisma migrate dev --name describe_change
git add prisma/migrations && git commit && git push

# Production — apply migration (choose one)
npm run db:migrate:deploy
# OR GitHub Actions → Database Migrate (Production)
```

### Commands Reference

| Command | When to Use |
|---------|-------------|
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:migrate:deploy` | **Production** — apply pending migrations |
| `npm run db:push` | Dev/staging only — push schema without migrations |
| `npm run db:seed` | First deploy or dev refresh — roles, users, sample data |
| `npm run db:migrate` | Local dev — create + apply migration interactively |

### Seed Behavior

- **Idempotent:** Uses `upsert` for roles and users.
- **Production guard:** Throws if `NODE_ENV=production` and `SEED_ADMIN_PASSWORD` is unset.
- **Sample data:** Creates demo customers, policies, accounts, and claims (safe for staging; skip re-run in prod if undesired).

---

## 8. Post-Deploy Smoke-Test Checklist

Run against production URL (`$APP_URL`). Check off each item.

### Infrastructure

- [ ] `GET $APP_URL/api/health` returns `200` with `{"status":"ok"}` (add `x-health-key` header if `HEALTH_CHECK_KEY` is set)
- [ ] Vercel deployment shows **Ready** with no build errors
- [ ] Database connectivity confirmed (health endpoint passes)

### Public Pages

- [ ] `GET $APP_URL/` — landing page loads, hero + CTA visible
- [ ] `GET $APP_URL/about` — about page renders
- [ ] `GET $APP_URL/contact` — contact page renders
- [ ] `GET $APP_URL/robots.txt` — returns robots rules
- [ ] `GET $APP_URL/sitemap.xml` — returns sitemap with public routes
- [ ] View page source — OG meta tags present (`og:title`, `og:image`)
- [ ] Dark/light mode toggle works

### Authentication

- [ ] `GET $APP_URL/auth/sign-in` — sign-in form loads
- [ ] Sign in as admin (`jordan.lee@coverpath.io`) → redirects to `/dashboard`
- [ ] Sign out → returns to public site
- [ ] Wrong password → error shown, no stack trace leaked
- [ ] `POST /api/auth/forgot-password` with valid email → email received (or 200 if user unknown — no enumeration)
- [ ] *(If Google OAuth configured)* Google sign-in button visible and flow completes for pre-provisioned user

### Authorization (RBAC)

- [ ] Admin (`jordan.lee@coverpath.io`) can access `/admin/users`
- [ ] Agent (`rachel.kim@coverpath.io`) can access `/customers`, **cannot** access `/admin/users` (403)
- [ ] Read-only user (if created) sees read-only views, mutation buttons hidden/disabled
- [ ] Unauthenticated request to `/dashboard` → redirect to `/auth/sign-in`

### Core Insurance Flow

- [ ] **Customer:** Create customer at `/customers/new` → appears in list
- [ ] **Policy:** Create policy for customer → status `DRAFT` → Quote → `QUOTED` → Bind → `BOUND`
- [ ] **Account:** After bind, billing account auto-created; visible at `/accounting`
- [ ] **Claim:** Open claim from bound policy → claim number assigned
- [ ] **Guided flow:** `/flow/new` wizard completes Customer → Policy → Account → Claim (or skip claim step)

### API & Security

- [ ] Rate limit: 6+ rapid `POST /api/auth/callback/credentials` attempts → `429` response
- [ ] CSRF: mutation from foreign origin rejected
- [ ] `GET $APP_URL/docs` — documentation viewer loads (authenticated or public per app config)

### Observability (If Configured)

- [ ] Trigger test error → appears in Sentry
- [ ] Page view recorded in PostHog / Vercel Analytics dashboard

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Build fails: `AUTH_SECRET must be set` | Placeholder or missing secret | Set strong `AUTH_SECRET` in Vercel env |
| `503` on `/api/health` | DB unreachable or wrong `DATABASE_URL` | Verify connection string, SSL, IP allowlist |
| Auth callback redirect loop | `AUTH_URL` mismatch | Match exact production URL (no trailing slash) |
| Password reset emails not sent | Missing Resend config | Set `RESEND_API_KEY` + verified `EMAIL_FROM` |
| Rate limiting inconsistent | Upstash not configured | Set Upstash env vars; redeploy |
| OAuth "Access denied" | User not pre-provisioned | Admin creates user first, or set `ALLOW_OAUTH_SELF_SIGNUP=true` |
| Prisma errors at runtime | Schema not migrated | Run `npm run db:migrate:deploy` |
| CSRF failures on mutations | Origin mismatch | Align `AUTH_URL` and `NEXT_PUBLIC_SITE_URL` with deployed domain |

---

## 10. Rollback Procedure

1. **App rollback:** Vercel → Deployments → select previous deployment → **Promote to Production**.
2. **Database rollback:** Prisma has no automatic down-migration. Restore from Postgres backup or apply a forward-fix migration.
3. **Env rollback:** Vercel → Settings → Environment Variables → restore previous values → redeploy.

---

## 11. Security Hardening Checklist (Production)

- [ ] `AUTH_SECRET` is a unique 32+ byte random value
- [ ] `SEED_ADMIN_PASSWORD` removed from Vercel after initial seed
- [ ] `LOG_RESET_TOKENS=false`
- [ ] `ALLOW_PUBLIC_REGISTRATION=false` (unless business requires it)
- [ ] `ALLOW_OAUTH_SELF_SIGNUP=false` (unless business requires it)
- [ ] Upstash Redis configured
- [ ] Postgres uses SSL (`sslmode=require`)
- [ ] Custom domain with HTTPS enforced (automatic on Vercel)
- [ ] `HEALTH_CHECK_KEY` set if health endpoint is exposed to monitors

---

## 12. Quick Reference — First Production Deploy

```bash
# 1. Create migration locally, push to GitHub
npx prisma migrate dev --name init && git push

# 2. Set all Vercel env vars (§6)

# 3. Migrate + seed production DB
export DATABASE_URL="..."
export SEED_ADMIN_PASSWORD="..."
npm run db:migrate:deploy
npm run db:seed

# 4. Deploy
git push origin main   # or: vercel --prod

# 5. Smoke test (§8)
curl -s https://your-app.vercel.app/api/health
```

**Default admin login after seed:** `jordan.lee@coverpath.io` / value of `SEED_ADMIN_PASSWORD`

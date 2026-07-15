CoverPath is updated in `coverpath/` with all P0 QA failures and security findings addressed. Summary of changes:

## Security fixes

| Issue | Fix |
|-------|-----|
| OAuth auto-provision | Unknown Google users are **denied** unless `ALLOW_OAUTH_SELF_SIGNUP=true` |
| OAuth consent | `consentAcceptedAt` set when OAuth signup is explicitly allowed |
| Stale JWT in audit API | `loadPermissionsForUser()` reloads permissions from DB |
| Reset password DoS | Password max length **128** via Zod schema |
| XSS hardening | `SafeText` / `escapeHtml` on claims, policies, transactions, audit values |
| GDPR | New **`/account`** page with export + delete UI |

## QA fixes

| Story | Fix |
|-------|-----|
| US-005 | Home / About / Contact in app header + footer |
| US-016 | Password reset via **Resend** (`lib/email.ts`, `RESEND_API_KEY`) |
| US-018/052 | Field-level audit diffs via `computeFieldDiff()` |
| US-019 | Agents can archive with `customer.update` permission |
| US-048 | Guided flow **step 4** — integrated claim creation + skip |
| US-050 | Global search includes **customer email** |
| US-055 | Theme persisted in **Zustand** (`lib/stores/ui.ts`), synced with `next-themes` |
| US-054 | Prisma `Session` model has `User` relation |

## Key new/updated files

- `lib/email.ts` — transactional email (Resend)
- `app/(app)/account/page.tsx` — GDPR account management
- `components/shared/account-privacy-panel.tsx`
- `lib/utils.ts` — `computeFieldDiff()`
- `app/(app)/flow/new/flow-wizard.tsx` — full 4-step wizard
- `components/layout/app-shell.tsx` — public nav + footer
- `.env.example` — `RESEND_API_KEY`, `ALLOW_OAUTH_SELF_SIGNUP`, `LOG_RESET_TOKENS`

## Run locally

```bash
cd coverpath
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET
# For production password reset: RESEND_API_KEY
# For production rate limiting: UPSTASH_REDIS_REST_URL + TOKEN

npm install
npm run db:push
npm run db:seed
npm run dev
```

Sign in as `jordan.lee@coverpath.io` / `Admin123!` (or your `SEED_ADMIN_PASSWORD`).

**Note:** `npm install && npm run build` could not be run in this environment (shell restrictions). Run locally to verify the build passes.

The full app (Prisma schema, mock payments, observability, `/docs`, RBAC, CRUD domains, guided flow) remains in `coverpath/`. All fixes were applied in-place to the existing codebase rather than re-emitting 280+ files.
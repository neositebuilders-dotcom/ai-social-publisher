# Cadence — AI social media automation

Cadence is an AI-powered social media automation workspace. You describe a
campaign once, and it generates platform-specific content on your schedule,
validates it against each network's real limits, queues it, and publishes
through **official OAuth 2.0 APIs** — then reports exactly what happened.

Built on the Freebuff Web stack: **Vite + React 19 + TypeScript + Tailwind v4 +
shadcn/ui + Framer Motion**, with **Convex** as the database, backend, queue and
scheduler.

---

## What actually works

| Area | Status |
| --- | --- |
| Auth, protected workspace, routing | ✅ Live |
| Automation (campaign) builder with brand voice, pillars, banned words, per-platform instructions | ✅ Live |
| AI content generation with a provider abstraction + **$0 local provider** | ✅ Live |
| Content-history memory that avoids repeating topics | ✅ Live |
| Platform validation (caption limits, hashtag caps, required media) | ✅ Live |
| Approval mode and Autopilot mode | ✅ Live |
| Queue-based scheduler: cron heartbeat, retries with backoff, idempotent jobs, stale-claim recovery | ✅ Live |
| Drafts → Approved → Scheduled → Publishing → Published → Failed pipeline | ✅ Live |
| Content calendar, media library, analytics, notifications | ✅ Live |
| OAuth connect flow (authorize URL + CSRF state + token exchange + profile lookup) | ✅ Implemented; needs platform app credentials |
| Publishing to Instagram / Facebook / LinkedIn / YouTube / TikTok / X | ✅ Implemented against documented endpoints; blocked only by platform app review, audits and quotas — all surfaced in-app |
| Picsart publishing | ❌ Unavailable — its official API edits/generates images and cannot publish to social networks. Marked as such, never faked. |

**No scraping, no browser automation, no password-based logins anywhere.**

---

## Architecture

```
src/convex/
  lib/platforms.ts     # SocialPlatform adapter registry + limits + validation + publish/analytics
  lib/ai.ts            # AIProvider abstraction: local generator + OpenAI-compatible remote
  lib/schedule.ts      # Timezone-aware next-run + slot planning (Intl, no deps)
  lib/crypto.ts        # AES-256-GCM token encryption (node runtime)
  lib/oauth.ts         # Per-platform OAuth configs, exchange, profile resolution
  lib/jobs.ts          # Queue + logging + notification helpers
  schema.ts            # All tables
  accounts.ts          # Connected accounts + encrypted tokens
  campaigns.ts         # Automations + scheduler internals
  posts.ts             # Post lifecycle + content memory
  jobs.ts              # Publish queue worker mutations
  analytics.ts         # Metric aggregation
  media.ts             # Media library (Convex file storage + URLs)
  settings.ts          # Workspace defaults + resolved AI provider status
  dashboard.ts         # Overview aggregate
  ai.ts                # "use node" generation action
  publish.ts           # "use node" publishing + analytics collection
  oauthConnect.ts      # "use node" OAuth start/complete
  scheduler.ts         # "use node" worker tick
  crons.ts             # 1-minute heartbeat + daily analytics sync
  http.ts              # /oauth/callback route
```

The core never imports a social network directly. It talks to
`SocialPlatformAdapter`, so adding a platform means adding one adapter.

### The scheduled pipeline

1. `crons.ts` fires `scheduler.tick` every minute.
2. Stale (`running`) jobs are returned to the queue.
3. Due automations generate content via the AI action; each post is validated
   per platform and either queued (autopilot) or saved as a draft (approval).
4. Due jobs are **atomically claimed** (`attempts` incremented, status
   `running`), then published through the adapter.
5. Failures retry with exponential backoff; exhausted or non-retryable jobs are
   marked dead, the post becomes `failed`, and a notification is written.

Idempotency keys (`postId:scheduledFor`) guarantee a post can never be queued or
published twice for the same slot.

---

## Environment variables

Set these on the **Convex deployment** (server-side only — never in the client
bundle). `SITE_URL`, `JWKS`, `JWT_PRIVATE_KEY` are already configured by the
template.

### Required to connect any social account

| Variable | Notes |
| --- | --- |
| `TOKEN_ENCRYPTION_KEY` | 64-char hex (32 bytes) or any passphrase. Used for AES-256-GCM token encryption. |

### AI provider (optional — omit for the $0 local provider)

| Variable | Notes |
| --- | --- |
| `AI_BASE_URL` | Any OpenAI-compatible endpoint: `https://api.openai.com/v1`, OpenRouter, Groq, or a local Ollama/LM Studio server. |
| `AI_API_KEY` / `OPENAI_API_KEY` | Key for that endpoint. |
| `AI_MODEL` | Defaults to `gpt-4o-mini`. |
| `MEDIA_IMAGE_BASE` | Optional. Base URL for placeholder image seeding (defaults to `https://picsum.photos/seed`). |

Without `AI_BASE_URL`/`AI_API_KEY`, Cadence uses its built-in local generator:
real, platform-shaped copy composed from your brief and content history, with
zero API cost.

### Platform OAuth apps (per platform you want to publish to)

Create an app on each platform and set its redirect URI to
`https://<your-deployment>.convex.site/oauth/callback`.

| Platform | Variables | Gating |
| --- | --- | --- |
| Instagram | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Business/Creator IG account + `instagram_content_publish` (App Review for public use) |
| Facebook | `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Page + `pages_manage_posts` (App Review for public use) |
| YouTube | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | OAuth verification + Data API quota (~1,600 units per upload) |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | Free; `w_member_social` or Page admin rights |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | Content Posting API audit; unaudited apps are limited to private posts |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_REDIRECT_URI` | Free tier allows limited writes; volume posting is paid |
| Picsart | `PICSART_API_KEY` | Optional, credit-based; media preparation only — cannot publish |

Until a platform's variables are set, its **Connect** button reports exactly
which variables are missing instead of pretending to connect.

---

## Local development

```bash
bun install
bun convex dev --once   # deploy functions + regenerate types
bun tsc -b --noEmit     # typecheck
```

The dev server and Convex dev process are managed by the platform; edits are
picked up automatically.

### Try it end to end

1. Open the app and sign in with email OTP (or continue as guest).
2. **AI automations → New automation.** Pick platforms, cadence, times,
   timezone, content pillars and instructions.
3. **Generate now.** With approval mode you get drafts; with autopilot and
   `autoPublish` you get scheduled posts and queued jobs.
4. Approve a draft (or leave autopilot on) and watch **Scheduled → Published**.
   Without a connected account the job fails with a clear, honest reason and is
   retried with backoff.

---

## Security

- OAuth 2.0 authorization-code flow only; PKCE for X.
- Single-use, expiring `state` nonces for CSRF protection.
- Access/refresh tokens encrypted with AES-256-GCM before storage and decrypted
  only inside server-side actions.
- Every query/mutation/action checks the authenticated user; all lookups are
  scoped by `userId`.
- No platform secrets or tokens are ever returned to the browser.

---

## Template conventions

This project is a Freebuff Web app. Auth files (`src/convex/auth.ts`,
`src/convex/auth.config.ts`, `src/convex/auth/emailOtp.ts`, `src/convex/users.ts`)
are read-only. Use the `useAuth` hook for user data and `RequireAuth` for
protected routes. Shadcn primitives live in `src/components/ui`; pages in
`src/pages`; use `@/convex/_generated/api` with `@/` path aliases.

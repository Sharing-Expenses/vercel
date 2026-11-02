# Sharing

Split expenses with your partner, friends or a travel group. Installable PWA (iPhone friendly), offline-first.

**Stack:** Next.js (App Router) + Tailwind on Vercel · Supabase (Postgres + RLS + Google auth) · Dexie/IndexedDB for the offline cache and sync queue.

## How it works

- Money is stored as integer cents. Splits (amounts / % / shares) use largest-remainder rounding so shares always add up exactly (`src/lib/split.ts`, tested).
- Every screen reads from IndexedDB. Adding or editing an expense writes locally first and queues it in an outbox; it syncs when online (`src/lib/sync.ts`). Creating groups and adding members needs a connection.
- Groups are the periods: create one per month, trip or flat. Invite via link `/join/<code>` or by scanning the QR in the app.
- Balances and "who owes whom" are derived from expenses, and "Mark paid" records a settlement transfer.

## Setup

1. **Supabase**: create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor.
2. **Google sign-in**: in Google Cloud Console create an OAuth client (Web). Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase → Authentication → Providers → Google, paste the client id and secret.
3. **Supabase → Authentication → URL Configuration**: set Site URL to your Vercel URL and add `https://<your-domain>/auth/callback` and `http://localhost:3000/auth/callback` to Redirect URLs.
4. Copy `.env.local.example` to `.env.local` and fill in the project URL and anon key.
5. `npm install && npm run dev`.

## Deploy

Import the repo in Vercel and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Install on iPhone

Open the site in Safari → Share → Add to Home Screen. The service worker only registers in production builds.

## Scripts

`npm run dev` · `npm run build` · `npx vitest run` · `npx eslint src`

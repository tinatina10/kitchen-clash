# Kitchen Clash — browser multiplayer prototype

This is a Next.js + Supabase starter project. It is designed for a private two-player browser prototype, not production-ranked play.

## What it includes

- Create a private room with a six-character code.
- Join a room using the code or an invitation URL.
- A responsive browser interface for desktop and mobile.
- A fine-dining recipe challenge: pan-seared salmon, saffron risotto, asparagus and lemon butter sauce.
- Shared recipe checklist, ingredient collection, task progress, callouts and a timer.
- Supabase Realtime Broadcast for sharing game state between connected browsers.

## Important current limitations

This is an early prototype scaffold. Before using it as a public game:
- The database policies below are intentionally permissive and are NOT secure for public ranked play.
- The client currently broadcasts game state; it does not use a server-authoritative game simulation.
- Simultaneous edits can overwrite each other. Test with one action at a time.
- The timer is client-side and is not authoritative.
- Role buttons are currently visual scaffolding; role assignment and voice chat are not implemented.
- AI opponents, human voting, matchmaking and anti-cheat are not included.
- The demo recipe is illustrative. A real cooking game needs tested recipe logic, food-safety review where relevant, and richer station interactions.

## 1. Create a Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor**.
3. Run the contents of `supabase/schema.sql`.
4. Open **Project Settings → API**.
5. Copy the Project URL and the `anon` / publishable key.

## 2. Configure the website

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Never put a Supabase `service_role` key in a browser app.

## 3. Run locally

Install Node.js 20 or later, then:

```bash
npm install
npm run dev
```

Open http://localhost:3000 in two separate browser windows. Create a room in one window and join using the code in the other.

## 4. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import that repository at https://vercel.com/new.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project Environment Variables.
4. Deploy.
5. Open the deployed URL, create a room and send the generated invitation link to your partner.

The invitation URL uses `?room=ABC123`. Your partner must open the deployed site URL, not your local `localhost` address.

## Recommended next engineering milestone

Replace client-authoritative broadcasts with a server-authoritative match service or validated Supabase Edge Functions. Add authenticated room membership, per-room access controls, atomic action processing, reconnect handling, server timers and audit logs before adding ranked matchmaking.

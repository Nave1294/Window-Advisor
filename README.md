# Window Advisor

Know exactly when to open your windows — daily recommendations based on your room's thermal properties and the local forecast.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite file path — `file:./dev.db` works for local dev |
| `OPENWEATHER_API_KEY` | Free tier key from [openweathermap.org](https://openweathermap.org/api) |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) — free tier handles 100 emails/day |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Window Advisor <hi@yourdomain.com>` |

### 3. Run database migrations
```bash
npm run db:migrate
# or hit GET /api/init once the server is running
```

### 4. Start the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to begin setup.

## Architecture

```
app/
  page.tsx                  Landing page
  setup/page.tsx            8-step onboarding wizard
  dashboard/page.tsx        Email lookup
  dashboard/[email]/        Per-user room list + today's recommendation
  api/
    init/                   Run DB migrations on cold start
    setup/                  POST: create user + room
    rooms/                  GET: list rooms by email
lib/
  schema.ts                 Drizzle ORM table definitions
  db.ts                     Singleton DB client
  migrate.ts                DDL migration runner
```

## Build order progress

- [x] Step 1 — Database schema (users, rooms, windows, exterior_walls, recommendations)
- [x] Step 2 — Onboarding UI (8-step form)
- [ ] Step 3 — Balance point calculation ← **next** (awaiting formula review)
- [ ] Step 4 — Weather API integration
- [ ] Step 5 — Recommendation engine
- [ ] Step 6 — Email notification system
- [ ] Step 7 — Scheduled daily job
- [ ] Step 8 — Dashboard with today's recommendation

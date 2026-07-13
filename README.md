# Sehat Sathi — Find & Book Doctors Across Pakistan

A full-stack demo doctor-booking site:

- **Frontend:** plain HTML, CSS, JavaScript (`public/`)
- **Backend:** Node.js, using only built-in core modules — no `npm install` needed
- **Database:** SQLite (via Node's built-in `node:sqlite`), stored in a single file `data.sqlite`

It's already been run and tested end-to-end (search, doctor profiles, booking, signup/login, contact form all hit real API routes and write to the database).

## Run it locally

Requires **Node.js 22.5 or newer** (for built-in SQLite support).

```bash
node server.js
```

Then open **http://localhost:3000**. The database file `data.sqlite` is created automatically on first run and seeded with 10 sample doctors.

No `npm install` step, no API keys, no config needed.

## Project structure

```
sehat-sathi/
  server.js        → HTTP server + REST API routes
  db.js             → database schema + seed data
  package.json
  public/
    index.html
    styles.css
    app.js          → talks to the API via fetch()
  data.sqlite        → created automatically (not in git)
```

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/specialties` | list specialties |
| GET | `/api/cities` | list cities |
| GET | `/api/doctors?city=&specialty=&hospital=&lang=` | search doctors |
| GET | `/api/doctors/:id` | doctor profile + reviews |
| POST | `/api/doctors/:id/reviews` | patient leaves a rating + review |
| POST | `/api/appointments` | book an appointment |
| GET | `/api/appointments?phone=` | look up bookings by phone |
| POST | `/api/contact` | contact form |
| GET | `/api/emergency-hospitals` | emergency hospital list |
| POST | `/api/auth/signup` | create patient/doctor account (doctor signup auto-creates an editable profile) |
| POST | `/api/auth/login` | log in |
| GET | `/api/doctor/me` | *(doctor login required)* view own profile |
| PUT | `/api/doctor/me` | *(doctor login required)* edit profile, details, and available timings |
| GET | `/api/doctor/me/appointments` | *(doctor login required)* view bookings made with you |

### Doctor Portal
Sign up (or log in) with role **Doctor**. This automatically creates an editable doctor profile linked to that
account — it appears in search immediately with placeholder details. From the **My Portal** button in the header,
a doctor can:
- Edit their name, specialty, city, hospital, qualification, experience, fee, phone, photo, languages, and bio
- Add or remove available time slots (these become the bookable slots patients see on their profile)
- See every appointment patients have booked with them

### Patient Reviews
On any doctor's profile page, patients can leave a star rating (1–5) and a short written review. The doctor's
average rating and review count update immediately and are recomputed from all reviews on file — no manual editing
of ratings is possible.

## Deploying it for real

I can't push this live myself from this sandbox (no internet access here), but it's ready to deploy as-is. Two good free/cheap options:

### Option A — Render.com (easiest)
1. Create a free GitHub repo and push this folder to it.
2. On [render.com](https://render.com), click **New → Web Service**, connect the repo.
3. Set **Build Command**: (leave blank — nothing to build)
4. Set **Start Command**: `node server.js`
5. Under **Environment**, make sure the Node version is 22.5+ (Render lets you set this via a `.node-version` file — create one containing `22.13.0`, or check their current Node docs for the latest LTS).
6. Deploy. Render gives you a live URL like `https://sehat-sathi.onrender.com`.

⚠️ Render's free tier has an **ephemeral filesystem** — `data.sqlite` will reset on redeploys/restarts. Fine for a demo; for production, switch to Render's free PostgreSQL and swap `db.js` to use it (see "Going to production" below).

### Option B — Railway.app
Same idea: connect your GitHub repo, Railway auto-detects Node, set start command `node server.js`, deploy. Railway's free tier also has ephemeral storage per the same caveat above — attach a persistent volume for the SQLite file, or move to Postgres.

### Option C — Your own VPS (DigitalOcean, Hetzner, etc.)
```bash
git clone <your-repo-url>
cd sehat-sathi
node server.js   # or use pm2 / systemd to keep it running, plus nginx as a reverse proxy
```
This keeps SQLite persistent on real disk — no ephemeral storage issue.

## Going to production (beyond this demo)

A few things worth doing before real patients/doctors use this:
- **Swap SQLite for Postgres/MySQL** if deploying somewhere with an ephemeral filesystem, so data survives restarts.
- **Move sessions out of memory** (currently `Map()` in `server.js`) into Redis or the database, so logins survive a server restart and work across multiple server instances.
- **Add HTTPS** (most hosts like Render/Railway do this for you automatically).
- **Add real SMS/email confirmations** for bookings (e.g. Twilio, or a local Pakistani SMS gateway).
- **Rate-limit** the `/api/auth/*` and `/api/appointments` routes to prevent abuse.
- **Validate phone number formats** server-side (currently accepted as free text).

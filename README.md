# Seminary: AI-taught biblical studies

A seminary-level course of study in biblical studies, theology, church history, the biblical languages and
ministry, taught by an AI tutor. There are 28 courses in six tiers, and the program ends with a thesis. The tutor
grounds its teaching in Scripture (Berean Standard Bible, KJV, WEB), the STEPBible Greek and Hebrew data, and a
library of public-domain classics (the church fathers, Reformers, Puritans, Wesley, Schaff, Hodge and others).

> This is a **Certificate of Completion** program for personal study. It is **not** an accredited degree, and the
> app never claims to be one.

**What students do:** sign up, open a lesson, work through it with the tutor (who asks questions, quotes
Scripture and cites the library), pass a 10-question quiz (80% needed), practise Greek and Hebrew parsing against
real STEPBible grammar data, write papers the AI grades on a five-part rubric, and earn a certificate for each
course. Their transcript shows everything they have done.

---

## Setting it up: no keys, no extra accounts

Everything runs on Netlify. Netlify creates the database and connects the AI (Claude, through
**Netlify AI Gateway**) by itself. There are no API keys to create or paste.

### Step 1: Check your Netlify plan (one time)

Netlify's built-in database and AI only work on its newer **credit-based** plans (Free, Personal or Pro).

1. Go to **https://app.netlify.com**, click your team name (top left), then **Billing**.
2. If your plan is called **Free**, **Personal** or **Pro** and shows **credits**, you're set.
   If it's an older plan (for example "Starter"), click **Change plan** and choose one of those.

**About cost.** The AI and the database use your plan's monthly credits.
- The Free plan includes 300 credits. That's about $1.67 of AI use, enough to try the app yourself but not for
  regular students.
- For real use, choose **Personal** ($9/month) or **Pro** ($20/month). You can buy extra credits under
  **Billing** if you need them.
- You can watch usage under **Billing → Usage**.

### Step 2: Let it deploy

The code is already on the `main` branch, so Netlify builds the site automatically. The first build also creates
the database.

1. In Netlify, open your site and click **Deploys**. Wait until the newest deploy says **Published**.
2. Check **Site configuration → Build & deploy → Branches and deploy contexts**. **Production branch** should
   be `main`.

### Step 3: Sign up first (this makes you the administrator)

Open your site and click **Sign up** straight away. **The first account created becomes the administrator.**
You'll see an **Admin** link at the top.

If the site says "the AI tutor is not switched on yet", wait a few minutes and refresh. Netlify turns the AI on
shortly after the first production deploy.

### Step 4: Load the texts (one click, then keep the page open)

1. Click **Admin → Load texts**, then click **Load texts**.
2. Leave the page open while it works through the list: three Bibles, the Greek and Hebrew data, then about 50
   library books. It takes roughly 15–30 minutes.
3. If you close the page or something fails, click the button again later. Finished parts are skipped and failed
   ones are retried.

A few library books have no reliable free online copy (for example Keil & Delitzsch). They're marked
"skipped" and are optional. **Also load the extra library books** adds the remaining, less-used volumes.

That's it. Your students can now sign up and start.

---

## Everyday things

- **A student forgot their password.** Open **Admin → Students** and click **Reset password** next to their name.
  You'll get a temporary password to give them privately. They can change it under **Account**.
- **Flagged answers.** Students can click **⚑ Report an error** on any tutor message. Review these under
  **Admin → Flagged answers**.
- **Limit AI spending.** In Netlify, go to **Site configuration → Environment variables → Add a variable** and
  add `TUTOR_DAILY_MESSAGE_LIMIT` with a number, for example `50`. That's the most tutor messages one student can
  send per day. The default is 150.
- **Choose a different administrator.** Add the variable `ADMIN_EMAIL` with their email address. This is optional.
- **Courses and lessons** are plain files in `curriculum/`, one per course. You can edit them on GitHub: open the
  file, click the pencil icon, make the change, and click **Commit changes**. Netlify redeploys automatically.
  Library readings must match a book in `shared/library.ts`, and Scripture references must be real. A developer can
  check everything with `npm run validate:curriculum`.
- **Your church's or school's position** on disputed questions can go in `prompts/home-position.md`. It's empty on
  purpose. If you leave it empty, the tutor presents the main views fairly and doesn't pick a winner. The shared
  doctrinal floor (the Nicene and Apostles' Creeds) is in `prompts/doctrine.md`. How the tutor teaches is in
  `prompts/tutor.md`.
- **Thirdmill:** some lessons have a "Watch: Thirdmill lesson" link that opens thirdmill.org in a new tab. None of
  Thirdmill's content is copied into this app.

## If something goes wrong

- **"This site is still being set up":** the first deploy hasn't finished creating the database. Wait a few
  minutes and refresh. If it stays, check that the latest deploy under **Deploys** says Published.
- **"The AI tutor is not switched on yet":** make sure the site has had a production deploy and is on a
  credit-based plan (Step 1).
- **"The AI tutor is temporarily unavailable":** you may be out of credits for the month. Check
  **Billing → Usage**.
- **Library search finds nothing:** open **Admin → Load texts** and check that the library books are loaded.
  Search works on key words, so try distinctive words ("justification faith works") rather than a whole question.
- **The Greek/Hebrew drill says "No words found":** the Greek & Hebrew texts aren't loaded yet (Step 4).

---

## Sources and licences

All sources are credited on the site's **/attribution** page.

- **Berean Standard Bible:** public domain since 30 April 2023. **KJV** and **World English Bible:** public domain.
- **STEPBible data** (TAGNT, TAHOT, TBESG, TBESH, TEGMC, TEHMC, TIPNR), by Tyndale House, Cambridge:
  CC BY 4.0. TTESV is deliberately **not** used because its licence is non-commercial only.
- **Library:** public-domain editions from Project Gutenberg and the Christian Classics Ethereal Library
  (all published before 1929).
- **Thirdmill:** links only.

## For developers

- **Stack:** Vite + React + TypeScript + Tailwind (`src/`); Netlify Functions v2 (`netlify/functions/`, with
  shared helpers in `netlify/lib/` and `shared/`); Netlify Database (Postgres), with migrations in
  `netlify/database/migrations/` that Netlify applies on deploy; Claude through Netlify AI Gateway, using
  `claude-sonnet-5` for teaching and paper grading and `claude-haiku-4-5-20251001` for quizzes, drills and
  summaries. Library search is Postgres full-text search.
- **Security model:** the browser never touches the database. Every function checks the login token and only
  reads or writes the signed-in student's own rows. Grades and progress are written only by the server.
  - Passwords are hashed with scrypt.
  - Login tokens are random, and only their SHA-256 hash is stored. Tokens expire after 30 days, and a password
    reset or change logs out other devices.
- **Text loading:** `netlify/lib/loader.ts` and `netlify/lib/ingest/`, run one step per request from the Admin page.
- **Commands:** `netlify dev` (the full app on port 8888, including a local database), `npm test`,
  `npm run typecheck`, `npm run validate:curriculum`, and `npm run build`.
- **End-to-end tests** use Netlify's local database and a fake AI service. See `tests/local-stack/README.md`.

# Seminary: AI-taught biblical studies

A seminary-level course of study in biblical studies, theology, church history, the biblical languages and
ministry, taught by an AI tutor. There are 28 courses in six tiers, and the program ends with a thesis. The tutor
grounds its teaching in Scripture (Berean Standard Bible, KJV, WEB), the STEPBible Greek and Hebrew data, and a
library of public-domain classics (the church fathers, Reformers, Puritans, Wesley, Schaff, Hodge and others).

> This is a **Certificate of Completion** program for personal study. It is **not** an accredited degree, and the
> app never claims to be one.

**What students do:** sign up, open a lesson, work through it with the tutor (who asks questions, quotes
Scripture and cites the library), pass a 10-question quiz (80% needed), practise Greek and Hebrew parsing against
real STEPBible morphology, write papers the AI grades on a five-part rubric, and earn a certificate for each
course. Their transcript shows everything they have done.

---

## Setting it up (plain English, one step at a time)

You'll do this once. It takes about an hour, plus waiting while the library loads. You need four accounts. The
GitHub and Netlify ones already exist.

| Account | What it's for | Cost |
|---|---|---|
| **Anthropic** (Claude) | The AI tutor, quizzes and grading | Pay as you go. Roughly $0.02–0.10 per tutor conversation turn. |
| **Supabase** | Database and student logins | Free plan to start. **The Pro plan ($25/month) is needed to hold the whole library** (see Step 5). |
| **Voyage AI** | Makes the library searchable | Loading the core library costs about $3 once. Searching afterwards costs almost nothing. |
| **Netlify** | Hosts the website | Free plan is fine |

### Step 1: Get an Anthropic (Claude) API key

1. Go to **https://console.anthropic.com** and sign up, or log in.
2. Click **Settings → Billing** and add a payment method with some credit (for example, $20).
3. Click **API Keys → Create Key**. Name it `seminary` and click **Create**.
4. Copy the key. It starts with `sk-ant-`. Paste it somewhere safe for now, like a note on your computer.
   **Never share it or put it in GitHub.**

### Step 2: Create the Supabase database

1. Go to **https://supabase.com**, click **Start your project**, and sign up (signing in with GitHub is easiest).
2. Click **New project**. Name it `seminary`, choose a strong database password (save it), pick the region
   closest to you, and click **Create new project**. Wait about two minutes.
3. **Create the tables.** In the left sidebar, click **SQL Editor**, then **New query**.
   - In another browser tab, open this repository on GitHub and go to the file
     `supabase/migrations/20260924000000_initial_schema.sql`.
   - Click the **Copy raw file** button (two overlapping squares, top right of the file).
   - Go back to Supabase, paste it into the query box, and click **Run**. You should see "Success. No rows returned".
4. **Tell Supabase your website address.** In the left sidebar, click **Authentication → URL Configuration**.
   - **Site URL**: your Netlify address, for example `https://your-site-name.netlify.app`.
   - Under **Redirect URLs**, click **Add URL** and add `https://your-site-name.netlify.app/**`.
   - Click **Save**.
5. **Copy your keys.** Click **Project Settings** (the gear icon), then **API** (or **Data API** and **API Keys**,
   depending on the layout). Copy these three values:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`. This is `SUPABASE_URL`.
   - **anon / public** key. This is `SUPABASE_ANON_KEY`.
   - **service_role / secret** key (click **Reveal**). This is `SUPABASE_SERVICE_ROLE_KEY`.
     **This one is powerful, so keep it secret.**

> **About sign-up emails:** Supabase sends a "confirm your email" message when someone signs up. On the free plan
> its built-in mailer only sends a few emails per hour. That's fine for a handful of students. For more, add your own
> email provider under **Authentication → Emails → SMTP Settings**. You can also turn off **Confirm email** under
> **Authentication → Sign In / Providers → Email** if you don't need it.

### Step 3: Get a Voyage AI key

1. Go to **https://dash.voyageai.com** and sign up.
2. Add a payment method under **Billing**. Voyage gives a free allowance, but a card is required for normal speed.
3. Click **API Keys → Create new secret key**, name it `seminary`, and copy it. This is `VOYAGE_API_KEY`.

### Step 4: Add the keys to Netlify

1. Go to **https://app.netlify.com** and open your site.
2. Click **Site configuration → Environment variables → Add a variable → Add a single variable**.
3. Add each of these, one at a time: type the name exactly as shown, paste the value, and click **Create variable**.

   | Key | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | from Step 1 |
   | `SUPABASE_URL` | from Step 2 |
   | `SUPABASE_ANON_KEY` | from Step 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | from Step 2 |
   | `VOYAGE_API_KEY` | from Step 3 |
   | `ADMIN_EMAIL` | the email address you'll use to log in as the administrator |
   | `TUTOR_DAILY_MESSAGE_LIMIT` | *(optional)* the most tutor messages one student can send per day. Default: `150` |

4. Check which branch Netlify publishes: **Site configuration → Build & deploy → Branches and deploy contexts**.
   **Production branch** should be `main`.
5. Click **Deploys → Trigger deploy → Deploy site**. After a minute or two, open your site. You should see the
   home page. If a setting is missing, the site tells you which one.

### Step 5: Load the Bible, Greek/Hebrew data and library (from your own computer)

The texts are loaded into your database by small programs that you run once from your computer.

**5a. Install the tools (one time only)**
1. Install **Node.js** (the "LTS" version) from **https://nodejs.org**. Open the downloaded file and click
   through the installer.
2. On GitHub, open this repository, click the green **Code** button, then **Download ZIP**. Unzip it somewhere easy
   to find, like your Desktop.

**5b. Open a terminal in that folder**
- **Mac:** open the **Terminal** app, type `cd ` (with a space after it), drag the unzipped folder onto the
  Terminal window, and press **Enter**.
- **Windows:** open the unzipped folder in File Explorer, click the address bar, type `powershell`, and press
  **Enter**.

**5c. Install and add your keys**
1. Type `npm install` and press **Enter**. Wait until it finishes.
2. In the folder, make a copy of the file `.env.example` and name the copy `.env`. The name is just `.env`, with
   nothing before the dot.
   - On a Mac, press **Cmd + Shift + .** to show hidden files if you can't see it.
   - On Windows, make sure the name doesn't end up as `.env.txt`. To check, turn on
     **View → File name extensions** in File Explorer.
3. Open `.env` in a plain-text editor (TextEdit in plain-text mode, or Notepad). Paste your keys after each `=`,
   exactly as you did in Netlify, and save. **This file stays on your computer. It is never uploaded.**

**5d. Run the loaders, one at a time**

```
npm run ingest:bible
npm run ingest:stepbible
npm run ingest:library
```

- `ingest:bible` loads the BSB, KJV and WEB, about 93,000 verses. It takes a few minutes.
- `ingest:stepbible` loads the Greek and Hebrew text, lexicons, grammar codes and proper names from STEPBible.
  It takes about 10–20 minutes.
- `ingest:library` downloads the "core" library from Project Gutenberg and CCEL, checks each book is the right
  one, splits it into passages, and makes them searchable. **This takes hours.** You can stop it (Ctrl + C) and run
  it again later, and it will skip volumes that are already finished. When it's done, it lists any books it couldn't
  download. For those, see `scripts/library-texts/README.md`.

**About database size:** The Bible and Greek/Hebrew data fit on Supabase's free plan. **The full core library
(about 70,000 passages) is larger than the free plan's 500 MB.** To load all of it, upgrade the project to
**Pro** first: in Supabase, click **Project Settings → Billing** or your organization's **Billing** page. On the
free plan, you can load a few books at a time instead, for example
`npm run ingest:library -- calvin-institutes npnf102 anf01`. Run `npm run ingest:library -- --list` to see every
book id and what's loaded. The app still works if a book is missing. The tutor just tells the student it couldn't
find that reading.

**5e. Check that search works**

```
npm run test:search -- "justification by faith"
```

You should see passages with an author, title, section and source link.

### Step 6: Sign in as the administrator

Open your site, click **Sign up**, and register with the same email you put in `ADMIN_EMAIL`. You'll see an
**Admin** link that shows every student, their progress, and any tutor answers students have flagged. The
administrator can open any lesson without prerequisites, which is useful for checking content.

---

## Everyday changes

- **Courses and lessons** are plain files in `curriculum/`, one per course. You can edit them on GitHub: open the
  file, click the pencil icon, make the change, and click **Commit changes**. Netlify redeploys automatically. Library
  readings must match a book in the library list (`shared/library.ts`), and Scripture references must be real. A
  developer can check everything with `npm run validate:curriculum`.
- **Your church's or school's position** on disputed questions can go in `prompts/home-position.md`. It's empty on
  purpose. If you leave it empty, the tutor presents the main views fairly and doesn't pick a winner. The shared
  doctrinal floor (the Nicene and Apostles' Creeds) is in `prompts/doctrine.md`. How the tutor teaches is in
  `prompts/tutor.md`.
- **Cost control:** change `TUTOR_DAILY_MESSAGE_LIMIT` in Netlify. The tutor also sends only the last 20 messages
  plus a running summary of earlier ones, which keeps long conversations affordable.
- **Thirdmill:** some lessons have a "Watch: Thirdmill lesson" link that opens thirdmill.org in a new tab. None of
  Thirdmill's content is copied into this app.

## If something goes wrong

- **The site says a setting is missing:** add that variable in Netlify (Step 4), then trigger a deploy.
- **"The AI service is busy" or "unavailable":** check your Anthropic balance at console.anthropic.com.
- **Password reset or confirmation links go to the wrong place:** check the Site URL and Redirect URLs in Supabase
  (Step 2.4).
- **Library search finds nothing:** run `npm run ingest:library -- --list` to see which books are loaded, and
  make sure `VOYAGE_API_KEY` is set in Netlify.
- **The Greek/Hebrew drill says "No words found":** run `npm run ingest:stepbible` (Step 5d).

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
  shared helpers in `netlify/lib/` and `shared/`); Supabase Postgres with pgvector and row-level security on every
  table (`supabase/migrations/`); Anthropic `claude-sonnet-5` for teaching and paper grading, and
  `claude-haiku-4-5-20251001` for quizzes, drills and summaries; Voyage `voyage-3` embeddings.
- **All AI calls are server-side.** The browser only ever gets the Supabase URL and anon key, through
  `/api/config`. Grades, progress and chat are written only by the functions, using the service-role key.
- **Commands:** `npm run dev` (Vite only), `netlify dev` (the full app on port 8888, using `.env`),
  `npm test`, `npm run typecheck`, `npm run validate:curriculum`, and `npm run build`.
- **End-to-end tests** run against a local imitation of Supabase, Anthropic and Voyage, so no real keys are needed.
  See `tests/local-stack/README.md`.

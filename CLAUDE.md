# Tally

A study planner for the ANU Master of Computing: put courses into semesters and
see, before enrolment day, what ANUHub (the system everyone still calls ISIS)
would only say when you press enrol --- requisite not met, incompatible, not
offered this semester, overloaded --- and how far the plan is from the 96 units
Programs & Courses asks for. The brief and spec are on the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/07-anu-system/);
`README.md` is the argument for what good looks like here; `spec/README.md`
says what the checks are. Read all three before you plan or build.

## The map

- `src/lib/schema.ts` --- the database's ground truth. `drizzle/` --- its
  migration trail.
- `src/data/mcomp-2026.ts` --- the reference data: program, specialisation,
  courses, requisites, offerings, transcribed from Programs & Courses 2026 with
  the source URL beside each course. Upserted at boot by `src/lib/seed.ts`.
- `src/lib/rules.ts` --- every rule the planner applies, as pure functions
  over (catalogue, plan). Pages call them; they never touch the database.
- `src/pages/` --- routes. `spec/routes.ts` --- the routes the invariants
  visit. `spec/*.test.ts` --- the contracts.

## How to work with me

- One batch at a time --- one page, one table, one rule --- then stop and
  report: what changed, and what you're not sure about.
- If a line in the spec is ambiguous, ask rather than guess; a wrong guess
  costs more than the question.
- Decorative decisions (spacing, palette steps, the wording of a heading) are
  yours: make them and flag them. Anything the spec pins down --- numbers,
  dates, the checks under `spec/` --- is mine: ask first.
- Scope is mine too. Only the Master of Computing with the Human-Centred and
  Creative Computing specialisation is modelled, and the catalogue stops at
  the courses in `src/data/`. Don't add a program, a specialisation or a
  course without asking.

## Data

- Change the schema in `src/lib/schema.ts`, run `pnpm db:generate`, and commit
  the migration it writes in the same commit as the schema change. Never edit
  the SQL under `drizzle/` by hand, and never edit a `.db` file by hand.
- A migration that has reached the deployed volume is permanent: the volume
  outlives every deploy, so a wrong one can't be un-run. Before committing a
  migration, run `pnpm test` (it boots the built server on a throwaway database
  and applies every migration from zero), and if the change touches a table
  that already holds data, try it on a copy of a database that has data in it.
- Reference data is not user state. Programs, courses, requisites and
  offerings are a transcript of Programs & Courses, so they live in typed
  TypeScript under `src/data/` and are upserted at boot, not written by a
  migration --- a transcription error has to be fixable by a redeploy. Never
  invent a requisite, an offering or a unit count: if the course page doesn't
  say, the course stays `requisitesVerified: false`, the page says "not
  checked", and you tell me. A silent pass is worse than a visible gap.
- User state --- plans and their entries --- only ever enters through the
  routes. The one exception is the `demo` plan the boot seed creates so the
  invariants have a plan page to visit.
- Requisites are stored as groups: options inside a group are OR, groups are
  AND, which is the shape Programs & Courses writes them in. Keep that shape;
  don't flatten it into text.

## Rules

- Every rule lives in `src/lib/rules.ts` and nowhere else; a page that needs
  to know whether a placement is legal asks `evaluatePlan`, it doesn't
  re-derive the answer.
- The planner never refuses a real course. It records the placement and
  flags what ANUHub would say --- which requisite, which incompatibility, which
  semester it doesn't run in, how many units over --- and why. Refusing is
  ANUHub's job; showing the consequence is this app's. The only hard refusals
  are bad data: a course code not in the catalogue, a session that isn't
  `YYYY-S1` or `YYYY-S2`.
- Each rule has a test in `spec/rules.test.ts` that was seen red first: break
  the rule, watch the test fail for the right reason, restore it. A sentinel
  that has never been red is unverified.

## Server and browser

- Pages render on the server per request. Frontmatter is server code and may
  read the database and the environment; anything inside a `<script>` is
  bundled and sent to the browser, so nothing secret goes there.
- Forms POST, the handler writes, and a 303 sends the browser back to the
  page. The input's `name` is the contract between form and handler and
  nothing in TypeScript checks it: when you add a field, grep for the name on
  both sides before you call it done.
- The invariants only visit the routes listed in `spec/routes.ts`. A new page
  is not covered until its route is there.
- `pnpm check` tests the built server (`dist/server/entry.mjs`) on a throwaway
  database: what ships, not the dev server. It is still not a browser.
- `/api/events` has to keep streaming: CI's post-deploy probe reads it. Scope
  it to a plan, don't remove it.

## Verification

- The rendered page is the ground truth, not the source file and not the
  tests. Any visual or interactive change is driven in a real browser at both
  marking viewports (1920×1080 and 390×844) before it counts as done. A green
  `pnpm check` proves the data and the build; it does not prove the page looks
  right, and jsdom has no layout, paint, or focus engine.
- Drive the browser with the course `agent-browser` CLI, or a throwaway
  puppeteer installed under `/tmp` and pointed at the dev server --- never added
  to this project's `package.json` or lockfile.
- Check the deployed build, not only dev. The machine auto-stops when idle,
  so the first request after a pause takes a few seconds: slow is not down,
  wait for the 200 before diagnosing.
- The core flow is the check that matters most: on the deployed site, add a
  course, reload, see it there. Nothing is shipped until that has been done
  by hand on the live URL.
- When a check fails, read its output before you change anything. Never make
  a check pass by weakening it or by rewording honest copy; widen the check.

## Deploy

- While the repo is private, deploy by hand from this directory:
  `flyctl deploy --remote-only --ha=false -a comp4020-crit7-Ray0766`. After
  `/ship` flips the repo public, CI runs the same command on every push to
  `main`. Fly app names are lowercase; if that name is refused, try
  `comp4020-crit7-ray0766` and tell me which one exists --- CI passes the repo
  name as-is, so the difference matters before `/ship`, not after.
- The Fly token lives in `mise.local.toml`, which is gitignored. Never print
  it, never copy it into a tracked file, never paste it into a commit message.
- Ship early: deploy the ugliest working version first so the pipeline is
  known to work, then do the visual work on a link that already deploys.

## Evidence

- Commit in my own voice, in English: what changed and why, not a changelog
  of file operations. One decision, one commit. Commit as you go --- the trail
  is read, not just the final state.
- Never commit a red `pnpm check`, with one exception: a contract-first test
  that is supposed to start red gets its own commit, and that commit says so.
- "Pushed" is a claim, not a fact. Before reporting it, `git fetch` and
  confirm `origin/main` matches `HEAD`.
- Anything `PROCESS.md` says was done must be backed by a commit it cites;
  don't write "tried and discarded X" unless the history shows X.
- `pnpm check:evidence` before `/ship`: it wants the template comment gone,
  every cited SHA real, `reflections/crit-7.md` present, and this file.

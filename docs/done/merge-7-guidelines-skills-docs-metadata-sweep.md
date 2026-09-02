# Guidelines, skills, docs and repo-metadata sweep (merge master plan, step 7)

**Status:** open
**Created:** 2026-08-24

Step 7 of [merge-ts-runtypes-into-mion-master-plan.md](merge-ts-runtypes-into-mion-master-plan.md).
Requires steps 2–6 landed. Goal: the combined repo reads as ONE project — guidance, skills, docs
and every hardcoded coordinate updated — and the old ts-run-types repo is archived.

## Tasks

- **Docs, final form:** CLAUDE.md was already merged (2026-08-24: unified title, both package
  families in the main sections, mion containers, a mion pipeline bullet under Architecture, the
  remaining mion gotchas as a short tail section) and `docs/ARCHITECTURE.md` was deleted as a
  deliberate sync-burden cut — do not recreate it. `docs/ROADMAP.md` was likewise
  deleted on 2026-08-25 (it described the standalone runtypes scope, which is now fully built).
  Remaining here: `SETUP.md` gains the mion packages (they need only pnpm on top of the
  existing bootstrap).
- **Repo-reference sweep** `MionKit/ts-run-types` → `MionKit/mion` (list enumerated in the master
  plan's evidence section): root + package `package.json` repository/bugs fields (add
  `repository.directory` per package), the three published package READMEs, both Containerfile
  `org.opencontainers.image.source` labels (then rebuild + push both images), the website
  `app.config.ts` github block + the content pages that link the repo,
  `scripts/release/build-binaries.mjs` (generated binary-package READMEs),
  `scripts/setup-claude-web.sh`, `.claude/hooks/session-start.sh`, the setup/website skills, and
  `repo-contracts.test.ts` — update the pinned contract values, never delete the test. GHCR
  coordinates (`ghcr.io/mionkit/*`) and the Go module path (`github.com/mionkit/ts-runtypes`)
  are org-scoped and stay.
- **Skills:** the 8 `.claude/skills/` dirs are now repo skills; extend `ts-runtypes-setup` and
  the session-start hook to cover the mion packages; retarget `create-todo` / `implement-todo` /
  `task-reset` wording where it says "RunTypes" but now means the whole repo; keep the published
  skills under `packages/ts-runtypes/skills/` untouched (they ship with the package).
- **Docs hygiene:** mion's `docs/done` records and runtypes' coexist; `docs/maybe/` keeps its
  parked specs (`plans/` was dropped on 2026-08-30, its one live idea moved there).
  Root README final pass (mion landing page with
  the RunTypes section, links to both sites).
- **Archive the old repo:** final README pointer commit in `MionKit/ts-run-types`
  ("development moved to MionKit/mion, history preserved there — see the `pre-merge-ts-run-types`
  tag"), then the owner flips it to Archived in GitHub settings.

## Done criteria

- Repo-wide grep for `MionKit/ts-run-types` matches only history records under `docs/done/` and
  the archive pointer note.
- `repo-contracts.test.ts` passes with the new coordinates; both images rebuilt with the new
  source labels; a fresh-clone bootstrap via the setup skill works end to end on the unified
  CLAUDE.md/SETUP.md instructions alone.
- `MionKit/ts-run-types` is archived.

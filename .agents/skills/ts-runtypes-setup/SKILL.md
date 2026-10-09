---
name: mion-setup
description: Bootstrap host: podman, Node, pnpm, Go, submodules, builds, smokes. Use when setting up or verifying env.
---

# RunTypes setup (docs website + benchmarks containers)

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

- Automated path through [SETUP.md](../../../SETUP.md): install + bootstrap + verify, end to end, no manual steps.
- SETUP.md = full human reference: prereqs, build, test, lint, dev loop, containers, publishing, troubleshooting.

## Run

From repo root, in order. First non-zero exit → stop, show the error to the user.

```bash
bash .agents/skills/ts-runtypes-setup/setup.sh   # 1. host deps + project bootstrap
pnpm miondevx core smoke                         # 2. Go binary + vite plugin wiring smoke
pnpm miondevx website check                      # 3. docs website smoke
pnpm miondevx bench smoke                        # 4. benchmarks smoke
```

- All four pass → `pnpm miondevx website dev`, `pnpm miondevx bench`, `pnpm test` all work.
- What each step does: [steps.md](steps.md). Read before debugging a failed step or editing `setup.sh`.

## setup.sh

- Every sub-step idempotent: skips when already satisfied. Safe to re-run.
- `--check`: report status only. Never installs or builds.
- Exit codes: `0` ok, `1` a required install / bootstrap step failed.
- Exit `3`: unsupported OS or no supported package manager.
- ⚠️ Submodules: NEVER `--recursive` (fetches a 620MB corpus). Why: [steps.md](steps.md#submodules).

## Layout

- `setup.sh`: flags, version constants, step order (`main`).
- `lib/common.sh`: bold/ok/warn/err, version_ge, check_dep, check_go, pnpm + Go-tarball fallbacks.
- `lib/host.sh`: package-manager detection, Rosetta 2, podman engine.
- `lib/tsgolint.sh`: submodules, patches, tsgolint pin.
- `lib/project.sh`: `pnpm install`, husky hooks, Go binary, devtools dist.
- `lib/finish.sh`: dev `.env`, next-steps hint.
- `pm/<pm>.sh`: one per package manager. Sets `PM_NAME`.
  Defines `install_podman` / `install_node` / `install_pnpm` / `install_go`.
  - `brew` (macOS), `apt` (Debian/Ubuntu), `dnf` (Fedora/RHEL/CentOS Stream), `pacman` (Arch), `zypper` (openSUSE).
- Version minimums: [SETUP.md](../../../SETUP.md#prerequisites). Keep `setup.sh` constants in sync.

## Platform support

- Linux: verified (podman 4.9.3 via apt). Other distros: dnf / pacman / zypper.
- macOS: Homebrew + manages the `podman machine` VM (`init` if missing, `start` if down).
- macOS long dev sessions: `MION_WEBSITE_POLL=1 pnpm miondevx website dev` (VM file-watch needs polling).
- Any other OS: prints a not-ready message, exits `3`.

## Notes

- Corporate / MITM proxy: pass proxy CA + host network per
  [SETUP.md](../../../SETUP.md#containerized-apps-docs-website--benchmarks).
- Linux Go auto-install → `/usr/local/go`. Add `/usr/local/go/bin` to PATH if missing.
- macOS first `podman machine init` downloads a Linux VM image (~1 min). Prints "Initializing podman machine".
- Troubleshooting (Rosetta, podman machine, patch failures, marker Temporal typecheck):
  [SETUP.md](../../../SETUP.md#troubleshooting).

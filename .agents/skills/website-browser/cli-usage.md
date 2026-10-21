# playwright-cli: full command reference

- Site setup + core loop (open, snapshot, click): [SKILL.md](SKILL.md).
- Install: [SKILL.md → Installing playwright-cli](SKILL.md#installing-playwright-cli).
- Run as `pnpm exec playwright-cli ...` from repo root. Code blocks drop `pnpm exec`, inline commands drop both.
- Targets: snapshot ref (`e15`), CSS (`"#main > button.submit"`), or locator.
  Locator: `"getByRole('button', { name: 'Submit' })"`, `"getByTestId('submit-button')"`.

## Core

- `open` (new browser), `open https://example.com/` (open + navigate right away), `goto https://playwright.dev`.
- `click e3`, `dblclick e7`, `hover e4`, `drag e2 e8`, `check e12`, `uncheck e12`, `select e9 "option-value"`.
- `type "search query"`. `fill e5 "user@example.com" --submit` (`--submit` presses Enter after filling).
- Drop files/data on element: `drop e4 --path=./image.png`, `drop e4 --data="text/plain=hello world"`.
- `upload ./document.pdf`. `resize 1920 1080`. `close`.
- `eval "document.title"`, `eval "el => el.textContent" e5`.
- Attrs not in snapshot: `eval "el => el.id" e5`, `eval "el => el.getAttribute('data-testid')" e5`.
- Dialogs: `dialog-accept`, `dialog-accept "confirmation text"`, `dialog-dismiss`.
- Navigation: `go-back`, `go-forward`, `reload`.
- Keyboard: `press Enter`, `press ArrowDown`, `keydown Shift`, `keyup Shift`.
- Mouse: `mousemove 150 300`, `mousedown`, `mousedown right`, `mouseup`, `mouseup right`, `mousewheel 0 100`.
- Save as: `screenshot`, `screenshot e5`, `screenshot --filename=page.png`, `pdf --filename=page.pdf`.
- Tabs: `tab-list`, `tab-new`, `tab-new https://example.com/page`, `tab-close`, `tab-close 2`, `tab-select 0`.

## Storage

- State, cookies, localStorage, sessionStorage: [references/storage-state.md](references/storage-state.md).

## Network

- `route "**/*.jpg" --status=404`, `route "https://api.example.com/**" --body='{"mock": true}'`.
- `route-list`. `unroute "**/*.jpg"`. `unroute` (all).

## DevTools

- `console`, `console warning`, `requests`, `request 5`.
- `run-code "async page => await page.context().grantPermissions(['geolocation'])"`, `run-code --filename=script.js`.
- `tracing-start`, `tracing-stop`.
- `video-start video.webm`, `video-chapter "Chapter Title" --description="Details" --duration=2000`, `video-stop`.
- `video-show-actions --duration=600 --position=top-right`: callout per next action, highlights target.
  `video-hide-actions` turns it off.
- `show --annotate`: dashboard for UI review / design feedback. User draws boxes + comments on live page.
  You get annotated screenshot, snapshot of marked region, notes.
- `generate-locator e5 --raw`: Playwright locator for a ref or selector.
- `highlight e5`: persistent overlay. `highlight e5 --style="outline: 3px dashed red"` custom style.
- `highlight e5 --hide` (one element), `highlight --hide` (all page highlights).

## Raw / JSON output

- Global `--raw`: strips page status, generated code, snapshot sections → result value only. Pipe-friendly.
- Command with no output → returns nothing.
- `list --json`: every reply wrapped as JSON.

```bash
playwright-cli --raw eval "JSON.stringify(performance.timing)" | jq '.loadEventEnd - .navigationStart'
playwright-cli --raw eval "JSON.stringify([...document.querySelectorAll('a')].map(a => a.href))" > links.json
playwright-cli --raw snapshot > before.yml; playwright-cli click e5; playwright-cli --raw snapshot > after.yml
diff before.yml after.yml
TOKEN=$(playwright-cli --raw cookie-get session_id)
```

## Open parameters

- Browser: `open --browser=chrome`, `--browser=firefox`, `--browser=webkit`, `--browser=msedge`.
- Profile: default in-memory. `open --persistent`, `open --profile=/path/to/profile`.
- Config file: `open --config=my-config.json`.
- Playwright Extension: `attach --extension=chrome`.
- Running Chrome/Edge by channel: `attach --cdp=chrome`, `attach --cdp=msedge`.
- Running browser via CDP endpoint: `attach --cdp=http://localhost:9222`.
- `close`. `-s=msedge detach` (leaves attached browser running). `delete-data` (default session user data).

## Snapshots

- Every command replies with `### Page` (Page URL, Page Title) + `### Snapshot` link `.playwright-cli/page-...yml`.
- On demand, options combine: `snapshot` (timestamped file), `snapshot "#main"` (element subtree).
- `snapshot --filename=after-click.yaml`: when snapshot is the workflow result.
- `snapshot --depth=4` (limit depth), `snapshot e34` (partial from ref), `snapshot --boxes` (adds `[box=x,y,w,h]`).

## Browser sessions

- `-s=<name>`, `list`, `close-all`, `kill-all`, `delete-data`:
  [references/session-management.md](references/session-management.md).

## URLs with `&` on Windows

- `cmd.exe` / PowerShell treat `&` as command separator → multi-param URLs truncated.
- `cmd.exe`: escape `^&`: `playwright-cli goto "https://example.com/?a=1^&b=2"`.
- PowerShell: `--%`: `playwright-cli --% goto "https://example.com/?a=1&b=2"`.

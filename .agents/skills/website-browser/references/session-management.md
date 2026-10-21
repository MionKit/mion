# Browser Session Management

Run several isolated browser sessions at once, with state persistence.

## Named Browser Sessions

- `-s=<name>` isolates a browser context. Commands only hit their own session.
- Each session has its own cookies, LocalStorage / SessionStorage, IndexedDB, cache, history, open tabs.
- No `-s` → default session.
- `export PLAYWRIGHT_CLI_SESSION="mysession"` → commands use "mysession" with no `-s`.

```bash
playwright-cli -s=auth open https://app.example.com/login
playwright-cli -s=public open https://example.com          # separate cookies, storage
playwright-cli -s=auth fill e1 "user@example.com"
playwright-cli -s=public snapshot
```

## Browser Session Commands

```bash
playwright-cli list                       # all sessions
playwright-cli close                      # stop default browser
playwright-cli -s=mysession close         # stop named browser
playwright-cli close-all                  # stop all
playwright-cli kill-all                   # force-kill all daemon processes (stale/zombie)
playwright-cli delete-data                # delete default session user data (profile dir)
playwright-cli -s=mysession delete-data   # delete named session data
```

## Common Patterns

### Concurrent Scraping

```bash
playwright-cli -s=site1 open https://site1.com &
playwright-cli -s=site2 open https://site2.com &
wait
playwright-cli -s=site1 snapshot
playwright-cli -s=site2 snapshot
playwright-cli close-all
```

### Persistent Profile

- Profile is in-memory by default. `--persistent` on `open` → profile on disk.

```bash
playwright-cli open https://example.com --persistent                  # auto-generated location
playwright-cli open https://example.com --profile=/path/to/profile    # custom dir
```

## Attaching to a Running Browser

`attach` connects to an already running browser instead of launching one.

### Attach by channel name

- Running Chrome / Edge by channel: `attach --cdp=chrome`, `--cdp=chrome-canary`.
- Same for Edge: `attach --cdp=msedge`, `--cdp=msedge-dev`.
- Channels: `chrome`, `chrome-beta`, `chrome-dev`, `chrome-canary`.
- Edge channels: `msedge`, `msedge-beta`, `msedge-dev`, `msedge-canary`.
- Needs remote debugging: open `chrome://inspect/#remote-debugging` in target browser.
  Check "Allow remote debugging for this browser instance".
- No `--session` → session named after channel (`--cdp=msedge` → `msedge`).
  So parallel Chrome + Edge attaches never collide on `default`.
- `--session=<name>` overrides.

### Attach via CDP endpoint

- Browser exposing a Chrome DevTools Protocol endpoint: `playwright-cli attach --cdp=http://localhost:9222`.

### Attach via browser extension

- Browser with Playwright extension installed: `playwright-cli attach --extension`.

### Detach

- Ends an attached session, external browser keeps running.
- `playwright-cli detach` (default attached session), `playwright-cli -s=msedge detach` (specific one).
- `detach` only for sessions made by `attach`. Sessions from `open` → `close`.

## Browser Session Configuration

```bash
playwright-cli open https://example.com --config=.playwright/my-cli.json
playwright-cli open https://example.com --browser=firefox
playwright-cli open https://example.com --headed
playwright-cli open https://example.com --persistent
```

## Best Practices

- Name sessions by purpose: `-s=github-auth`, `-s=docs-scrape`. Avoid generic `-s=s1`.
- Always clean up: `-s=auth close` per session, or `close-all`. Unresponsive / zombie processes → `kill-all`.
- Free disk: delete stale data, `playwright-cli -s=oldsession delete-data`.

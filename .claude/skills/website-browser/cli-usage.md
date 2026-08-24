# playwright-cli — full command reference

Complete command list for `playwright-cli` (the [website-browser](SKILL.md) skill keeps only the most-used subset). If the binary is not on PATH, prefix everything with `npx playwright-cli`. See [SKILL.md → Installing playwright-cli](SKILL.md#installing-playwright-cli).

## Quick start

```bash
playwright-cli open                         # open new browser
playwright-cli goto https://playwright.dev  # navigate to a page
playwright-cli click e15                     # interact using refs from the snapshot
playwright-cli type "page.click"
playwright-cli press Enter
playwright-cli screenshot                     # (rarely used; snapshot is more common)
playwright-cli close                          # close the browser
```

## Core

```bash
playwright-cli open
playwright-cli open https://example.com/         # open and navigate right away
playwright-cli goto https://playwright.dev
playwright-cli type "search query"
playwright-cli click e3
playwright-cli dblclick e7
playwright-cli fill e5 "user@example.com" --submit   # --submit presses Enter after filling
playwright-cli drag e2 e8
playwright-cli drop e4 --path=./image.png             # drop files/data onto an element
playwright-cli drop e4 --data="text/plain=hello world"
playwright-cli hover e4
playwright-cli select e9 "option-value"
playwright-cli upload ./document.pdf
playwright-cli check e12
playwright-cli uncheck e12
playwright-cli snapshot
playwright-cli eval "document.title"
playwright-cli eval "el => el.textContent" e5
playwright-cli eval "el => el.id" e5                  # attributes not visible in the snapshot
playwright-cli eval "el => el.getAttribute('data-testid')" e5
playwright-cli dialog-accept
playwright-cli dialog-accept "confirmation text"
playwright-cli dialog-dismiss
playwright-cli resize 1920 1080
playwright-cli close
```

## Navigation

```bash
playwright-cli go-back
playwright-cli go-forward
playwright-cli reload
```

## Keyboard

```bash
playwright-cli press Enter
playwright-cli press ArrowDown
playwright-cli keydown Shift
playwright-cli keyup Shift
```

## Mouse

```bash
playwright-cli mousemove 150 300
playwright-cli mousedown
playwright-cli mousedown right
playwright-cli mouseup
playwright-cli mouseup right
playwright-cli mousewheel 0 100
```

## Save as

```bash
playwright-cli screenshot
playwright-cli screenshot e5
playwright-cli screenshot --filename=page.png
playwright-cli pdf --filename=page.pdf
```

## Tabs

```bash
playwright-cli tab-list
playwright-cli tab-new
playwright-cli tab-new https://example.com/page
playwright-cli tab-close
playwright-cli tab-close 2
playwright-cli tab-select 0
```

## Storage

```bash
playwright-cli state-save
playwright-cli state-save auth.json
playwright-cli state-load auth.json

# Cookies
playwright-cli cookie-list
playwright-cli cookie-list --domain=example.com
playwright-cli cookie-get session_id
playwright-cli cookie-set session_id abc123
playwright-cli cookie-set session_id abc123 --domain=example.com --httpOnly --secure
playwright-cli cookie-delete session_id
playwright-cli cookie-clear

# LocalStorage
playwright-cli localstorage-list
playwright-cli localstorage-get theme
playwright-cli localstorage-set theme dark
playwright-cli localstorage-delete theme
playwright-cli localstorage-clear

# SessionStorage
playwright-cli sessionstorage-list
playwright-cli sessionstorage-get step
playwright-cli sessionstorage-set step 3
playwright-cli sessionstorage-delete step
playwright-cli sessionstorage-clear
```

## Network

```bash
playwright-cli route "**/*.jpg" --status=404
playwright-cli route "https://api.example.com/**" --body='{"mock": true}'
playwright-cli route-list
playwright-cli unroute "**/*.jpg"
playwright-cli unroute
```

## DevTools

```bash
playwright-cli console
playwright-cli console warning
playwright-cli requests
playwright-cli request 5
playwright-cli run-code "async page => await page.context().grantPermissions(['geolocation'])"
playwright-cli run-code --filename=script.js
playwright-cli tracing-start
playwright-cli tracing-stop
playwright-cli video-start video.webm
playwright-cli video-chapter "Chapter Title" --description="Details" --duration=2000
playwright-cli video-stop

# annotate each subsequent action with a callout naming the action and highlighting the target
playwright-cli video-show-actions --duration=600 --position=top-right
playwright-cli video-hide-actions

# launch the dashboard for UI review / design feedback — user annotates the page,
# you receive the annotated screenshot, snapshot, and notes
playwright-cli show --annotate

# generate a Playwright locator for an element from its ref or selector
playwright-cli generate-locator e5 --raw

# persistent highlight overlay for an element, optionally with a custom style
playwright-cli highlight e5
playwright-cli highlight e5 --style="outline: 3px dashed red"
playwright-cli highlight e5 --hide        # hide a single element highlight
playwright-cli highlight --hide           # hide all page highlights
```

## Raw / JSON output

The global `--raw` option strips page status, generated code, and snapshot sections, returning only the result value. Use it to pipe output into other tools. Commands that produce no output return nothing.

```bash
playwright-cli --raw eval "JSON.stringify(performance.timing)" | jq '.loadEventEnd - .navigationStart'
playwright-cli --raw eval "JSON.stringify([...document.querySelectorAll('a')].map(a => a.href))" > links.json
playwright-cli --raw snapshot > before.yml
playwright-cli click e5
playwright-cli --raw snapshot > after.yml
diff before.yml after.yml
TOKEN=$(playwright-cli --raw cookie-get session_id)
playwright-cli --raw localstorage-get theme
```

Structured output, every reply wrapped as JSON:

```bash
playwright-cli list --json
```

## Open parameters

```bash
# specific browser when creating a session
playwright-cli open --browser=chrome
playwright-cli open --browser=firefox
playwright-cli open --browser=webkit
playwright-cli open --browser=msedge

# persistent profile (default profile is in-memory)
playwright-cli open --persistent
playwright-cli open --profile=/path/to/profile

# connect to browser via Playwright Extension
playwright-cli attach --extension=chrome

# connect to a running Chrome/Edge by channel name
playwright-cli attach --cdp=chrome
playwright-cli attach --cdp=msedge

# connect to a running browser via CDP endpoint
playwright-cli attach --cdp=http://localhost:9222

# start with config file
playwright-cli open --config=my-config.json

playwright-cli close                # close the browser
playwright-cli -s=msedge detach     # detach from an attached browser (leaves it running)
playwright-cli delete-data          # delete user data for the default session
```

## Snapshots

After each command, playwright-cli returns a snapshot of the current browser state:

```bash
> playwright-cli goto https://example.com
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
[Snapshot](.playwright-cli/page-...yml)
```

On-demand snapshots (options combine freely):

```bash
playwright-cli snapshot                            # save to timestamped file
playwright-cli snapshot --filename=after-click.yaml # save when snapshot is the workflow result
playwright-cli snapshot "#main"                      # snapshot an element subtree
playwright-cli snapshot --depth=4                    # limit depth for efficiency
playwright-cli snapshot e34                          # partial snapshot from a ref
playwright-cli snapshot --boxes                      # include bounding boxes [box=x,y,w,h]
```

## Targeting elements

Use **refs** from the snapshot by default; CSS selectors and Playwright locators also work.

```bash
playwright-cli snapshot                              # get refs
playwright-cli click e15                              # ref

playwright-cli click "#main > button.submit"         # css selector
playwright-cli click "getByRole('button', { name: 'Submit' })"   # role locator
playwright-cli click "getByTestId('submit-button')"  # test id
```

## Browser sessions

```bash
playwright-cli -s=mysession open example.com --persistent
playwright-cli -s=mysession open example.com --profile=/path/to/profile
playwright-cli -s=mysession click e6
playwright-cli -s=mysession close          # stop a named browser
playwright-cli -s=mysession delete-data    # delete user data for persistent session

playwright-cli list
playwright-cli close-all                    # close all browsers
playwright-cli kill-all                     # forcefully kill all browser processes
```

## URLs with `&` on Windows

`cmd.exe` / PowerShell treat `&` as a command separator, truncating multi-param URLs. Escape with `^&` in `cmd.exe`, or use `--%` in PowerShell:

```batch
playwright-cli goto "https://example.com/?a=1^&b=2"
```

```powershell
playwright-cli --% goto "https://example.com/?a=1&b=2"
```

## Examples

### Form submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot
playwright-cli close
```

### Multi-tab workflow

```bash
playwright-cli open https://example.com
playwright-cli tab-new https://example.com/other
playwright-cli tab-list
playwright-cli tab-select 0
playwright-cli snapshot
playwright-cli close
```

### Debugging with DevTools

```bash
playwright-cli open https://example.com
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli console
playwright-cli requests
playwright-cli close
```

### Tracing a flow

```bash
playwright-cli open https://example.com
playwright-cli tracing-start
playwright-cli click e4
playwright-cli fill e7 "test"
playwright-cli tracing-stop
playwright-cli close
```

### Interactive UI review

Ask the user for UI review / design feedback. They draw boxes on the live page and type comments; you receive the annotated screenshot, the snapshot of the marked region, and the notes:

```bash
playwright-cli open https://example.com
playwright-cli show --annotate
```

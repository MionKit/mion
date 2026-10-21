# Storage Management

Manage cookies, localStorage, sessionStorage, full browser storage state (save + restore).

## Storage State

- `playwright-cli state-save`: auto filename `storage-state-{timestamp}.json`.
- `playwright-cli state-save my-auth-state.json`: named file.
- `playwright-cli state-load my-auth-state.json`.
- Then reload to apply cookies: `playwright-cli open https://example.com`.

### Storage State File Format

```json
{
  "cookies": [{ "name": "session_id", "value": "abc123", "domain": "example.com", "path": "/",
    "expires": 1893456000, "httpOnly": true, "secure": true, "sameSite": "Lax" }],
  "origins": [{ "origin": "https://example.com",
    "localStorage": [{ "name": "theme", "value": "dark" }, { "name": "user_id", "value": "12345" }] }]
}
```

## Cookies

```bash
playwright-cli cookie-list
playwright-cli cookie-list --domain=example.com
playwright-cli cookie-list --path=/api
playwright-cli cookie-get session_id
playwright-cli cookie-set session abc123
playwright-cli cookie-set session abc123 --domain=example.com --path=/ --httpOnly --secure --sameSite=Lax
playwright-cli cookie-set remember_me token123 --expires=1893456000   # Unix timestamp
playwright-cli cookie-delete session_id
playwright-cli cookie-clear
```

- Several cookies at once / custom options → `run-code`:

```bash
playwright-cli run-code "async page => {
  await page.context().addCookies([
    { name: 'session_id', value: 'sess_abc123', domain: 'example.com', path: '/', httpOnly: true },
    { name: 'preferences', value: JSON.stringify({ theme: 'dark' }), domain: 'example.com', path: '/' }
  ]);
}"
```

## Local Storage

```bash
playwright-cli localstorage-list
playwright-cli localstorage-get token
playwright-cli localstorage-set theme dark
playwright-cli localstorage-set user_settings '{"theme":"dark","language":"en"}'   # JSON value
playwright-cli localstorage-delete token
playwright-cli localstorage-clear
playwright-cli run-code "async page => {   // several values at once
  await page.evaluate(() => {
    localStorage.setItem('token', 'jwt_abc123');
    localStorage.setItem('expires_at', Date.now() + 3600000);
  });
}"
```

## Session Storage

- `sessionstorage-list`, `sessionstorage-get form_data`, `sessionstorage-set step 3`.
- `sessionstorage-delete step`, `sessionstorage-clear`.

## IndexedDB

```bash
playwright-cli run-code "async page => { return await page.evaluate(() => indexedDB.databases()); }"   # list DBs
playwright-cli run-code "async page => { await page.evaluate(() => indexedDB.deleteDatabase('myDatabase')); }"
```

## Common Patterns

### Authentication State Reuse

```bash
playwright-cli open https://app.example.com/login
# log in: snapshot, fill e1 / e2, click e3
playwright-cli state-save auth.json
# later: restore state, skip login
playwright-cli state-load auth.json
playwright-cli open https://app.example.com/dashboard   # already logged in
```

- Set state without a login form: `eval` writes it, then `state-save`.
  `playwright-cli eval "() => { document.cookie = 'session=abc123'; localStorage.setItem('user', 'john'); }"`

## Security Notes

- Never commit storage state files holding auth tokens.
- Add `*.auth-state.json` to `.gitignore`.
- Delete state files after automation completes.
- Sensitive data → environment variables.
- Default sessions run in-memory: safer for sensitive operations.

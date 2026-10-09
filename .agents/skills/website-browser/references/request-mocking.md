# Request Mocking

Intercept, mock, modify, block network requests.

## CLI Route Commands

```bash
playwright-cli route "**/*.jpg" --status=404                     # custom status
playwright-cli route "**/api/users" --body='[{"id":1,"name":"Alice"}]' --content-type=application/json
playwright-cli route "**/api/data" --body='{"ok":true}' --header="X-Custom: value"
playwright-cli route "**/*" --remove-header=cookie,authorization  # strip request headers
playwright-cli route-list                                         # active routes
playwright-cli unroute "**/*.jpg"                                 # one route
playwright-cli unroute                                            # all routes
```

## URL Patterns

- `**/api/users`: exact path. `**/api/*/details`: wildcard in path.
- `**/*.{png,jpg,jpeg}`: file extensions. `**/search?q=*`: query params.

## Advanced Mocking with run-code

For conditional responses, request body inspection, response modification, delays.

### Conditional Response Based on Request

```bash
playwright-cli run-code "async page => {
  await page.route('**/api/login', route => {
    const body = route.request().postDataJSON();
    if (body.username === 'admin') {
      route.fulfill({ body: JSON.stringify({ token: 'mock-token' }) });
    } else {
      route.fulfill({ status: 401, body: JSON.stringify({ error: 'Invalid' }) });
    }
  });
}"
```

### Modify Real Response

```bash
playwright-cli run-code "async page => {
  await page.route('**/api/user', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.isPremium = true;
    await route.fulfill({ response, json });
  });
}"
```

### Simulate Network Failures

```bash
playwright-cli run-code "async page => {
  await page.route('**/api/offline', route => route.abort('internetdisconnected'));
}"
# Options: connectionrefused, timedout, connectionreset, internetdisconnected
```

### Delayed Response

```bash
playwright-cli run-code "async page => {
  await page.route('**/api/slow', async route => {
    await new Promise(r => setTimeout(r, 3000));
    route.fulfill({ body: JSON.stringify({ data: 'loaded' }) });
  });
}"
```

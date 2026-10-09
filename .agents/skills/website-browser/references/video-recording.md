# Video Recording

Record browser automation as video for debugging, documentation, verification. Output: WebM (VP8/VP9 codec).

## Basic Recording

```bash
playwright-cli open                       # open browser first
playwright-cli video-start demo.webm
playwright-cli video-chapter "Getting Started" --description="Opening the homepage" --duration=2000
playwright-cli goto https://example.com
playwright-cli click e1
playwright-cli video-chapter "Filling Form" --description="Entering test data" --duration=2000
playwright-cli fill e2 "test input"
playwright-cli video-stop                 # stop + save
```

## Best Practices

### 1. Use Descriptive Filenames

- Put context in the name: `video-start recordings/login-flow-2024-01-15.webm`, `recordings/checkout-test-run-42.webm`.

### 2. Record entire hero scripts

Video for the user or as proof of work → write a script, run it with `run-code`. Allows pauses + annotations.

1. Run the scenario with the CLI. Note every locator + action (locators give bounding boxes for highlights).
2. Write the video script to a file (below). `pressSequentially` with delay for nice typing. Reasonable pauses.
3. `playwright-cli run-code --filename your-script.js`.

- Overlays are `pointer-events: none`: never block clicks, fills or other actions. Sticky overlays can stay on.

```js
async page => {
  await page.screencast.start({ path: 'video.webm', size: { width: 1280, height: 800 } });
  await page.goto('https://demo.playwright.dev/todomvc');
  // Chapter card: blurs page, shows dialog, blocks until duration ends, then auto-removes.
  // Simple cases only; hand-craft richer overlays with page.screencast.showOverlay().
  await page.screencast.showChapter('Adding Todo Items', {
    description: 'We will add several items to the todo list.',
    duration: 2000,
  });
  const input = page.getByRole('textbox', { name: 'What needs to be done?' });
  await input.pressSequentially('Walk the dog', { delay: 60 });
  await input.press('Enter');
  await page.waitForTimeout(1000);
  // Sticky annotation (no duration): stays while you act, until disposed.
  const annotation = await page.screencast.showOverlay(`
    <div style="position: absolute; top: 8px; right: 8px; padding: 6px 12px; background: rgba(0,0,0,0.7);
      border-radius: 8px; font-size: 13px; color: white;">✓ Item added successfully</div>
  `);
  await input.pressSequentially('Buy groceries', { delay: 60 });
  await input.press('Enter');
  await page.waitForTimeout(1500);
  await annotation.dispose();
  // Highlight a locator + contextual callout.
  const bounds = await page.getByText('Walk the dog').boundingBox();
  await page.screencast.showOverlay(`
    <div style="position: absolute; top: ${bounds.y}px; left: ${bounds.x}px;
      width: ${bounds.width}px; height: ${bounds.height}px; border: 1px solid red;"></div>
    <div style="position: absolute; top: ${bounds.y + bounds.height + 5}px; left: ${bounds.x + bounds.width / 2}px;
      transform: translateX(-50%); padding: 6px; background: #808080; border-radius: 10px;
      font-size: 14px; color: white;">Check it out, it is right above this text</div>
  `, { duration: 2000 });
  await page.screencast.stop();
}
```

- Be creative: overlays are powerful.

### Overlay API Summary

- `page.screencast.showChapter(title, { description?, duration?, styleSheet? })`: full-screen chapter card.
  Blurred backdrop. Ideal for section transitions.
- `page.screencast.showOverlay(html, { duration? })`: custom HTML overlay for callouts, labels, highlights.
- `disposable.dispose()`: remove a sticky overlay added without duration.
- `page.screencast.hideOverlays()` / `page.screencast.showOverlays()`: temporarily hide/show all overlays.

## Tracing vs Video

- Video = visual recording for demos, documentation. Trace = DOM, network, console, actions for debugging.
- Full comparison: [tracing.md](tracing.md).

## Limitations

- Recording adds slight overhead to automation.
- Large recordings can consume significant disk space.

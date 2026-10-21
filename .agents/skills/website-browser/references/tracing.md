# Tracing

Detailed execution traces for debugging + analysis: DOM snapshots, screenshots, network activity, console logs.

## Basic Usage

```bash
playwright-cli tracing-start
playwright-cli open https://example.com
playwright-cli click e1
playwright-cli fill e2 "test"
playwright-cli tracing-stop
```

## Trace Output Files

Tracing writes to `.playwright-cli/traces/`:

- `trace-{timestamp}.trace`: action log. Every action (clicks, fills, hovers, keyboard input, navigations).
  Also DOM snapshots before + after each action, screenshots per step, timing, console messages, source locations.
- `trace-{timestamp}.network`: all HTTP requests + responses, headers + bodies, resource sizes, failures + errors.
  Timing: DNS, connect, TLS, TTFB, download.
- `resources/`: cached images, fonts, stylesheets, scripts, response bodies for replay, assets to rebuild page state.

## Use Cases

- Failed action (e.g. a click fails): open the trace, see DOM state when click was attempted.
- Performance: trace the page load, view network waterfall to find slow resources.
- Evidence: record a full user flow for documentation. Trace shows exact event sequence.

## Trace vs Video vs Screenshot

| Feature | Trace | Video | Screenshot |
|---------|-------|-------|------------|
| **Format** | .trace file (Trace Viewer) | .webm video | .png/.jpeg image |
| **DOM inspection** | Yes | No | No |
| **Network details** | Yes | No | No |
| **Step-by-step replay** | Yes | Continuous | Single frame |
| **File size** | Medium | Large | Small |
| **Best for** | Debugging | Demos, documentation | Quick capture |

## Best Practices

- Start tracing before the problem: trace the whole flow, not just the failing step.
- Traces eat disk. Remove ones older than 7 days: `find .playwright-cli/traces -mtime +7 -delete`.

## Limitations

- Traces add overhead to automation.
- Large traces can consume significant disk space.
- Some dynamic content may not replay perfectly.

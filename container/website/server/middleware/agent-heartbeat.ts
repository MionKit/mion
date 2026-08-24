import { utimes } from 'node:fs/promises'

// Agent idle-shutdown heartbeat.
// When the site runs in agent mode (RT_AGENT_HEARTBEAT set by `website.sh dev
// --isAgent`), every request bumps the mtime of the heartbeat file. A watchdog
// inside the container stops the server once that file goes stale (no requests
// within the idle window), so an agent-spawned site never lingers. No-op when
// RT_AGENT_HEARTBEAT is unset (normal dev / production).
const heartbeatFile = process.env.RT_AGENT_HEARTBEAT
let lastTouch = 0

export default defineEventHandler(() => {
  if (!heartbeatFile) return
  const now = Date.now()
  // Throttle to at most one touch/second to keep this off the hot path.
  if (now - lastTouch < 1000) return
  lastTouch = now
  const seconds = now / 1000
  utimes(heartbeatFile, seconds, seconds).catch(() => {})
})

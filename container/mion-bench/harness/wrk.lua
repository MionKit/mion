-- ########
-- 2026 mion
-- Author: Ma-jerez
-- License: MIT
-- The software is provided "as is", without warranty of any kind.
-- ########

-- The load generator's request builder and reporter, driven by harness/run.mjs.
--
-- wrk builds its requests inside LuaJIT, so the per-request body has to cross the
-- boundary somehow. run.mjs splits ONE body built by shared/payloads.mjs around its
-- `id` and drops the two halves in a job dir; this script stamps a fresh id between
-- them on every request. That keeps the guarantee autocannon's setupRequest gave (no
-- framework is ever measured serving its own cached response) while shared/payloads.mjs
-- stays the only place a payload is written. The upstream benchmarks repo pasted the
-- JSON bodies into its Lua script instead, which left two copies to drift apart and
-- could not express the payload-size sweep at all.
--
-- Inputs:
--   MION_BENCH_WRK_JOB    dir holding body.prefix + body.suffix. Unset = a bodyless suite.
--   MION_BENCH_WRK_REPORT file this script writes its one-line JSON result to.
--   script args           <method> <pipelining>, appended after the URL by run.mjs.

local jobDir = os.getenv('MION_BENCH_WRK_JOB')
local reportPath = os.getenv('MION_BENCH_WRK_REPORT')

local bodyPrefix = nil
local bodySuffix = nil
local pipelining = 1
local pipelinedTemplate = nil

local function readFile(path)
  local file = assert(io.open(path, 'rb'), 'wrk.lua: cannot read ' .. path)
  local contents = file:read('*a')
  file:close()
  return contents
end

-- Every thread gets its own Lua state and its own seed. Seeding from os.time() alone
-- (which is what upstream did) hands every thread the SAME id sequence, because they
-- all start inside the same second.
local threadIds = 0
function setup(thread)
  threadIds = threadIds + 1
  thread:set('mionThreadId', threadIds)
end

-- A whole number well inside the JSON-safe integer range, printed without an exponent
-- so it parses as the same kind of id every other lane receives. Composed from two
-- halves because a Lua number is a double.
local function randomId()
  return string.format('%.0f', math.random(0, 4194303) * 16777216 + math.random(0, 16777215))
end

function init(args)
  wrk.method = args[1] or 'GET'
  pipelining = tonumber(args[2]) or 1
  -- The same two headers autocannon sent on every suite, including the bodyless one.
  wrk.headers['Content-Type'] = 'application/json'
  wrk.headers['Accept'] = '*/*'
  math.randomseed(os.time() * 1000 + (mionThreadId or 0) * 7919)

  if jobDir then
    bodyPrefix = readFile(jobDir .. '/body.prefix')
    bodySuffix = readFile(jobDir .. '/body.suffix')
  end
end

function request()
  if not bodyPrefix then
    -- Nothing varies per request, so the whole batch is formatted once and reused.
    -- Built here rather than in init() because wrk fills wrk.path from the URL on its
    -- own schedule, and the first request() call is the first point it is certainly set.
    if not pipelinedTemplate then pipelinedTemplate = string.rep(wrk.format(), pipelining) end
    return pipelinedTemplate
  end
  if pipelining == 1 then return wrk.format(nil, nil, nil, bodyPrefix .. randomId() .. bodySuffix) end
  -- wrk has no pipelining flag: N requests concatenated into one write is how it is done.
  local batch = {}
  for i = 1, pipelining do batch[i] = wrk.format(nil, nil, nil, bodyPrefix .. randomId() .. bodySuffix) end
  return table.concat(batch)
end

-- Written to a file rather than printed with a marker for run.mjs to scrape out of
-- stdout: wrk's own summary shares that stream, and a parse that has to find its result
-- in it is a parse that can silently find the wrong thing.
function done(summary, latency, requests)
  local durationSec = summary.duration / 1e6
  local errors = summary.errors or {}
  local report = string.format(
    '{"durationSec":%.6f,"requestsTotal":%d,"bytes":%d,' ..
      '"requestsPerSec":%.4f,"requestsStddev":%.4f,' ..
      '"latencyMeanMs":%.4f,"latencyP99Ms":%.4f,' ..
      '"non2xx":%d,"timeouts":%d,"connect":%d,"read":%d,"write":%d}',
    durationSec, summary.requests, summary.bytes,
    summary.requests / durationSec, requests.stdev,
    latency.mean / 1000, latency:percentile(99) / 1000,
    errors.status or 0, errors.timeout or 0, errors.connect or 0, errors.read or 0, errors.write or 0
  )
  local file = assert(io.open(reportPath, 'w'), 'wrk.lua: cannot write ' .. tostring(reportPath))
  file:write(report)
  file:close()
end

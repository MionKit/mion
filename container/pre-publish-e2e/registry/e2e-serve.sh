#!/bin/sh
# Start verdaccio, publish the mounted /tarballs (both the @ts-runtypes/* and the
# @mionjs/* families) in dependency-safe order, then signal readiness
# (/tmp/registry-ready, checked by the container healthcheck) and keep the process
# alive so the registry stays up for the whole e2e run. Baked
# into the shared image; started by `podman run` (see scripts/container/image.mjs
# cmdRegistry). ASCII-only per the repo's shell-script rule.
set -eu

CONFIG="${MION_E2E_VERDACCIO_CONFIG:-/etc/verdaccio/config.yaml}"
REGISTRY="http://127.0.0.1:4873"
TARBALLS="/tarballs"

mkdir -p /tmp/verdaccio-storage
echo "e2e-serve: starting verdaccio on 0.0.0.0:4873"
verdaccio --config "$CONFIG" --listen 0.0.0.0:4873 >/tmp/verdaccio.log 2>&1 &
VERDACCIO_PID=$!

# Wait until verdaccio answers (node fetch; node is always present in this image).
i=0
until node -e "fetch('$REGISTRY/-/ping').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 120 ]; then
    echo "e2e-serve: verdaccio did not become ready" >&2
    cat /tmp/verdaccio.log >&2 || true
    exit 1
  fi
  sleep 0.5
done
echo "e2e-serve: verdaccio is up"

# npm needs a token line even for anonymous publish.
npm config set "//127.0.0.1:4873/:_authToken" "e2e-local-verdaccio" >/dev/null 2>&1 || true

# publish_glob GLOB FOUNDVAR - publish every tarball matching GLOB and set the
# shell variable named FOUNDVAR to 1 if at least one matched. Progress goes to
# stdout; the found flag rides a named var (not stdout) so nothing is captured.
FOUND_CORE=0
FOUND_DEVTOOLS=0
FOUND_MION_CORE=0
FOUND_MION_ROUTER=0
FOUND_MION_DEVTOOLS=0
publish_glob() {
  for tgz in "$TARBALLS"/$1; do
    [ -e "$tgz" ] || continue
    eval "$2=1"
    echo "e2e-serve: publishing $(basename "$tgz")"
    npm publish "$tgz" --registry "$REGISTRY" --access public >/dev/null 2>&1 \
      || npm publish "$tgz" --registry "$REGISTRY" --access public
  done
}

# require_found NAME FLAG - abort with a legible message when a family the e2e
# depends on never showed up in /tarballs (a pack that silently dropped it).
require_found() {
  if [ "$2" != "1" ]; then
    echo "e2e-serve: expected a $1 tarball in $TARBALLS but found none" >&2
    ls -la "$TARBALLS" >&2 || true
    exit 1
  fi
}

# Dependency-safe order, leaves first. npm publish does not validate that a
# dependency already exists, and nothing installs until every publish is done, so
# the order is not load-bearing HERE - it mirrors the real publish order
# (publish-tarballs.mjs) so the two can never tell different stories.
#
# runtypes family: every platform binary, the launcher, then the FE packages.
publish_glob 'ts-runtypes-binary-*.tgz' _ignore
publish_glob 'ts-runtypes-bin-*.tgz' _ignore
publish_glob 'mionjs-run-types-*.tgz' FOUND_CORE
publish_glob 'ts-runtypes-devtools-*.tgz' FOUND_DEVTOOLS
require_found '@mionjs/run-types' "$FOUND_CORE"
require_found '@ts-runtypes/devtools' "$FOUND_DEVTOOLS"

# mion family, after the runtypes one it depends on. Real graph:
#   @mionjs/core      -> @mionjs/run-types
#   @mionjs/devtools  -> @ts-runtypes/{bin,devtools}   (NOT @mionjs/core)
#   router/client/drizzle -> @mionjs/core
#   platform-*        -> @mionjs/{core,router}  (+ @ts-runtypes/{bin,devtools} for bun)
publish_glob 'mionjs-core-*.tgz' FOUND_MION_CORE
publish_glob 'mionjs-devtools-*.tgz' FOUND_MION_DEVTOOLS
publish_glob 'mionjs-router-*.tgz' FOUND_MION_ROUTER
publish_glob 'mionjs-client-*.tgz' _ignore
publish_glob 'mionjs-drizzle-*.tgz' _ignore
# uws binary mirror: the glob covers the @mionjs/uws-<os>-<arch> payloads AND the
# @mionjs/uws loader shim whose optionalDependencies pin them; platform-uws (below)
# depends on the shim.
publish_glob 'mionjs-uws-*.tgz' _ignore
publish_glob 'mionjs-platform-*.tgz' _ignore
require_found '@mionjs/core' "$FOUND_MION_CORE"
require_found '@mionjs/router' "$FOUND_MION_ROUTER"
require_found '@mionjs/devtools' "$FOUND_MION_DEVTOOLS"
echo "e2e-serve: all tarballs published"

# Readiness signal the container healthcheck greps.
touch /tmp/registry-ready
echo "e2e-serve: ready"

# Keep the container alive (verdaccio is backgrounded).
wait "$VERDACCIO_PID"

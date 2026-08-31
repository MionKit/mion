#!/bin/sh
# Start verdaccio and publish the mounted /tarballs, then signal readiness
# (/tmp/registry-ready, checked by the container healthcheck) and keep the
# process alive for the whole run. Baked into all three drizzle-e2e images.
#
# Only the drizzle family and the launcher are needed here, but the whole
# /tarballs dir is published anyway: the packed @mionjs/drizzle-orm-*-core
# declare their @mionjs/run-types peer by exact version, so that one has to be
# resolvable too. ASCII-only per the repo's shell-script rule.
set -eu

CONFIG="${RT_DRIZZLE_VERDACCIO_CONFIG:-/etc/verdaccio/config.yaml}"
REGISTRY="http://127.0.0.1:4873"
TARBALLS="/tarballs"

mkdir -p /tmp/verdaccio-storage
echo "drizzle-serve: starting verdaccio on 0.0.0.0:4873"
verdaccio --config "$CONFIG" --listen 0.0.0.0:4873 >/tmp/verdaccio.log 2>&1 &
VERDACCIO_PID=$!

# Wait until verdaccio answers (node fetch; node is always present in this image).
i=0
until node -e "fetch('$REGISTRY/-/ping').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 120 ]; then
    echo "drizzle-serve: verdaccio did not become ready" >&2
    cat /tmp/verdaccio.log >&2 || true
    exit 1
  fi
  sleep 0.5
done
echo "drizzle-serve: verdaccio is up"

# npm needs a token line even for anonymous publish.
npm config set "//127.0.0.1:4873/:_authToken" "drizzle-e2e-local-verdaccio" >/dev/null 2>&1 || true

FOUND_BIN=0
FOUND_CORE=0
FOUND_DRIZZLE=0
publish_glob() {
  for tgz in "$TARBALLS"/$1; do
    [ -e "$tgz" ] || continue
    eval "$2=1"
    echo "drizzle-serve: publishing $(basename "$tgz")"
    npm publish "$tgz" --registry "$REGISTRY" --access public >/dev/null 2>&1 \
      || npm publish "$tgz" --registry "$REGISTRY" --access public
  done
}

require_found() {
  if [ "$2" != "1" ]; then
    echo "drizzle-serve: expected a $1 tarball in $TARBALLS but found none" >&2
    ls -la "$TARBALLS" >&2 || true
    exit 1
  fi
}

# Leaves first, mirroring the real publish order. The platform binaries carry the
# translator; the launcher resolves one of them as an optional dependency.
publish_glob 'ts-runtypes-binary-*.tgz' _ignore
publish_glob 'ts-runtypes-bin-*.tgz' FOUND_BIN
publish_glob 'ts-runtypes-core-*.tgz' FOUND_CORE
publish_glob 'ts-runtypes-devtools-*.tgz' _ignore
publish_glob 'mionjs-drizzle-*.tgz' FOUND_DRIZZLE
require_found '@ts-runtypes/bin' "$FOUND_BIN"
require_found '@mionjs/run-types' "$FOUND_CORE"
require_found '@mionjs/drizzle-orm' "$FOUND_DRIZZLE"
echo "drizzle-serve: all tarballs published"

touch /tmp/registry-ready
echo "drizzle-serve: ready"

wait "$VERDACCIO_PID"

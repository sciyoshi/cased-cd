#!/bin/sh
# Exercise the production entrypoint, TLS helper, and nginx template together.
# nginx variables must remain literal in assertions.
# shellcheck disable=SC2016

set -u

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
TEST_FAILURES=0
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/cased-cd-nginx.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

pass() {
  printf '✓ %s\n' "$1"
}

fail() {
  printf '✗ %s\n' "$1" >&2
  TEST_FAILURES=$((TEST_FAILURES + 1))
}

skip() {
  printf '○ SKIP: %s\n' "$1"
}

assert_contains() {
  file=$1
  expected=$2
  message=$3
  if grep -Fq -- "$expected" "$file"; then
    pass "$message"
  else
    fail "$message (missing: $expected)"
  fi
}

assert_not_contains() {
  file=$1
  unexpected=$2
  message=$3
  if grep -Fq -- "$unexpected" "$file"; then
    fail "$message (found: $unexpected)"
  else
    pass "$message"
  fi
}

cat > "$TEST_DIR/fake-nginx" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$NGINX_CALL_LOG"
EOF
chmod +x "$TEST_DIR/fake-nginx"
printf 'nameserver 10.96.0.10\n' > "$TEST_DIR/resolv.conf"
printf 'types {}\n' > "$TEST_DIR/mime.types"
if [ -r /etc/ssl/certs/ca-certificates.crt ]; then
  cp /etc/ssl/certs/ca-certificates.crt "$TEST_DIR/test-ca.crt"
elif [ -r /etc/ssl/cert.pem ]; then
  cp /etc/ssl/cert.pem "$TEST_DIR/test-ca.crt"
else
  printf 'test certificate\n' > "$TEST_DIR/test-ca.crt"
fi
export NGINX_CALL_LOG="$TEST_DIR/nginx-calls.log"

run_entrypoint() {
  ARGOCD_SERVER=$1 \
  ARGOCD_INSECURE=$2 \
  ARGOCD_CA_CERT_PATH=$3 \
  ARGOCD_TLS_SERVER_NAME=$4 \
  SYSTEM_CA_CERTIFICATE="$TEST_DIR/test-ca.crt" \
  PROXY_TLS_HELPER="$SCRIPT_DIR/proxy-tls.sh" \
  NGINX_TEMPLATE="$SCRIPT_DIR/nginx.conf.template" \
  NGINX_CONFIG="$TEST_DIR/nginx.conf" \
  NGINX_MIME_TYPES="${TEST_NGINX_MIME_TYPES:-$TEST_DIR/mime.types}" \
  NGINX_LOG_DIR="$TEST_DIR" \
  NGINX_BIN="$TEST_DIR/fake-nginx" \
  RESOLV_CONF="$TEST_DIR/resolv.conf" \
  CASED_CD_ENTRYPOINT_TEST_ONLY=true \
    sh "$SCRIPT_DIR/entrypoint.sh" > "$TEST_DIR/entrypoint.log" 2>&1
}

printf 'Testing production nginx artifacts\n\n'

if sh -n "$SCRIPT_DIR/entrypoint.sh" "$SCRIPT_DIR/proxy-tls.sh"; then
  pass "Production shell artifacts have valid POSIX syntax"
else
  fail "Production shell artifacts have invalid syntax"
fi

if run_entrypoint \
  "https://argocd-server.argocd.svc.cluster.local" \
  false \
  "$TEST_DIR/test-ca.crt" \
  "argocd.internal.example"; then
  pass "Production entrypoint renders secure proxy configuration"
else
  fail "Production entrypoint failed in secure mode"
  cat "$TEST_DIR/entrypoint.log" >&2
fi

assert_contains "$TEST_DIR/nginx.conf" \
  'set $proxy_target "https://argocd-server.argocd.svc.cluster.local";' \
  "Argo CD server is rendered without erasing nginx variables"
assert_contains "$TEST_DIR/nginx.conf" \
  'resolver 10.96.0.10 valid=10s ipv6=off;' \
  "Resolver is read from the configured resolv.conf"
assert_contains "$TEST_DIR/nginx.conf" \
  'proxy_ssl_verify on;' \
  "Secure mode enables upstream certificate verification"
assert_contains "$TEST_DIR/nginx.conf" \
  "proxy_ssl_trusted_certificate \"$TEST_DIR/test-ca.crt\";" \
  "Secure mode uses the configured CA certificate"
assert_contains "$TEST_DIR/nginx.conf" \
  'proxy_ssl_name argocd.internal.example;' \
  "Secure mode uses the configured TLS server name"
assert_contains "$TEST_DIR/nginx.conf" \
  'proxy_pass $proxy_target;' \
  "Runtime proxy target variable survives rendering"
assert_contains "$TEST_DIR/nginx.conf" \
  'try_files $uri $uri/ /index.html;' \
  "Unrelated nginx runtime variables survive rendering"
assert_not_contains "$TEST_DIR/nginx.conf" '${PROXY_' \
  "All proxy deployment placeholders are rendered"
assert_not_contains "$TEST_DIR/nginx.conf" '${NGINX_' \
  "All nginx deployment placeholders are rendered"
assert_contains "$NGINX_CALL_LOG" "-t -c $TEST_DIR/nginx.conf" \
  "Entrypoint validates the generated configuration"

proxy_count=$(grep -Fc -- 'proxy_pass $proxy_target;' "$TEST_DIR/nginx.conf" || true)
if [ "$proxy_count" -eq 3 ]; then
  pass "Auth, session, and API routes all use the configured proxy target"
else
  fail "Expected three proxied route groups, found $proxy_count"
fi

if run_entrypoint \
  "https://argocd-server.argocd.svc.cluster.local:8443" \
  true \
  "/does/not/exist" \
  ""; then
  pass "Production entrypoint renders explicit insecure mode"
else
  fail "Production entrypoint failed in insecure mode"
  cat "$TEST_DIR/entrypoint.log" >&2
fi

assert_contains "$TEST_DIR/nginx.conf" 'proxy_ssl_verify off;' \
  "Insecure mode is explicit"
assert_contains "$TEST_DIR/nginx.conf" \
  "proxy_ssl_trusted_certificate \"$TEST_DIR/test-ca.crt\";" \
  "Insecure mode does not require an optional CA Secret"
assert_contains "$TEST_DIR/nginx.conf" \
  'proxy_ssl_name argocd-server.argocd.svc.cluster.local;' \
  "TLS server name is derived from the upstream URL"

if ARGOCD_SERVER="https://argocd-server" \
  ARGOCD_INSECURE=invalid \
  SYSTEM_CA_CERTIFICATE="$TEST_DIR/test-ca.crt" \
  PROXY_TLS_HELPER="$SCRIPT_DIR/proxy-tls.sh" \
  NGINX_TEMPLATE="$SCRIPT_DIR/nginx.conf.template" \
  NGINX_CONFIG="$TEST_DIR/invalid.conf" \
  NGINX_LOG_DIR="$TEST_DIR" \
  NGINX_BIN="$TEST_DIR/fake-nginx" \
  RESOLV_CONF="$TEST_DIR/resolv.conf" \
  CASED_CD_ENTRYPOINT_TEST_ONLY=true \
    sh "$SCRIPT_DIR/entrypoint.sh" > /dev/null 2>&1; then
  fail "Invalid ARGOCD_INSECURE values must fail closed"
else
  pass "Invalid ARGOCD_INSECURE values fail closed"
fi

if ARGOCD_SERVER='https://argocd-server";return 200;#' \
  ARGOCD_INSECURE=false \
  ARGOCD_CA_CERT_PATH="$TEST_DIR/test-ca.crt" \
  sh -c '. "$1"; configure_proxy_tls' sh "$SCRIPT_DIR/proxy-tls.sh" \
    > /dev/null 2>&1; then
  fail "Unsafe upstream URL characters must not reach the nginx template"
else
  pass "Unsafe upstream URL characters fail closed"
fi

find_mime_types() {
  for candidate in \
    /etc/nginx/mime.types \
    /opt/homebrew/etc/nginx/mime.types \
    /usr/local/etc/nginx/mime.types; do
    if [ -r "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  nginx_configuration=$(nginx -V 2>&1 || true)
  nginx_conf_path=$(printf '%s\n' "$nginx_configuration" | sed -n 's/.*--conf-path=\([^ ]*\).*/\1/p')
  if [ -n "$nginx_conf_path" ]; then
    candidate=$(dirname -- "$nginx_conf_path")/mime.types
    if [ -r "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  nginx_prefix=$(printf '%s\n' "$nginx_configuration" | sed -n 's/.*--prefix=\([^ ]*\).*/\1/p')
  if [ -n "$nginx_prefix" ] && [ -r "$nginx_prefix/conf/mime.types" ]; then
    printf '%s\n' "$nginx_prefix/conf/mime.types"
    return 0
  fi
  return 1
}

if command -v nginx > /dev/null 2>&1 && mime_types=$(find_mime_types); then
  TEST_NGINX_MIME_TYPES="$mime_types" run_entrypoint \
    "https://argocd-server.argocd.svc.cluster.local" \
    false \
    "$TEST_DIR/test-ca.crt" \
    "argocd.internal.example"

  if command -v sudo > /dev/null 2>&1 && sudo -n true > /dev/null 2>&1; then
    syntax_command="sudo -n nginx"
  else
    syntax_command=nginx
  fi

  # shellcheck disable=SC2086
  if $syntax_command -t -c "$TEST_DIR/nginx.conf" > "$TEST_DIR/nginx-syntax.log" 2>&1; then
    pass "Installed nginx accepts the configuration rendered from production artifacts"
  else
    fail "Installed nginx rejected the rendered production configuration"
    cat "$TEST_DIR/nginx-syntax.log" >&2
  fi
elif [ "${REQUIRE_NGINX_SYNTAX:-false}" = true ]; then
  fail "nginx syntax validation was required but nginx or mime.types was unavailable"
else
  skip "nginx binary unavailable; CI requires and runs the real syntax check"
fi

printf '\n'
if [ "$TEST_FAILURES" -eq 0 ]; then
  printf '✓ All nginx artifact tests passed\n'
  exit 0
fi

printf '✗ %s nginx artifact test(s) failed\n' "$TEST_FAILURES" >&2
exit 1

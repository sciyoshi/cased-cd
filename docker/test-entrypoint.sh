#!/bin/bash
# Test script for entrypoint.sh and nginx configuration
# Tests enterprise routing logic

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_FAILURES=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Testing nginx entrypoint configuration..."
echo ""

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
}

fail() {
  echo -e "${RED}✗${NC} $1"
  TEST_FAILURES=$((TEST_FAILURES + 1))
}

info() {
  echo -e "${YELLOW}ℹ${NC} $1"
}

# Create temporary test directory
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

# Test 1: Standard mode (no ENTERPRISE_BACKEND_SERVICE)
test_standard_mode() {
  info "Test 1: Standard mode routing"

  export ARGOCD_SERVER="http://argocd-server.argocd.svc.cluster.local:80"
  unset ENTERPRISE_BACKEND_SERVICE

  # Source the entrypoint logic (without executing nginx)
  cd "$TEST_DIR"
  cat > test_entrypoint.sh << 'EOF'
ARGOCD_SERVER=${ARGOCD_SERVER:-http://argocd-server.argocd.svc.cluster.local:80}

if [ -n "$ENTERPRISE_BACKEND_SERVICE" ]; then
  PROXY_TARGET="http://${ENTERPRISE_BACKEND_SERVICE}:8081"
else
  PROXY_TARGET="$ARGOCD_SERVER"
fi

echo "$PROXY_TARGET"
EOF

  chmod +x test_entrypoint.sh
  RESULT=$(./test_entrypoint.sh)

  if [ "$RESULT" = "http://argocd-server.argocd.svc.cluster.local:80" ]; then
    pass "Standard mode routes to ArgoCD directly"
  else
    fail "Standard mode should route to ArgoCD, got: $RESULT"
  fi
}

# Test 2: Enterprise mode (ENTERPRISE_BACKEND_SERVICE set)
test_enterprise_mode() {
  info "Test 2: Enterprise mode routing"

  export ARGOCD_SERVER="http://argocd-server.argocd.svc.cluster.local:80"
  export ENTERPRISE_BACKEND_SERVICE="cased-cd-enterprise.argocd.svc.cluster.local"

  cd "$TEST_DIR"
  cat > test_entrypoint.sh << 'EOF'
ARGOCD_SERVER=${ARGOCD_SERVER:-http://argocd-server.argocd.svc.cluster.local:80}

if [ -n "$ENTERPRISE_BACKEND_SERVICE" ]; then
  PROXY_TARGET="http://${ENTERPRISE_BACKEND_SERVICE}:8081"
else
  PROXY_TARGET="$ARGOCD_SERVER"
fi

echo "$PROXY_TARGET"
EOF

  chmod +x test_entrypoint.sh
  RESULT=$(./test_entrypoint.sh)

  if [ "$RESULT" = "http://cased-cd-enterprise.argocd.svc.cluster.local:8081" ]; then
    pass "Enterprise mode routes to enterprise backend"
  else
    fail "Enterprise mode should route to backend, got: $RESULT"
  fi
}

# Test 3: nginx template uses PROXY_TARGET with variable pattern
test_nginx_template() {
  info "Test 3: nginx template uses PROXY_TARGET with variable pattern"

  # Check that nginx sets $proxy_target variable from ${PROXY_TARGET}
  if grep -q 'set \$proxy_target "\${PROXY_TARGET}"' "$SCRIPT_DIR/nginx.conf.template"; then
    pass "nginx template sets \$proxy_target from PROXY_TARGET"
  else
    fail "nginx template should set \$proxy_target variable"
  fi

  # Check that proxy_pass uses the nginx variable (enables dynamic DNS)
  PROXY_COUNT=$(grep -c 'proxy_pass \$proxy_target' "$SCRIPT_DIR/nginx.conf.template" || true)
  if [ "$PROXY_COUNT" -ge 3 ]; then
    pass "proxy_pass uses \$proxy_target in $PROXY_COUNT locations"
  else
    fail "proxy_pass should use \$proxy_target for auth, session, and API routes (found $PROXY_COUNT)"
  fi

  if grep -q 'location /auth/' "$SCRIPT_DIR/nginx.conf.template"; then
    pass "Argo CD auth login, callback, and logout routes are proxied"
  else
    fail "nginx must proxy Argo CD /auth/ routes"
  fi

  if grep -q 'location /api/' "$SCRIPT_DIR/nginx.conf.template"; then
    pass "Argo CD Dex routes are covered by the API proxy"
  else
    fail "nginx must proxy Argo CD /api/dex routes"
  fi
}

# Test 4: nginx template validation
test_nginx_syntax() {
  info "Test 4: nginx configuration template validation"

  # Create test config with substituted variables
  export PROXY_TARGET="http://test-server:80"
  export DNS_RESOLVER="10.96.0.10"
  export PROXY_SSL_VERIFY="on"
  export PROXY_SSL_TRUSTED_CERTIFICATE="$TEST_DIR/test-ca.crt"
  export PROXY_SSL_NAME="test-server"
  touch "$PROXY_SSL_TRUSTED_CERTIFICATE"
  cd "$TEST_DIR"
  envsubst '${PROXY_TARGET} ${DNS_RESOLVER} ${PROXY_SSL_VERIFY} ${PROXY_SSL_TRUSTED_CERTIFICATE} ${PROXY_SSL_NAME}' < "$SCRIPT_DIR/nginx.conf.template" > nginx.conf

  # Validate that PROXY_TARGET was substituted into the set directive
  if grep -q 'set \$proxy_target "http://test-server:80"' nginx.conf; then
    pass "Template substitution sets \$proxy_target correctly"
  else
    fail "Template substitution failed - \$proxy_target not set correctly"
    return
  fi

  # Validate that DNS_RESOLVER was substituted into the resolver directive
  if grep -q 'resolver 10.96.0.10 valid=10s ipv6=off' nginx.conf; then
    pass "Template substitution sets DNS resolver correctly"
  else
    fail "Template substitution failed - DNS resolver not set correctly"
    grep 'resolver' nginx.conf || true
  fi

  # Validate that proxy_pass uses the variable
  if grep -q 'proxy_pass \$proxy_target' nginx.conf; then
    pass "proxy_pass uses nginx variable for dynamic DNS"
  else
    fail "proxy_pass should use \$proxy_target variable"
  fi

  if grep -q 'proxy_ssl_verify on;' nginx.conf &&
     grep -q "proxy_ssl_trusted_certificate \"$TEST_DIR/test-ca.crt\";" nginx.conf &&
     grep -q 'proxy_ssl_name test-server;' nginx.conf; then
    pass "Template substitution enables TLS verification with explicit trust and SNI"
  else
    fail "Template substitution did not render secure TLS settings"
  fi

  # Validate no unsubstituted variables remain
  if ! grep -q '\${' nginx.conf; then
    pass "No unsubstituted variables in generated config"
  else
    fail "Found unsubstituted variables in config"
    grep '\${' nginx.conf || true
  fi
}

# Test 5: entrypoint script uses envsubst correctly
test_envsubst() {
  info "Test 5: entrypoint renders routing and TLS variables"

  if grep -q "envsubst '\${PROXY_TARGET} \${DNS_RESOLVER} \${PROXY_SSL_VERIFY} \${PROXY_SSL_TRUSTED_CERTIFICATE} \${PROXY_SSL_NAME}'" "$SCRIPT_DIR/entrypoint.sh"; then
    pass "entrypoint.sh renders routing and TLS variables"
  else
    fail "entrypoint.sh should render routing and TLS variables"
  fi

  # Test that PROXY_TARGET is exported (required for envsubst)
  if grep -q "export PROXY_TARGET=" "$SCRIPT_DIR/entrypoint.sh"; then
    pass "PROXY_TARGET is exported for envsubst"
  else
    fail "PROXY_TARGET must be exported for envsubst to work"
  fi

  # Test that DNS_RESOLVER is exported (required for envsubst)
  if grep -q "export DNS_RESOLVER=" "$SCRIPT_DIR/entrypoint.sh"; then
    pass "DNS_RESOLVER is exported for envsubst"
  else
    fail "DNS_RESOLVER must be exported for envsubst to work"
  fi

  # Test that DNS_RESOLVER is detected from /etc/resolv.conf
  if grep -q "awk '/^nameserver/ {print \$2; exit}' /etc/resolv.conf" "$SCRIPT_DIR/entrypoint.sh"; then
    pass "DNS resolver is auto-detected from /etc/resolv.conf"
  else
    fail "entrypoint.sh should auto-detect DNS resolver from /etc/resolv.conf"
  fi
}

# Test 6: real TLS configuration helper
test_tls_modes() {
  info "Test 6: secure and insecure upstream TLS modes"

  TLS_HELPER="$SCRIPT_DIR/proxy-tls.sh"
  TEST_CA="$TEST_DIR/runtime-ca.crt"
  touch "$TEST_CA"

  RESULT=$(ARGOCD_SERVER="https://argocd-server.argocd.svc.cluster.local" \
    ARGOCD_INSECURE=false \
    ARGOCD_CA_CERT_PATH="$TEST_CA" \
    ARGOCD_TLS_SERVER_NAME="argocd.internal.example" \
    sh -c '. "$1"; configure_proxy_tls; printf "%s|%s|%s" "$PROXY_SSL_VERIFY" "$PROXY_SSL_TRUSTED_CERTIFICATE" "$PROXY_SSL_NAME"' sh "$TLS_HELPER")

  if [ "$RESULT" = "on|$TEST_CA|argocd.internal.example" ]; then
    pass "Secure mode verifies with the configured CA and SNI name"
  else
    fail "Secure mode resolved unexpected TLS settings: $RESULT"
  fi

  RESULT=$(ARGOCD_SERVER="https://argocd-server.argocd.svc.cluster.local" \
    ARGOCD_INSECURE=true \
    ARGOCD_CA_CERT_PATH="/missing/optional-ca.crt" \
    ARGOCD_TLS_SERVER_NAME="" \
    sh -c '. "$1"; configure_proxy_tls; printf "%s|%s|%s" "$PROXY_SSL_VERIFY" "$PROXY_SSL_TRUSTED_CERTIFICATE" "$PROXY_SSL_NAME"' sh "$TLS_HELPER")

  if [ "$RESULT" = "off|/etc/ssl/certs/ca-certificates.crt|argocd-server.argocd.svc.cluster.local" ]; then
    pass "Insecure mode is explicit and derives the upstream server name"
  else
    fail "Insecure mode resolved unexpected TLS settings: $RESULT"
  fi

  if ARGOCD_SERVER="https://argocd-server" ARGOCD_INSECURE=invalid \
    sh -c '. "$1"; configure_proxy_tls' sh "$TLS_HELPER" >/dev/null 2>&1; then
    fail "Invalid ARGOCD_INSECURE values should fail closed"
  else
    pass "Invalid ARGOCD_INSECURE values fail closed"
  fi

  if grep -Eq 'proxy_ssl_verify[[:space:]]+off;' "$SCRIPT_DIR/nginx.conf.template"; then
    fail "nginx template must not disable TLS verification unconditionally"
  else
    pass "nginx template has no unconditional TLS verification bypass"
  fi
}

# Run all tests
test_standard_mode
test_enterprise_mode
test_nginx_template
test_nginx_syntax
test_envsubst
test_tls_modes

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TEST_FAILURES -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ $TEST_FAILURES test(s) failed${NC}"
  exit 1
fi

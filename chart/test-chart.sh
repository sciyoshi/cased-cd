#!/bin/bash
# Integration test: Helm chart validation
# Tests that Helm chart renders correctly for different configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_FAILURES=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "⎈ Helm Chart Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; TEST_FAILURES=$((TEST_FAILURES + 1)); }
info() { echo -e "${YELLOW}ℹ${NC} $1"; }
section() { echo -e "${BLUE}▸${NC} $1"; }

# Check if helm is installed
if ! command -v helm &> /dev/null; then
  echo -e "${RED}✗${NC} helm is not installed. Please install helm to run these tests."
  exit 1
fi

# Test 1: Chart linting
test_chart_lint() {
  section "Test 1: Helm chart linting"

  if helm lint "$SCRIPT_DIR" > /tmp/helm-lint.log 2>&1; then
    pass "Helm chart passes linting"
  else
    fail "Helm chart linting failed"
    cat /tmp/helm-lint.log
  fi

  echo ""
}

# Test 2: Standard deployment template
test_standard_template() {
  section "Test 2: Standard deployment template"

  if helm template test-standard "$SCRIPT_DIR" \
    > /tmp/helm-standard.yaml 2>&1; then
    pass "Standard template renders successfully"
  else
    fail "Standard template rendering failed"
    cat /tmp/helm-standard.yaml
    echo ""
    return
  fi

  # Community artifacts must not quietly reintroduce proprietary resources.
  if ! grep -Eqi 'enterprise|ghcr\.io/cased/' /tmp/helm-standard.yaml; then
    pass "Enterprise deployment not rendered in standard mode"
  else
    fail "Standard mode rendered an enterprise-owned resource or image"
  fi

  # Check that ENTERPRISE_BACKEND_SERVICE is NOT set
  if ! grep -q "ENTERPRISE_BACKEND_SERVICE" /tmp/helm-standard.yaml; then
    pass "ENTERPRISE_BACKEND_SERVICE not present in standard mode"
  else
    fail "ENTERPRISE_BACKEND_SERVICE should not be present in standard mode"
  fi

  # Check that ARGOCD_SERVER is set
  if grep -q "ARGOCD_SERVER" /tmp/helm-standard.yaml; then
    pass "ARGOCD_SERVER environment variable present"
  else
    fail "ARGOCD_SERVER environment variable missing"
  fi

  if grep -A1 'name: ARGOCD_INSECURE' /tmp/helm-standard.yaml | grep -q 'value: "false"'; then
    pass "TLS verification is enabled by default"
  else
    fail "Default deployment must set ARGOCD_INSECURE=false"
  fi

  if ! grep -q 'ARGOCD_CA_CERT_PATH' /tmp/helm-standard.yaml; then
    pass "Default deployment uses the image system trust store"
  else
    fail "Default deployment should not mount a custom CA"
  fi

  echo ""
}

# Test 3: Custom ArgoCD server configuration
test_custom_argocd_server() {
  section "Test 3: Custom ArgoCD server configuration"

  helm template test-custom "$SCRIPT_DIR" \
    --set argocd.server="http://custom-argocd.custom-ns.svc.cluster.local:8080" \
    > /tmp/helm-custom.yaml 2>&1

  if grep -q "http://custom-argocd.custom-ns.svc.cluster.local:8080" /tmp/helm-custom.yaml; then
    pass "Custom ArgoCD server URL applied"
  else
    fail "Custom ArgoCD server URL not applied"
  fi

  echo ""
}

# Test custom image, naming, Service, and ServiceAccount options together.
test_custom_workload_options() {
  section "Test 4: Workload and Service overrides"

  if helm template custom-release "$SCRIPT_DIR" \
    --set fullnameOverride=internal-cd \
    --set replicaCount=3 \
    --set image.repository=registry.example/cased-cd \
    --set image.tag=canary \
    --set image.pullPolicy=Always \
    --set service.type=LoadBalancer \
    --set service.port=8088 \
    --set service.targetPort=9090 \
    --set serviceAccount.create=false \
    --set serviceAccount.name=existing-cased-cd \
    > /tmp/helm-workload.yaml 2>&1; then
    pass "Workload and Service overrides render successfully"
  else
    fail "Workload and Service overrides failed to render"
    cat /tmp/helm-workload.yaml
    echo ""
    return
  fi

  if grep -q 'name: internal-cd' /tmp/helm-workload.yaml &&
     grep -q 'replicas: 3' /tmp/helm-workload.yaml &&
     grep -q 'image: registry.example/cased-cd:canary' /tmp/helm-workload.yaml &&
     grep -q 'imagePullPolicy: Always' /tmp/helm-workload.yaml; then
    pass "Naming, replicas, and image overrides reach the Deployment"
  else
    fail "Deployment overrides were not rendered correctly"
  fi

  if grep -q 'type: LoadBalancer' /tmp/helm-workload.yaml &&
     grep -q 'port: 8088' /tmp/helm-workload.yaml &&
     grep -q 'containerPort: 9090' /tmp/helm-workload.yaml; then
    pass "Service and target-port overrides are wired together"
  else
    fail "Service overrides were not rendered correctly"
  fi

  if grep -q 'serviceAccountName: existing-cased-cd' /tmp/helm-workload.yaml &&
     ! grep -q 'kind: ServiceAccount' /tmp/helm-workload.yaml; then
    pass "Existing ServiceAccount selection suppresses chart-owned creation"
  else
    fail "Existing ServiceAccount selection was not respected"
  fi

  echo ""
}

# Test 5: Argo CD upstream TLS modes
test_argocd_tls() {
  section "Test 5: Argo CD upstream TLS configuration"

  helm template test-tls "$SCRIPT_DIR" \
    --set argocd.insecure=true \
    --set argocd.tls.serverName="argocd.internal.example" \
    --set argocd.tls.caSecret.name="argocd-ca" \
    --set argocd.tls.caSecret.key="root.pem" \
    > /tmp/helm-tls.yaml 2>&1

  if grep -A1 'name: ARGOCD_INSECURE' /tmp/helm-tls.yaml | grep -q 'value: "true"'; then
    pass "Explicit insecure mode is passed to the container"
  else
    fail "argocd.insecure=true was not rendered"
  fi

  if grep -A1 'name: ARGOCD_TLS_SERVER_NAME' /tmp/helm-tls.yaml | grep -q 'value: "argocd.internal.example"'; then
    pass "TLS server-name override is passed to the container"
  else
    fail "TLS server-name override was not rendered"
  fi

  if grep -q 'secretName: "argocd-ca"' /tmp/helm-tls.yaml &&
     grep -q 'key: "root.pem"' /tmp/helm-tls.yaml &&
     grep -q 'mountPath: /etc/cased-cd/argocd-tls' /tmp/helm-tls.yaml; then
    pass "Configured CA Secret is mounted read-only"
  else
    fail "Configured CA Secret was not rendered correctly"
  fi

  echo ""
}

# Test 6: Resource limits and requests
test_resource_config() {
  section "Test 6: Resource configuration"

  helm template test-resources "$SCRIPT_DIR" \
    > /tmp/helm-resources.yaml 2>&1

  # Check resource limits are configured
  if grep -A5 "resources:" /tmp/helm-resources.yaml | grep -q "limits:"; then
    pass "Resource limits configured"
  else
    info "Resource limits not found (may be using defaults)"
  fi

  # Check resource requests are configured
  if grep -A5 "resources:" /tmp/helm-resources.yaml | grep -q "requests:"; then
    pass "Resource requests configured"
  else
    info "Resource requests not found (may be using defaults)"
  fi

  echo ""
}

# Test 7: Security context
test_security_context() {
  section "Test 7: Security context configuration"

  helm template test-security "$SCRIPT_DIR" \
    > /tmp/helm-security.yaml 2>&1

  # Check for non-root user
  if grep -q "runAsNonRoot: true" /tmp/helm-security.yaml; then
    pass "Non-root security context configured"
  else
    fail "Non-root security context missing"
  fi

  # Check for seccomp profile
  if grep -q "type: RuntimeDefault" /tmp/helm-security.yaml; then
    pass "Seccomp profile configured"
  else
    fail "Seccomp profile missing"
  fi

  # Check for dropped capabilities
  if grep -q "drop:" /tmp/helm-security.yaml && grep -q "ALL" /tmp/helm-security.yaml; then
    pass "All capabilities dropped"
  else
    fail "Capability dropping not configured"
  fi

  echo ""
}

# Test 8: Generic Ingress
test_generic_ingress() {
  section "Test 8: Generic Ingress configuration"

  if helm template test-generic "$SCRIPT_DIR" \
    --set ingress.enabled=true \
    --set ingress.controller=generic \
    --set ingress.className=nginx \
    --set ingress.hosts[0].host=cd.example.test \
    --set ingress.hosts[0].paths[0].path=/cased \
    --set ingress.hosts[0].paths[0].pathType=Prefix \
    --set ingress.tls[0].secretName=cased-cd-tls \
    --set ingress.tls[0].hosts[0]=cd.example.test \
    > /tmp/helm-generic.yaml 2>&1; then
    pass "Generic ingress template renders successfully"
  else
    fail "Generic ingress template rendering failed"
    cat /tmp/helm-generic.yaml
    echo ""
    return
  fi

  if grep -q 'ingressClassName: nginx' /tmp/helm-generic.yaml &&
     grep -q 'host: "cd.example.test"' /tmp/helm-generic.yaml &&
     grep -q 'path: /cased' /tmp/helm-generic.yaml &&
     grep -q 'secretName: cased-cd-tls' /tmp/helm-generic.yaml; then
    pass "Generic ingress class, host, path, and TLS options are rendered"
  else
    fail "Generic ingress options were not rendered correctly"
  fi

  if grep -q 'defaultBackend:' /tmp/helm-generic.yaml; then
    fail "Generic ingress must use rules rather than the Tailscale default backend"
  else
    pass "Generic ingress uses host rules"
  fi

  echo ""
}

# Test 9: Tailscale Ingress
test_tailscale_ingress() {
  section "Test 9: Tailscale Ingress configuration"

  if helm template test-tailscale "$SCRIPT_DIR" \
    --set ingress.enabled=true \
    --set ingress.controller=tailscale \
    --set ingress.tailscale.hostname=test-app \
    --set ingress.tailscale.proxyGroup=ingress-proxies \
    > /tmp/helm-tailscale.yaml 2>&1; then
    pass "Tailscale ingress template renders successfully"
  else
    fail "Tailscale ingress template rendering failed"
    cat /tmp/helm-tailscale.yaml
    echo ""
    return
  fi

  # Check that ingress is created
  if grep -q "kind: Ingress" /tmp/helm-tailscale.yaml; then
    pass "Tailscale ingress created"
  else
    fail "Tailscale ingress missing"
  fi

  # Check that ingressClassName is set to tailscale
  if grep -q "ingressClassName: tailscale" /tmp/helm-tailscale.yaml; then
    pass "Tailscale ingress class configured"
  else
    fail "Tailscale ingress class missing"
  fi

  # Check for tailscale.com/hostname annotation
  if grep -q "tailscale.com/hostname: test-app" /tmp/helm-tailscale.yaml; then
    pass "Tailscale hostname annotation configured"
  else
    fail "Tailscale hostname annotation missing"
  fi

  # Check for tailscale.com/proxy-group annotation
  if grep -q "tailscale.com/proxy-group: ingress-proxies" /tmp/helm-tailscale.yaml; then
    pass "Tailscale proxy-group annotation configured"
  else
    fail "Tailscale proxy-group annotation missing"
  fi

  # Check for defaultBackend instead of rules
  if grep -q "defaultBackend:" /tmp/helm-tailscale.yaml; then
    pass "Tailscale defaultBackend configured"
  else
    fail "Tailscale defaultBackend missing"
  fi

  # Check that rules are not present in Tailscale mode
  if grep -A1 "spec:" /tmp/helm-tailscale.yaml | grep -q "rules:"; then
    fail "Rules present in Tailscale mode (should use defaultBackend)"
  else
    pass "No rules in Tailscale mode (correct)"
  fi

  # Check TLS configuration with hostname
  if grep -A5 "tls:" /tmp/helm-tailscale.yaml | grep -q "test-app"; then
    pass "TLS configured with Tailscale hostname"
  else
    fail "TLS not configured correctly for Tailscale"
  fi

  echo ""
}

# Test 10: Published standalone manifest
test_install_manifest() {
  section "Test 10: Standalone install manifest"

  {
    echo "# Generated by scripts/generate-install-manifest.sh; do not edit manually."
    echo "# Regenerate with: pnpm generate:install"
    helm template cased-cd "$SCRIPT_DIR" --namespace argocd
  } > /tmp/helm-install.yaml

  if diff -u "$SCRIPT_DIR/../install.yaml" /tmp/helm-install.yaml; then
    pass "Standalone manifest matches the chart rendered for the documented argocd namespace"
  else
    fail "install.yaml is stale; run pnpm generate:install"
  fi

  if grep -q "image: ghcr.io/sciyoshi/cased-cd:" /tmp/helm-install.yaml &&
     ! grep -q "image: ghcr.io/cased/cased-cd:" /tmp/helm-install.yaml; then
    pass "Standalone manifest uses only the fork-owned standard image"
  else
    fail "Standalone manifest must use only ghcr.io/sciyoshi/cased-cd"
  fi

  if grep -Fq "kubectl apply -f https://raw.githubusercontent.com/sciyoshi/cased-cd/main/install.yaml -n argocd" \
      "$SCRIPT_DIR/../README.md"; then
    pass "README installs the standalone manifest into its rendered argocd namespace"
  else
    fail "README standalone install command must target the argocd namespace"
  fi

  echo ""
}

# Cleanup (invoked by trap).
# shellcheck disable=SC2329
cleanup() {
  rm -f /tmp/helm-*.yaml /tmp/helm-lint.log
}

trap cleanup EXIT

# Run tests
test_chart_lint
test_standard_template
test_custom_argocd_server
test_custom_workload_options
test_argocd_tls
test_resource_config
test_security_context
test_generic_ingress
test_tailscale_ingress
test_install_manifest

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $TEST_FAILURES -eq 0 ]; then
  echo -e "${GREEN}✓ All Helm chart tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ $TEST_FAILURES test(s) failed${NC}"
  exit 1
fi

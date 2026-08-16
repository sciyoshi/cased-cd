#!/bin/sh
set -e

proxy_tls_helper=${PROXY_TLS_HELPER:-/proxy-tls.sh}
nginx_template=${NGINX_TEMPLATE:-/etc/nginx/nginx.conf.template}
nginx_config=${NGINX_CONFIG:-/tmp/nginx.conf}
nginx_binary=${NGINX_BIN:-nginx}
resolv_conf=${RESOLV_CONF:-/etc/resolv.conf}
nginx_mime_types=${NGINX_MIME_TYPES:-/etc/nginx/mime.types}
nginx_log_dir=${NGINX_LOG_DIR:-/var/log/nginx}

validate_render_path() {
  case "$1" in
    /*) ;;
    *)
      echo "$2 must be an absolute path" >&2
      exit 1
      ;;
  esac
  case "$1" in
    *[!A-Za-z0-9_./-]*)
      echo "$2 contains unsupported characters" >&2
      exit 1
      ;;
  esac
}

validate_render_path "$nginx_mime_types" "NGINX_MIME_TYPES"
validate_render_path "$nginx_log_dir" "NGINX_LOG_DIR"

# Default ArgoCD server URL if not provided
# Uses HTTPS by default (ArgoCD's default configuration)
ARGOCD_SERVER=${ARGOCD_SERVER:-https://argocd-server.argocd.svc.cluster.local}
export ARGOCD_SERVER

# Resolve verification, trust, and SNI settings before rendering nginx. This
# fails closed for invalid or unreadable secure-mode configuration.
# The production path is configurable for artifact tests.
# shellcheck disable=SC1090
. "$proxy_tls_helper"
configure_proxy_tls

# Set proxy target to ArgoCD server
export PROXY_TARGET="$ARGOCD_SERVER"
echo "Proxying API requests to ArgoCD at: $PROXY_TARGET"
echo "ArgoCD TLS verification: $PROXY_SSL_VERIFY (server name: $PROXY_SSL_NAME)"

# Detect DNS resolver from /etc/resolv.conf
# In Kubernetes, this will be the cluster DNS (e.g., 10.96.0.10)
# In Docker, this will be 127.0.0.11 (Docker's embedded DNS)
DNS_RESOLVER=$(awk '/^nameserver/ {print $2; exit}' "$resolv_conf")
if [ -z "$DNS_RESOLVER" ]; then
  echo "No DNS resolver found in $resolv_conf" >&2
  exit 1
fi
case "$DNS_RESOLVER" in
  *[!A-Za-z0-9_.:%-]*)
    echo "DNS resolver contains unsupported characters" >&2
    exit 1
    ;;
esac
export DNS_RESOLVER
echo "Using DNS resolver: $DNS_RESOLVER"

# Render only the explicit deployment placeholders. Unlike envsubst, this
# preserves nginx runtime variables such as $uri and $proxy_target across GNU,
# BSD, and BusyBox environments.
escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

proxy_target_escaped=$(escape_sed_replacement "$PROXY_TARGET")
dns_resolver_escaped=$(escape_sed_replacement "$DNS_RESOLVER")
proxy_ssl_verify_escaped=$(escape_sed_replacement "$PROXY_SSL_VERIFY")
proxy_ssl_certificate_escaped=$(escape_sed_replacement "$PROXY_SSL_TRUSTED_CERTIFICATE")
proxy_ssl_name_escaped=$(escape_sed_replacement "$PROXY_SSL_NAME")
nginx_mime_types_escaped=$(escape_sed_replacement "$nginx_mime_types")
nginx_log_dir_escaped=$(escape_sed_replacement "$nginx_log_dir")

sed \
  -e "s|\${PROXY_TARGET}|$proxy_target_escaped|g" \
  -e "s|\${DNS_RESOLVER}|$dns_resolver_escaped|g" \
  -e "s|\${PROXY_SSL_VERIFY}|$proxy_ssl_verify_escaped|g" \
  -e "s|\${PROXY_SSL_TRUSTED_CERTIFICATE}|$proxy_ssl_certificate_escaped|g" \
  -e "s|\${PROXY_SSL_NAME}|$proxy_ssl_name_escaped|g" \
  -e "s|\${NGINX_MIME_TYPES}|$nginx_mime_types_escaped|g" \
  -e "s|\${NGINX_LOG_DIR}|$nginx_log_dir_escaped|g" \
  "$nginx_template" > "$nginx_config"

# Test nginx configuration
"$nginx_binary" -t -c "$nginx_config"

if [ "${CASED_CD_ENTRYPOINT_TEST_ONLY:-false}" = true ]; then
  echo "Entrypoint test completed without starting nginx."
  exit 0
fi

echo "Starting nginx..."
exec "$nginx_binary" -g 'daemon off;' -c "$nginx_config"

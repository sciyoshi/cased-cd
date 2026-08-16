#!/bin/sh
set -e

# Default ArgoCD server URL if not provided
# Uses HTTPS by default (ArgoCD's default configuration)
ARGOCD_SERVER=${ARGOCD_SERVER:-https://argocd-server.argocd.svc.cluster.local}
export ARGOCD_SERVER

# Resolve verification, trust, and SNI settings before rendering nginx. This
# fails closed for invalid or unreadable secure-mode configuration.
. /proxy-tls.sh
configure_proxy_tls

# Set proxy target to ArgoCD server
export PROXY_TARGET="$ARGOCD_SERVER"
echo "Proxying API requests to ArgoCD at: $PROXY_TARGET"
echo "ArgoCD TLS verification: $PROXY_SSL_VERIFY (server name: $PROXY_SSL_NAME)"

# Detect DNS resolver from /etc/resolv.conf
# In Kubernetes, this will be the cluster DNS (e.g., 10.96.0.10)
# In Docker, this will be 127.0.0.11 (Docker's embedded DNS)
export DNS_RESOLVER=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)
echo "Using DNS resolver: $DNS_RESOLVER"

# Replace environment variables in nginx config template
# Write to /tmp since /etc/nginx is not writable by non-root user
envsubst '${PROXY_TARGET} ${DNS_RESOLVER} ${PROXY_SSL_VERIFY} ${PROXY_SSL_TRUSTED_CERTIFICATE} ${PROXY_SSL_NAME}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

# Test nginx configuration
nginx -t -c /tmp/nginx.conf

echo "Starting nginx..."
exec nginx -g 'daemon off;' -c /tmp/nginx.conf

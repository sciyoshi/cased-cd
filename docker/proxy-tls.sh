#!/bin/sh

default_ca_certificate=/etc/ssl/certs/ca-certificates.crt

configure_proxy_tls() {
  case "${ARGOCD_INSECURE:-false}" in
    true)
      PROXY_SSL_VERIFY=off
      # nginx still loads the trust file while verification is disabled. Use
      # the image's guaranteed system bundle so insecure mode does not depend
      # on an optional custom Secret being present.
      PROXY_SSL_TRUSTED_CERTIFICATE="$default_ca_certificate"
      ;;
    false)
      PROXY_SSL_VERIFY=on
      PROXY_SSL_TRUSTED_CERTIFICATE="${ARGOCD_CA_CERT_PATH:-$default_ca_certificate}"
      ;;
    *)
      echo "ARGOCD_INSECURE must be 'true' or 'false'" >&2
      return 1
      ;;
  esac

  case "$PROXY_SSL_TRUSTED_CERTIFICATE" in
    /*) ;;
    *)
      echo "Argo CD CA certificate path must be absolute" >&2
      return 1
      ;;
  esac

  case "$PROXY_SSL_TRUSTED_CERTIFICATE" in
    *[!A-Za-z0-9_./-]*)
      echo "Argo CD CA certificate path contains unsupported characters" >&2
      return 1
      ;;
  esac

  if [ "$PROXY_SSL_VERIFY" = on ] && [ ! -r "$PROXY_SSL_TRUSTED_CERTIFICATE" ]; then
    echo "Argo CD CA certificate is not readable: $PROXY_SSL_TRUSTED_CERTIFICATE" >&2
    return 1
  fi

  case "$ARGOCD_SERVER" in
    http://*) upstream_authority=${ARGOCD_SERVER#http://} ;;
    https://*) upstream_authority=${ARGOCD_SERVER#https://} ;;
    *)
      echo "ARGOCD_SERVER must use an http:// or https:// URL" >&2
      return 1
      ;;
  esac
  upstream_authority=${upstream_authority%%/*}

  case "$upstream_authority" in
    \[*\]*)
      upstream_host=${upstream_authority#\[}
      upstream_host=${upstream_host%%\]*}
      ;;
    *) upstream_host=${upstream_authority%%:*} ;;
  esac

  PROXY_SSL_NAME=${ARGOCD_TLS_SERVER_NAME:-$upstream_host}
  case "$PROXY_SSL_NAME" in
    ""|*[!A-Za-z0-9._:-]*)
      echo "Argo CD TLS server name is empty or contains unsupported characters" >&2
      return 1
      ;;
  esac

  export PROXY_SSL_VERIFY PROXY_SSL_TRUSTED_CERTIFICATE PROXY_SSL_NAME
}

# Cased CD - Community Edition

**A modern, beautiful UI for ArgoCD**

Cased CD is a completely redesigned user interface for ArgoCD, built with modern web technologies for a superior user experience. It works seamlessly with your existing ArgoCD installation - no backend modifications required.

[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fsciyoshi%2Fcased--cd-blue)](https://github.com/sciyoshi/cased-cd/pkgs/container/cased-cd)
[![License: FSL-1.1](https://img.shields.io/badge/License-FSL--1.1-blue.svg)](LICENSE.md)

Built by [**Cased**](https://cased.com).

---

## Features

- **Modern UI/UX** - Clean, intuitive interface built with React and Tailwind CSS
- **Dark Mode** - Full dark mode support with automatic system detection
- **Real-time Updates** - Live sync status and resource health monitoring
- **Application Management** - Create, sync, refresh, rollback, and delete applications
- **Resource Visualization** - Tree view, network graph, list views, and pod views
- **Deployment History** - Track all deployments with easy rollback
- **Multi-cluster Support** - Manage applications across multiple Kubernetes clusters
- **Repository Management** - Connect Git repositories over SSH or HTTPS
- **Cluster Management** - Add and manage Kubernetes clusters
- **Project Management** - Organize applications into projects
- **No Backend Changes** - Works with standard ArgoCD API (v2.0+)

---

## Quick Start

### Prerequisites

- Kubernetes cluster (v1.19+)
- ArgoCD installed (v2.0+)
- Helm 3 (recommended) or kubectl

### Installation via Helm

```bash
# Add the Cased CD Helm repository
helm repo add cased https://raw.githubusercontent.com/sciyoshi/cased-cd/gh-pages
helm repo update

# Install in the same namespace as ArgoCD (usually 'argocd')
helm install cased-cd cased/cased-cd --namespace argocd

# Get the service URL
kubectl get svc cased-cd -n argocd
```

### Installation via kubectl

```bash
# Apply the manifest
kubectl apply -f https://raw.githubusercontent.com/sciyoshi/cased-cd/main/install.yaml -n argocd

# Access via port-forward
kubectl port-forward svc/cased-cd 8080:80 -n argocd
```

Then open http://localhost:8080 and log in with your ArgoCD credentials.

---

## Configuration

### Custom ArgoCD Server

If ArgoCD is in a different namespace or has a custom name:

```yaml
# values.yaml
argocd:
  server: "https://my-argocd-server.custom-namespace.svc.cluster.local"
  insecure: false
```

TLS certificates are verified by default against the image's system trust
store. For an Argo CD server that uses a private CA or a self-signed
certificate, create a Secret in the Cased CD namespace containing the CA (or
the self-signed server certificate) in PEM format:

```bash
kubectl create secret generic cased-cd-argocd-ca \
  --from-file=ca.crt=/path/to/argocd-ca.pem \
  --namespace argocd
```

Then mount that trust anchor and, if the hostname in `argocd.server` differs
from the certificate's DNS name, set the name used for SNI and hostname
verification:

```yaml
argocd:
  server: "https://argocd-server.argocd.svc.cluster.local"
  insecure: false
  tls:
    serverName: "argocd.internal.example"
    caSecret:
      name: "cased-cd-argocd-ca"
      key: "ca.crt"
```

The `serverName` must match a Subject Alternative Name on the certificate.
Setting `argocd.insecure: true` disables both certificate-chain and hostname
verification and should be limited to temporary, non-production use.

### Single sign-on

Cased CD delegates SSO to Argo CD rather than handling Google or other OIDC
credentials itself. Configure Dex or `oidc.config` in Argo CD as usual, and set
Argo CD's external `url` to the origin that serves Cased CD. Register that
origin's `/auth/callback` URL for direct OIDC, or `/api/dex/callback` when using
Dex, with the identity provider.

```yaml
# argocd-cm
data:
  url: "https://cased-cd.example.com"
  oidc.config: |
    name: Google
    issuer: https://accounts.google.com
    clientID: $oidc.google.clientID
    clientSecret: $oidc.google.clientSecret
```

The client secret remains in Argo CD's Kubernetes Secret; it is never included
in the Cased CD frontend. The production nginx server and `pnpm dev:real`
proxy Argo CD's `/auth`, `/api/dex`, and `/api/v1` routes on the same browser
origin. For local SSO testing, add the Vite origin (normally
`http://localhost:5173`) to Argo CD's `additionalUrls` and register the matching
callback URL with the provider. Set `admin.enabled: "false"` in `argocd-cm` for
an SSO-only login screen.

### Ingress

```yaml
# values.yaml
ingress:
  enabled: true
  className: "nginx"
  hosts:
    - host: cased-cd.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: cased-cd-tls
      hosts:
        - cased-cd.example.com
```

### Network policy

Set `networkPolicy.enabled: true` to isolate inbound traffic to the Cased CD
pods. The rendered policy accepts TCP traffic only on the workload's named
`http` port, which covers the Service and either generic or Tailscale ingress.
The chart policy does not select the pods for egress, so it does not add or
replace egress rules. If another policy isolates egress, it must permit DNS,
the configured `argocd.server`, and any SSO upstreams.

```yaml
networkPolicy:
  enabled: true
```

The policy does not restrict which namespaces or pods may access the HTTP port.
Combine it with cluster-level controls if source-specific isolation is required.
A Kubernetes network-policy-capable CNI is required for enforcement.

### Autoscaling

Enable the Horizontal Pod Autoscaler to scale the Cased CD Deployment from
resource utilization. The chart uses `autoscaling/v2`, removes the fixed
Deployment replica count, and supports CPU and memory utilization targets:

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

The Kubernetes resource metrics API (normally Metrics Server) must be available.
The configured CPU and memory requests provide the denominator for utilization;
set either target to `null` to omit that metric. At least one target is required.

---

## Enterprise Edition

Upgrade to **Cased CD Enterprise** for advanced features:

- **RBAC Management** - Fine-grained per-application permissions
- **User Management** - Create and delete users from the UI
- **Audit Trail** - Comprehensive logging with persistent storage
- **Notifications** - Slack, Webhook, Email, and GitHub integrations
- **Advanced Permissions** - Granular control over sync, rollback, delete

[**Learn more**](https://cased.com) about Enterprise features.

---

## Development

Node.js 20 or newer is required. Install dependencies, then start the mock API
and frontend in separate terminals:

```bash
# Clone the repository
git clone https://github.com/sciyoshi/cased-cd.git
cd cased-cd

# Enable the package manager pinned in package.json and install dependencies
corepack enable
pnpm install --frozen-lockfile

# Terminal 1: mock Argo CD API on http://localhost:3000
pnpm dev:mock

# Terminal 2: frontend on http://localhost:5173
pnpm dev
```

Open http://localhost:5173 and log in with `admin` / `demo`. As an alternative,
`./scripts/dev-start.sh` starts the same pair and prints their log locations.

Development helper servers bind to `127.0.0.1` and grant CORS only to the local
Vite origins by default. Use `DEV_SERVER_HOST` and the comma-separated
`DEV_SERVER_ALLOWED_ORIGINS` only when an explicit non-local development setup
requires it. Generic notification test webhooks are disabled until their exact
HTTPS hostnames are listed in `MOCK_WEBHOOK_ALLOWED_HOSTS`; Slack tests accept
only official Slack incoming-webhook hosts. Webhook URL paths are always
redacted from helper logs.

To develop against a real Argo CD proxy listening on `http://localhost:8090`:

```bash
pnpm dev:real
```

Build the production frontend with:

```bash
pnpm build

# Build Docker image
docker build --target standard -t cased-cd:latest .
```

---

## Documentation

- **Installation Guide**: See [Quick Start](#quick-start) above
- **Troubleshooting**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Changelog**: See [Releases](https://github.com/sciyoshi/cased-cd/releases)
- **Bundle performance**: See [docs/bundle-performance.md](docs/bundle-performance.md)

---

## Security

- **Non-root Containers** - Runs as user 101 (nginx)
- **Read-only Filesystem** - Minimal write permissions
- **Security Headers** - Production CSP permits only same-origin scripts and API connections; HSTS, framing restrictions, and related headers are enabled.
- **Same-origin API** - nginx strips upstream CORS headers, so browser clients use the UI origin rather than exposing bearer-authenticated responses cross-origin.
- **Tab-scoped Local Login** - Username/password login tokens are kept in `sessionStorage`; legacy `localStorage` tokens are migrated and deleted on first use. The token remains readable by JavaScript while that tab is open, so Argo CD SSO with its HttpOnly cookie is preferred for production deployments.
- **Rate Limiting** - Protection against brute force
- **No Server-side Data Storage** - Application data comes from the ArgoCD API.

Report security vulnerabilities to security@cased.com.

---

## License

Licensed under the **Functional Source License 1.1** (FSL-1.1).

See [LICENSE.md](LICENSE.md) for full details.

---

## Support & Community

- **GitHub Issues**: [Report bugs or request features](https://github.com/sciyoshi/cased-cd/issues)
- **Email**: support@cased.com
- **Website**: [cased.com](https://cased.com)

---

## Acknowledgments

Built on top of:
- [ArgoCD](https://argo-cd.readthedocs.io/) - GitOps continuous delivery for Kubernetes
- [React](https://react.dev/) - UI framework
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [TanStack Router & Query](https://tanstack.com/) - Routing and data fetching
- [Radix UI](https://www.radix-ui.com/) - Accessible components

---

**Made by [Cased](https://cased.com)**

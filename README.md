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
- **Repository Management** - Connect Git repositories (SSH, HTTPS, GitHub OAuth)
- **Cluster Management** - Add and manage Kubernetes clusters
- **Project Management** - Organize applications into projects
- **Account Viewing** - View ArgoCD accounts and their status
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
helm repo add cased https://sciyoshi.github.io/cased-cd
helm repo update

# Install in the same namespace as ArgoCD (usually 'argocd')
helm install cased-cd cased/cased-cd --namespace argocd

# Get the service URL
kubectl get svc cased-cd -n argocd
```

### Installation via kubectl

```bash
# Apply the manifest
kubectl apply -f https://sciyoshi.github.io/cased-cd/install.yaml -n argocd

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
  insecure: false  # Set to true for self-signed certificates
```

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
in the Cased CD frontend. The production nginx server and `npm run dev:real`
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

```bash
# Clone the repository
git clone https://github.com/sciyoshi/cased-cd.git
cd cased-cd

# Install dependencies
npm install

# Start development server (with real ArgoCD)
VITE_USE_REAL_API=true npm run dev

# Build for production
npm run build

# Build Docker image
docker build --target standard -t cased-cd:latest .
```

---

## Documentation

- **Installation Guide**: See [Installation](#-quick-start) above
- **Troubleshooting**: See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md) (coming soon)
- **Changelog**: See [Releases](https://github.com/sciyoshi/cased-cd/releases)

---

## Security

- **Non-root Containers** - Runs as user 101 (nginx)
- **Read-only Filesystem** - Minimal write permissions
- **Security Headers** - CSP, HSTS, X-Frame-Options, etc.
- **Rate Limiting** - Protection against brute force
- **No Data Storage** - All data comes from ArgoCD API

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

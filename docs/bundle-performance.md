# Bundle performance

The production UI uses TanStack Router's automatic route splitting. Route components,
the application creation form, resource YAML viewer/editor, and sync progress sheet are
loaded only when a user navigates to or opens those features. TanStack Router Devtools
are imported only in development.

## Budget

`pnpm build` creates Vite's manifest and runs `scripts/check-bundle-budget.mjs`. The
checker follows the entry chunk's static import graph and enforces these initial
JavaScript limits:

- 450 KiB uncompressed
- 150 KiB gzip

It also verifies representative route chunks, feature chunks, and the absence of Router
Devtools in production output. CSS and lazy chunks are reported by Vite but are not part
of the initial JavaScript budget.

## Baseline and result

Measured with the production build on August 16, 2026:

| Build | Initial JavaScript | Gzip |
| --- | ---: | ---: |
| Before route splitting | 2,489.3 KiB | 588.1 KiB |
| After route and feature splitting | 389.1 KiB | 126.3 KiB |

The largest deferred feature chunks are the resource tree (176.6 KiB raw / 57.3 KiB
gzip), application diff (120.7 KiB / 41.0 KiB), and resource details with syntax
highlighting (63.1 KiB / 21.2 KiB). They no longer delay the login or initial shell.

Run `pnpm bundle:check` after an existing build to inspect the current totals without
rebuilding.

# Repository guidance

## Scope and intent

- This repository is a public, non-commercial fork used internally by a company.
- It is not a competing hosted product or service.
- Use plain Git in this repository, not GitButler. Work directly on `main` unless the user asks for a branch.
- Preserve unrelated user changes and keep commits focused.

## Local development

- Use Node.js and npm. Do not require Docker or Podman for local development or QA.
- Install dependencies with `npm install`.
- The real Argo CD proxy is expected at `http://localhost:8090`.
- Start the frontend against that proxy with:

  ```bash
  npm run dev:real
  ```

- For mock development, run `npm run dev:mock` and `npm run dev` in separate terminals.
- Vite proxies relative `/api/v1` requests. Keep application API calls relative rather than embedding an Argo CD host in frontend code.

## Project structure and conventions

- The frontend is React, TypeScript, Vite, TanStack Router, TanStack Query, and Tailwind CSS.
- Route components live in `src/routes`; shared UI lives in `src/components`.
- Argo CD API access belongs in `src/services`, with shared API shapes in `src/types/api.ts`.
- Prefer existing components in `src/components/ui` and existing icon libraries over introducing new UI dependencies.
- Keep tests colocated as `*.test.ts` or `*.test.tsx`. Use Testing Library for user-visible behavior.
- Do not edit generated TanStack Router output manually.
- Preserve both card and table application views and ensure application search, cluster, namespace, and state filters behave consistently in both.
- The welcome modal and its external data submission were intentionally removed; do not restore them.

## Validation

Run the checks relevant to every change. Before committing a normal frontend change, run:

```bash
npm run type-check
npm run lint
npm run test:run
npm run build
git diff --check
```

- Use `agent-browser` for browser QA when changing user-visible behavior.
- Test responsive behavior for application cards and tables, including horizontal overflow at narrow widths.
- Existing Obra icon warnings about SVG DOM property names are upstream warnings; do not confuse them with regressions from unrelated work.
- Docker, nginx, and Helm integration tests are optional unless the task specifically changes those areas and the required tools are available.

## Licensing and publishing

- The project remains licensed under `FSL-1.1-Apache-2.0`; do not remove or replace `LICENSE.md` or Cased copyright notices.
- The license changes to Apache 2.0 on October 29, 2027. Until then, do not turn this fork into a competing commercial product or service.
- Public redistribution must include a copy of or link to the FSL terms and preserve copyright notices.
- The standard image is published from this fork as `ghcr.io/sciyoshi/cased-cd` by `.github/workflows/docker-publish.yml`.
- A push to `main` or a manual workflow dispatch builds `linux/amd64` and `linux/arm64` images. Do not create release tags unless the user explicitly requests a release.
- Keep fork-owned image, chart, documentation, and release URLs under the `sciyoshi` namespace. Leave proprietary Cased enterprise-image references unchanged.

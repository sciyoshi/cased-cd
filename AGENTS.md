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

- For mock development, run `npm run dev:mock` and `npm run dev` in separate terminals. The mock API listens at `http://localhost:3000`, Vite serves the UI at `http://localhost:5173`, and the mock login is `admin` / `demo`.
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

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->

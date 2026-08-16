// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))
const read = (filePath: string) => readFileSync(path.join(repositoryRoot, filePath), 'utf8')

describe('package manager configuration', () => {
  it('pins pnpm and keeps it as the sole JavaScript lockfile', () => {
    const packageJson = JSON.parse(read('package.json'))

    expect(packageJson.packageManager).toBe('pnpm@11.19.0')
    expect(packageJson.engines.node).toBe('>=22.13')
    const pnpmConfig = read('pnpm-workspace.yaml')
    expect(pnpmConfig).toContain("'@tailwindcss/oxide': true")
    expect(pnpmConfig).toContain('esbuild: true')
    expect(existsSync(path.join(repositoryRoot, 'pnpm-lock.yaml'))).toBe(true)
    expect(existsSync(path.join(repositoryRoot, 'package-lock.json'))).toBe(false)
    expect(existsSync(path.join(repositoryRoot, 'bun.lockb'))).toBe(false)
  })

  it('uses frozen pnpm installs in CI and the production image', () => {
    const workflow = read('.github/workflows/ci.yml')
    const dockerfile = read('Dockerfile')

    expect(workflow).toContain('uses: pnpm/action-setup@v4')
    expect(workflow).toContain("cache: 'pnpm'")
    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow).toContain("node-version: '24'")
    expect(workflow).not.toContain("node-version: '20'")
    expect(dockerfile).toContain('FROM node:24-alpine AS frontend-builder')
    expect(dockerfile).toContain('COPY package.json pnpm-lock.yaml ./')
    expect(dockerfile).toContain('corepack enable && pnpm install --frozen-lockfile')
  })
})

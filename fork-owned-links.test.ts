// @vitest-environment node

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))
const read = (filePath: string) => readFileSync(path.join(repositoryRoot, filePath), 'utf8')

const publicDistributionFiles = [
  '.github/workflows/docker-publish.yml',
  '.github/workflows/helm-publish.yml',
  '.github/workflows/release.yml',
  'README.md',
  'TROUBLESHOOTING.md',
  'chart/Chart.yaml',
  'chart/templates/NOTES.txt',
  'chart/values.yaml',
  'cli/go.mod',
  'cli/main.go',
  'public/security.txt',
  'scripts/build-standard.sh',
  'scripts/release.sh',
  'src/pages/help.tsx',
]

const forbiddenDistributionReferences = [
  'github.com/cased/cased-cd',
  'cased.github.io/cased-cd',
  'ghcr.io/cased/cased-cd',
  'sciyoshi.github.io/cased-cd',
]

function markdownLinks(markdown: string) {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target)
}

function githubHeadingAnchor(heading: string) {
  return heading
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

describe('fork-owned links and documentation', () => {
  it.each(publicDistributionFiles)('does not publish upstream fork URLs in %s', filePath => {
    const content = read(filePath)

    for (const forbiddenReference of forbiddenDistributionReferences) {
      expect(content).not.toContain(forbiddenReference)
    }
  })

  it('publishes canonical fork destinations while preserving enterprise ownership', () => {
    expect(read('public/security.txt')).toContain(
      'Canonical: https://raw.githubusercontent.com/sciyoshi/cased-cd/main/public/security.txt',
    )
    expect(read('src/pages/help.tsx')).toContain(
      "href: 'https://github.com/sciyoshi/cased-cd'",
    )
    expect(read('cli/go.mod')).toContain('module github.com/sciyoshi/cased-cd/cli')
    expect(read('.github/workflows/helm-publish.yml')).toContain(
      'https://raw.githubusercontent.com/sciyoshi/cased-cd/gh-pages',
    )
    expect(read('.github/workflows/release.yml')).not.toContain('cased-cd-chart')
    expect(read('scripts/build-enterprise.sh')).toContain('ghcr.io/cased')
    expect(read('README.md')).toContain(
      'https://raw.githubusercontent.com/sciyoshi/cased-cd/main/install.yaml',
    )
    expect(read('README.md')).toContain('https://cased.com')
  })

  it('does not advertise unsupported GitHub OAuth or a missing contributor guide', () => {
    const readme = read('README.md')

    expect(readme).not.toMatch(/GitHub OAuth/i)
    expect(readme).not.toContain('(CONTRIBUTING.md)')
  })

  it.each(['README.md', 'TROUBLESHOOTING.md'])('resolves local Markdown links in %s', filePath => {
    const markdown = read(filePath)
    const headingAnchors = new Set(
      [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) => githubHeadingAnchor(heading)),
    )

    for (const target of markdownLinks(markdown)) {
      if (/^(?:https?:|mailto:)/.test(target)) continue

      if (target.startsWith('#')) {
        expect(headingAnchors, `missing heading ${target} in ${filePath}`).toContain(target.slice(1))
        continue
      }

      const [relativePath] = target.split('#')
      expect(
        existsSync(path.resolve(repositoryRoot, path.dirname(filePath), relativePath)),
        `missing local link ${target} in ${filePath}`,
      ).toBe(true)
    }
  })
})

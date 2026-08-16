// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))
const read = (filePath: string) => readFileSync(path.join(repositoryRoot, filePath), 'utf8')

describe('mock development configuration', () => {
  it('uses port 3000 consistently in the package command, server, and Vite proxy', () => {
    const packageJson = JSON.parse(read('package.json'))

    expect(packageJson.scripts['dev:mock']).toBe('node mock-server.js')
    expect(read('mock-server.js')).toContain('process.env.PORT || 3000')
    expect(read('vite.config.ts')).toContain("'http://localhost:3000'")
  })

  it('keeps the start and stop helpers aligned with the mock runtime', () => {
    const startScript = read('scripts/dev-start.sh')
    const stopScript = read('scripts/dev-stop.sh')

    expect(startScript).toContain('http://localhost:3000/api/v1/settings')
    expect(startScript).toContain('Mock login: admin / demo')
    expect(startScript).not.toContain('localhost:8080/api/v1')
    expect(stopScript).toContain('mock server (port 3000)')
  })

  it.each(['AGENTS.md', 'CLAUDE.md', 'README.md'])(
    'documents the commands, ports, and credentials in %s',
    filePath => {
      const documentation = read(filePath)

      expect(documentation).toContain('npm run dev:mock')
      expect(documentation).toContain('npm run dev')
      expect(documentation).toContain('http://localhost:3000')
      expect(documentation).toContain('http://localhost:5173')
      expect(documentation).toContain('admin` / `demo')
    },
  )
})

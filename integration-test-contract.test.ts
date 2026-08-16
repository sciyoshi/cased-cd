// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))
const read = (filePath: string) => readFileSync(path.join(repositoryRoot, filePath), 'utf8')

describe('integration test contract', () => {
  it('keeps real Argo CD tests explicit and separate from unit tests', () => {
    const packageJson = JSON.parse(read('package.json'))
    const scripts = packageJson.scripts as Record<string, string>
    const integrationTest = read('src/test/integration/sync.test.tsx')

    expect(scripts['test:run']).toContain('exclude src/test/integration/**')
    expect(scripts['test:integration:argocd']).toContain('src/test/integration')
    expect(scripts['test:integration']).toContain('test:integration:argocd')
    expect(integrationTest).toContain('describe.skip')
    expect(integrationTest).toContain('ARGOCD_INTEGRATION_REQUIRED')
    expect(integrationTest).toContain('ARGOCD_AUTH_TOKEN')
    expect(integrationTest).not.toContain('getStoredAuthToken')
    expect(integrationTest).not.toContain('Skipping integration test')
  })

  it('requires an authenticated ephemeral Argo CD fixture in CI', () => {
    const workflow = read('.github/workflows/ci.yml')

    expect(workflow).toContain('argocd-integration-tests:')
    expect(workflow).toContain('uses: nolar/setup-k3d-k3s@v1')
    expect(workflow).toContain('argocd-initial-admin-secret')
    expect(workflow).toContain("ARGOCD_INTEGRATION_REQUIRED: 'true'")
    expect(workflow).toContain('pnpm test:integration:argocd')
  })

  it('runs production deployment artifacts instead of copied routing logic', () => {
    const nginxTest = read('docker/test-entrypoint.sh')
    const chartTest = read('chart/test-chart.sh')

    expect(nginxTest).toContain('sh "$SCRIPT_DIR/entrypoint.sh"')
    expect(nginxTest).toContain('REQUIRE_NGINX_SYNTAX')
    expect(nginxTest).not.toContain('ENTERPRISE_BACKEND_SERVICE')
    expect(chartTest).not.toContain(
      '! grep -q "kind: Deployment" /tmp/helm-standard.yaml | grep -q "enterprise"',
    )
  })
})

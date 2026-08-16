import axios from 'axios'
import { describe, expect, it } from 'vitest'

const apiUrl = process.env.ARGOCD_API_URL?.replace(/\/$/, '') ?? ''
const authToken = process.env.ARGOCD_AUTH_TOKEN ?? ''
const testApplication = process.env.ARGOCD_TEST_APPLICATION ?? 'guestbook'
const integrationRequired = process.env.ARGOCD_INTEGRATION_REQUIRED === 'true'
const missingConfiguration = [
  !apiUrl && 'ARGOCD_API_URL',
  !authToken && 'ARGOCD_AUTH_TOKEN',
].filter(Boolean) as string[]

if (integrationRequired && missingConfiguration.length > 0) {
  throw new Error(
    `Real Argo CD integration was required, but ${missingConfiguration.join(' and ')} `
    + 'were not configured.',
  )
}

const describeRealArgo = missingConfiguration.length > 0 ? describe.skip : describe

describeRealArgo('real Argo CD sync integration', () => {
  const client = axios.create({
    baseURL: apiUrl,
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30_000,
  })

  it('syncs the configured fixture application through the real API', async () => {
    const response = await client.post(
      `/applications/${encodeURIComponent(testApplication)}/sync`,
      {
        prune: true,
        dryRun: false,
        strategy: { hook: {} },
      },
    )

    expect(response.status).toBe(200)
    expect(response.data?.metadata?.name).toBe(testApplication)
  }, 30_000)

  it('returns an API error when syncing an application that does not exist', async () => {
    try {
      await client.post('/applications/cased-cd-integration-does-not-exist/sync', {
        prune: true,
        dryRun: false,
        strategy: { hook: {} },
      })
      throw new Error('Argo CD unexpectedly accepted a sync for a missing application')
    } catch (error) {
      if (!axios.isAxiosError(error) || !error.response) {
        throw error
      }
      expect(error.response.status).toBeGreaterThanOrEqual(400)
      expect(error.response.status).toBeLessThan(500)
    }
  }, 30_000)
})

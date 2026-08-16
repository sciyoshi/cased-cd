// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createRestrictedCorsOptions,
  getDevServerHost,
  postJsonToAllowedTarget,
  redactUrl,
  validateOutboundUrl,
} from './dev-server-security.js'

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url))
const read = filePath => readFileSync(path.join(repositoryRoot, filePath), 'utf8')
const publicLookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])

function corsDecision(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, decision) => {
      if (error) reject(error)
      else resolve(decision)
    })
  })
}

describe('development helper network boundaries', () => {
  it('binds to loopback unless an operator explicitly overrides it', () => {
    expect(getDevServerHost({})).toBe('127.0.0.1')
    expect(getDevServerHost({ DEV_SERVER_HOST: '0.0.0.0' })).toBe('0.0.0.0')

    expect(read('mock-server.js')).toContain('app.listen(PORT, DEV_SERVER_HOST')
    expect(read('kubectl-proxy.js')).toContain('app.listen(PORT, DEV_SERVER_HOST')
  })

  it('grants CORS only to configured local development origins', async () => {
    const options = createRestrictedCorsOptions({})

    expect(await corsDecision(options, 'http://localhost:5173')).toBe(
      'http://localhost:5173',
    )
    expect(await corsDecision(options, 'https://attacker.example')).toBe(false)
    expect(await corsDecision(options, undefined)).toBe(false)
  })

  it.each([
    'http://webhooks.example.test/hook',
    'https://user:secret@webhooks.example.test/hook',
    'https://webhooks.example.test:8443/hook',
    'https://unlisted.example.test/hook',
  ])('rejects unsafe outbound target %s', async rawUrl => {
    await expect(
      validateOutboundUrl(rawUrl, {
        allowedHosts: new Set(['webhooks.example.test']),
        lookup: publicLookup,
      }),
    ).rejects.toThrow()
  })

  it.each([
    'https://127.0.0.1/hook',
    'https://10.0.0.5/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/hook',
  ])(
    'blocks SSRF to non-public target %s even when allowlisted',
    async rawUrl => {
      const hostname = new URL(rawUrl).hostname.replace(/^\[|\]$/g, '')
      await expect(
        validateOutboundUrl(rawUrl, {
          allowedHosts: new Set([hostname]),
          lookup: publicLookup,
        }),
      ).rejects.toThrow()
    },
  )

  it('rejects DNS answers containing a private rebinding target', async () => {
    await expect(
      validateOutboundUrl('https://webhooks.example.test/hook', {
        allowedHosts: new Set(['webhooks.example.test']),
        lookup: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      }),
    ).rejects.toThrow('non-public')
  })

  it('uses a timeout, refuses redirects, and never logs URL secrets', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }))
    await postJsonToAllowedTarget(
      'https://webhooks.example.test/super-secret-token',
      { test: true },
      { allowedHosts: new Set(['webhooks.example.test']) },
      { fetchImpl, lookup: publicLookup, timeoutMs: 25 },
    )

    const [, request] = fetchImpl.mock.calls[0]
    expect(request.redirect).toBe('manual')
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(redactUrl('https://webhooks.example.test/super-secret-token')).toBe(
      'https://webhooks.example.test/[redacted]',
    )
  })

  it('bounds DNS validation with the outbound request timeout', async () => {
    await expect(
      postJsonToAllowedTarget(
        'https://webhooks.example.test/hook',
        {},
        { allowedHosts: new Set(['webhooks.example.test']) },
        {
          lookup: () => new Promise(() => {}),
          timeoutMs: 1,
        },
      ),
    ).rejects.toThrow('timed out')
  })

  it('wires outbound test endpoints through the validated request helper', () => {
    const source = read('mock-server.js')

    expect(source.match(/postJsonToAllowedTarget\(/g)).toHaveLength(2)
    expect(source).not.toMatch(/fetch\(webhookUrl/)
    expect(source).not.toMatch(/fetch\(url/)
    expect(source).not.toContain('Webhook URL:')
    expect(source).not.toContain('JSON.stringify(req.body')
  })
})

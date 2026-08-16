import { describe, expect, it } from 'vitest'
import { parseProjectDestinations } from './project-destinations'

describe('parseProjectDestinations', () => {
  it('preserves HTTP(S) server URLs with ports and paths', () => {
    expect(parseProjectDestinations(
      'server=https://api.example.com:6443/clusters/production | namespace=staging',
    )).toEqual({
      ok: true,
      destinations: [{
        server: 'https://api.example.com:6443/clusters/production',
        namespace: 'staging',
      }],
    })
  })

  it('parses named clusters independently from namespaces', () => {
    expect(parseProjectDestinations([
      'name=in-cluster | namespace=default',
      'name=production/eu-west | namespace=team-*',
    ].join('\n'))).toEqual({
      ok: true,
      destinations: [
        { name: 'in-cluster', namespace: 'default' },
        { name: 'production/eu-west', namespace: 'team-*' },
      ],
    })
  })

  it.each([
    ['in-cluster/default', 'Line 1'],
    ['server=https:// | namespace=default', 'valid HTTP(S) URL'],
    ['server=ftp://api.example.com | namespace=default', 'valid HTTP(S) URL'],
    ['server=https://api.example.com | name=in-cluster', 'Line 1'],
    ['name=in-cluster | namespace=', 'Line 1'],
  ])('rejects malformed or ambiguous input %s', (input, expectedError) => {
    const result = parseProjectDestinations(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain(expectedError)
    }
  })

  it('returns no restrictions for blank input so the form can apply its wildcard default', () => {
    expect(parseProjectDestinations('  \n')).toEqual({ ok: true, destinations: [] })
  })
})

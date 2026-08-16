import { describe, expect, it } from 'vitest'
import yaml from 'js-yaml'

describe('YAML dependency compatibility', () => {
  it('round-trips Kubernetes manifests without changing scalar types', () => {
    const manifest = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'frontend', namespace: 'argocd' },
      spec: { replicas: 2, paused: false },
    }

    const serialized = yaml.dump(manifest, { indent: 2, lineWidth: -1 })

    expect(yaml.load(serialized, { schema: yaml.JSON_SCHEMA })).toEqual(manifest)
  })

  it('treats prototype-like YAML keys as data without polluting objects', () => {
    const parsed = yaml.load(
      `resource:\n  __proto__:\n    compromised: true\n  constructor:\n    prototype:\n      compromised: true\n`,
      { schema: yaml.JSON_SCHEMA },
    ) as { resource: Record<string, unknown> }

    expect(Object.keys(parsed.resource)).toContain('__proto__')
    expect(Object.getPrototypeOf(parsed.resource)).toBe(Object.prototype)
    expect(({} as { compromised?: boolean }).compromised).toBeUndefined()
  })
})

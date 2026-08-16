import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const template = readFileSync(
  resolve(process.cwd(), 'docker/nginx.conf.template'),
  'utf8',
)

function getCspDirectives(): Map<string, string[]> {
  const policy = template.match(/add_header Content-Security-Policy "([^"]+)" always;/)?.[1]
  if (!policy) throw new Error('nginx must define a Content-Security-Policy header')

  return new Map(policy.split(';').map((directive) => {
    const [name, ...values] = directive.trim().split(/\s+/)
    return [name, values]
  }).filter(([name]) => name))
}

describe('production nginx browser security policy', () => {
  it('allows only external same-origin scripts', () => {
    const directives = getCspDirectives()

    expect(directives.get('script-src')).toEqual(["'self'"])
    expect(directives.get('script-src-attr')).toEqual(["'none'"])
    expect(template).not.toContain("script-src 'self' 'unsafe-inline'")
    expect(template).not.toContain("'unsafe-eval'")
  })

  it('limits browser connections to this origin and removes obsolete telemetry', () => {
    const directives = getCspDirectives()

    expect(directives.get('connect-src')).toEqual(["'self'"])
    expect(template).not.toContain('api.cased.com')
  })

  it('does not expose the API through CORS', () => {
    expect(template).not.toMatch(/add_header ['"]Access-Control-Allow-/)
    expect(template).not.toContain("Access-Control-Allow-Origin' '*")
    expect(template).toContain('proxy_hide_header Access-Control-Allow-Origin;')
    expect(template).toContain('proxy_hide_header Access-Control-Allow-Credentials;')
  })

  it('does not shadow security headers in document or asset locations', () => {
    const locationHeaders = template.split('\n').filter((line) =>
      /^\s{12,}add_header\b/.test(line),
    )

    expect(locationHeaders).toEqual([])
    expect(template).toContain('/index.html "no-cache, no-store, must-revalidate";')
    expect(template).toContain('add_header Cache-Control $cache_control always;')
  })

  it('blocks plugin objects, child frames, embedding, and base-tag injection', () => {
    const directives = getCspDirectives()

    expect(directives.get('object-src')).toEqual(["'none'"])
    expect(directives.get('frame-src')).toEqual(["'none'"])
    expect(directives.get('frame-ancestors')).toEqual(["'none'"])
    expect(directives.get('base-uri')).toEqual(["'none'"])
  })
})

// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createArgoCDProxyConfig } from './vite.config'

describe('Argo CD development proxy', () => {
  it.each([
    'http://localhost:3000',
    'http://localhost:8090',
  ])('routes API, Dex, login, callback, and logout traffic to %s', (target) => {
    const proxy = createArgoCDProxyConfig(target)

    expect(proxy['/api/v1']).toMatchObject({ target, changeOrigin: true })
    expect(proxy['/api/dex']).toMatchObject({ target, changeOrigin: false })
    expect(proxy['/auth']).toMatchObject({ target, changeOrigin: false })
  })
})

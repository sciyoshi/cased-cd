// @vitest-environment node

import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { routeTree } from './src/routeTree.gen'

const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
})

const routeCases = [
  ['/login', '/login'],
  ['/applications', '/_authenticated/applications/'],
  ['/applications/guestbook', '/_authenticated/applications/$name/'],
  ['/applications/guestbook/tree', '/_authenticated/applications/$name/tree'],
  ['/applications/guestbook/list', '/_authenticated/applications/$name/list'],
  ['/applications/guestbook/pods', '/_authenticated/applications/$name/pods'],
  ['/applications/guestbook/diff', '/_authenticated/applications/$name/diff'],
  ['/applications/guestbook/history', '/_authenticated/applications/$name/history'],
  ['/applications/guestbook/settings', '/_authenticated/applications/$name/settings'],
  ['/projects', '/_authenticated/projects'],
  ['/repositories', '/_authenticated/repositories'],
  ['/clusters', '/_authenticated/clusters'],
] as const

describe('production route graph', () => {
  it.each(routeCases)('matches %s to %s', (pathname, expectedRouteId) => {
    const matches = router.matchRoutes(pathname)

    expect(matches.at(-1)?.routeId).toBe(expectedRouteId)
  })
})

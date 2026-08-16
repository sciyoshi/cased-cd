// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createMockProject } from './mock-project-contract.js'

const validRequest = {
  project: {
    metadata: { name: 'platform' },
    spec: {
      sourceRepos: ['https://github.com/example/platform'],
      destinations: [{ name: 'in-cluster', namespace: 'default' }],
    },
  },
}

describe('mock project create contract', () => {
  it('accepts the Argo CD wrapper, persists the project, and returns it', () => {
    const projects = []
    const result = createMockProject(
      validRequest,
      projects,
      () => '2026-08-16T12:00:00.000Z',
    )

    expect(result).toEqual({
      status: 201,
      body: {
        ...validRequest.project,
        metadata: {
          name: 'platform',
          namespace: 'argocd',
          creationTimestamp: '2026-08-16T12:00:00.000Z',
        },
      },
    })
    expect(projects).toEqual([result.body])
  })

  it.each([
    validRequest.project,
    null,
    {},
    { project: null },
    { project: { metadata: {}, spec: {} } },
    { project: { metadata: { name: 'Invalid Name' }, spec: {} } },
    { project: { metadata: { name: 'valid' }, spec: [] } },
  ])('rejects malformed request bodies without mutating the store', requestBody => {
    const projects = []
    const result = createMockProject(requestBody, projects)

    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/^Invalid project request:/)
    expect(projects).toEqual([])
  })

  it('rejects duplicate project names without replacing the existing project', () => {
    const existing = { metadata: { name: 'platform' }, spec: { sourceRepos: ['*'] } }
    const projects = [existing]

    expect(createMockProject(validRequest, projects)).toEqual({
      status: 409,
      body: { error: 'Project "platform" already exists' },
    })
    expect(projects).toEqual([existing])
  })
})

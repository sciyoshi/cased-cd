/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useSyncApplication,
  useApplications,
  useApplication,
  useCreateApplication,
  useUpdateApplication,
  useDeleteApplication,
  useRefreshApplication,
  useResourceTree,
  useManagedResources,
  applicationsApi,
  applicationKeys,
} from './applications'
import api from '@/lib/api-client'
import type { AxiosResponse } from 'axios'
import React from 'react'

// Mock the API client
vi.mock('@/lib/api-client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('useSyncApplication', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  it('should sync an application successfully', async () => {
    // Mock successful API response
    const mockResponse: AxiosResponse<unknown> = {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as never },
    }
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useSyncApplication(), { wrapper })

    // Trigger the mutation
    result.current.mutate({ name: 'test-app', prune: true })

    // Wait for the mutation to complete
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Verify API was called with correct parameters
    expect(api.post).toHaveBeenCalledWith(
      '/applications/test-app/sync',
      {
        prune: true,
        dryRun: undefined,
        strategy: { hook: {} },
      }
    )
  })

  it('should handle sync errors', async () => {
    // Mock API error
    const error = new Error('Sync failed')
    vi.mocked(api.post).mockRejectedValueOnce(error)

    const { result } = renderHook(() => useSyncApplication(), { wrapper })

    // Trigger the mutation
    result.current.mutate({ name: 'test-app', prune: true })

    // Wait for the mutation to fail
    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toEqual(error)
  })

  it('should sync with dry run option', async () => {
    const mockResponse: AxiosResponse<unknown> = {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as never },
    }
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse)

    const { result } = renderHook(() => useSyncApplication(), { wrapper })

    result.current.mutate({ name: 'test-app', prune: false, dryRun: true })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(api.post).toHaveBeenCalledWith(
      '/applications/test-app/sync',
      {
        prune: false,
        dryRun: true,
        strategy: { hook: {} },
      }
    )
  })

  it('should invalidate queries after successful sync', async () => {
    const mockResponse: AxiosResponse<unknown> = {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as never },
    }
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse)

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useSyncApplication(), { wrapper })

    result.current.mutate({ name: 'test-app', prune: true })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    // Check that queries were invalidated
    expect(invalidateSpy).toHaveBeenCalled()
  })
})

describe('applicationsApi.syncApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call the sync endpoint with correct payload', async () => {
    const mockResponse: AxiosResponse<unknown> = {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as never },
    }
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse)

    await applicationsApi.syncApplication('my-app', true, false)

    expect(api.post).toHaveBeenCalledWith('/applications/my-app/sync', {
      prune: true,
      dryRun: false,
      strategy: { hook: {} },
    })
  })

  it('should handle undefined options', async () => {
    const mockResponse: AxiosResponse<unknown> = {
      data: {},
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as never },
    }
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse)

    await applicationsApi.syncApplication('my-app')

    expect(api.post).toHaveBeenCalledWith('/applications/my-app/sync', {
      prune: undefined,
      dryRun: undefined,
      strategy: { hook: {} },
    })
  })

  it('should identify the application namespace in the request body', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} } as AxiosResponse<unknown>)

    await applicationsApi.syncApplication('shared', true, false, 'team-a')

    expect(api.post).toHaveBeenCalledWith('/applications/shared/sync', {
      prune: true,
      dryRun: false,
      strategy: { hook: {} },
      appNamespace: 'team-a',
    })
  })
})

describe('applicationsApi.updateApplicationSpec', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should call the spec endpoint with PUT and correct payload', async () => {
    const mockSpec = {
      project: 'production',
      source: {
        repoURL: 'https://github.com/example/repo',
        targetRevision: 'main',
        path: 'manifests',
      },
      destination: {
        server: 'https://kubernetes.default.svc',
        namespace: 'prod',
      },
      syncPolicy: {
        automated: {
          prune: true,
          selfHeal: true,
          allowEmpty: false,
        },
        syncOptions: ['CreateNamespace=true'],
      },
    }

    const mockResponse: AxiosResponse<typeof mockSpec> = {
      data: mockSpec,
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: {} as never },
    }

    vi.mocked(api.put).mockResolvedValueOnce(mockResponse)

    const result = await applicationsApi.updateApplicationSpec('my-app', mockSpec)

    expect(api.put).toHaveBeenCalledWith('/applications/my-app/spec', mockSpec)
    expect(result).toEqual(mockSpec)
  })

  it('should handle update errors', async () => {
    const mockSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/test/repo', targetRevision: 'main', path: '.' },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
    }

    const error = new Error('Update failed: invalid spec')
    vi.mocked(api.put).mockRejectedValueOnce(error)

    await expect(
      applicationsApi.updateApplicationSpec('my-app', mockSpec)
    ).rejects.toThrow('Update failed: invalid spec')

    expect(api.put).toHaveBeenCalledWith('/applications/my-app/spec', mockSpec)
  })

  it('should identify the application namespace in the query', async () => {
    const mockSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/test/repo', targetRevision: 'main', path: '.' },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
    }
    vi.mocked(api.put).mockResolvedValueOnce({ data: mockSpec } as any)

    await applicationsApi.updateApplicationSpec('shared', mockSpec, 'team-a')

    expect(api.put).toHaveBeenCalledWith('/applications/shared/spec?appNamespace=team-a', mockSpec)
  })
})

describe('Application Query Keys', () => {
  it('should generate correct query keys', () => {
    expect(applicationKeys.all).toEqual(['applications'])
    expect(applicationKeys.lists()).toEqual(['applications', 'list'])
    expect(applicationKeys.details()).toEqual(['applications', 'detail'])
    expect(applicationKeys.detail('my-app')).toEqual(['applications', 'detail', 'my-app', ''])
    expect(applicationKeys.resourceTree('my-app')).toEqual(['applications', 'resourceTree', 'my-app', ''])
    expect(applicationKeys.managedResources('my-app')).toEqual([
      'applications',
      'managedResources',
      'my-app',
      '',
    ])
  })

  it('isolates same-name applications in different namespaces', () => {
    expect(applicationKeys.detail('shared', 'team-a')).not.toEqual(
      applicationKeys.detail('shared', 'team-b'),
    )
    expect(applicationKeys.resourceTree('shared', 'team-a')).not.toEqual(
      applicationKeys.resourceTree('shared', 'team-b'),
    )
    expect(applicationKeys.managedResources('shared', 'team-a')).not.toEqual(
      applicationKeys.managedResources('shared', 'team-b'),
    )
    expect(applicationKeys.resource('shared', 'api', 'Deployment', 'default', 'team-a')).not.toEqual(
      applicationKeys.resource('shared', 'api', 'Deployment', 'default', 'team-b'),
    )
    expect(applicationKeys.revisionMetadata('shared', 'abc123', 'team-a')).not.toEqual(
      applicationKeys.revisionMetadata('shared', 'abc123', 'team-b'),
    )
  })
})

describe('applicationsApi - Core CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getApplications()', () => {
    it('should fetch all applications without filters', async () => {
      const mockApps = {
        metadata: {},
        items: [
          { metadata: { name: 'app1' }, spec: {}, status: {} },
          { metadata: { name: 'app2' }, spec: {}, status: {} },
        ],
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockApps } as any)

      const result = await applicationsApi.getApplications()

      expect(api.get).toHaveBeenCalledWith('/applications?')
      expect(result).toEqual(mockApps)
    })

    it('should fetch applications with filters', async () => {
      const mockApps = { metadata: {}, items: [] }
      vi.mocked(api.get).mockResolvedValue({ data: mockApps } as any)

      await applicationsApi.getApplications({
        project: 'production',
        cluster: 'prod-cluster',
        namespace: 'default',
        appNamespace: 'team-a',
      })

      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('project=production')
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('cluster=prod-cluster')
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('namespace=default')
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('appNamespace=team-a')
      )
    })
  })

  describe('getApplication()', () => {
    it('should fetch single application', async () => {
      const mockApp = {
        metadata: { name: 'my-app' },
        spec: { project: 'default' },
        status: { health: { status: 'Healthy' } },
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockApp } as any)

      const result = await applicationsApi.getApplication('my-app')

      expect(api.get).toHaveBeenCalledWith('/applications/my-app')
      expect(result).toEqual(mockApp)
    })

    it('should identify the application namespace', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} } as any)

      await applicationsApi.getApplication('shared', 'team-a')

      expect(api.get).toHaveBeenCalledWith('/applications/shared?appNamespace=team-a')
    })
  })

  describe('createApplication()', () => {
    it('should create new application', async () => {
      const newApp = {
        metadata: { name: 'new-app' },
        spec: {
          project: 'default',
          source: { repoURL: 'https://github.com/test/repo', targetRevision: 'main', path: '.' },
          destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
        },
      }
      vi.mocked(api.post).mockResolvedValue({ data: newApp } as any)

      const result = await applicationsApi.createApplication(newApp as any)

      expect(api.post).toHaveBeenCalledWith('/applications', newApp)
      expect(result).toEqual(newApp)
    })
  })

  describe('updateApplication()', () => {
    it('should update application', async () => {
      const updatedApp = {
        metadata: { name: 'my-app', namespace: 'default', labels: { env: 'prod' } },
      }
      vi.mocked(api.put).mockResolvedValue({ data: updatedApp } as any)

      const result = await applicationsApi.updateApplication('my-app', updatedApp as any)

      expect(api.put).toHaveBeenCalledWith('/applications/my-app', updatedApp)
      expect(result).toEqual(updatedApp)
    })

    it('should identify a namespaced application in its metadata', async () => {
      const updatedApp = { metadata: { name: 'shared', labels: { env: 'prod' } } }
      vi.mocked(api.put).mockResolvedValue({ data: updatedApp } as any)

      await applicationsApi.updateApplication('shared', updatedApp as any, 'team-a')

      expect(api.put).toHaveBeenCalledWith('/applications/shared', {
        metadata: { name: 'shared', namespace: 'team-a', labels: { env: 'prod' } },
      })
    })
  })

  describe('deleteApplication()', () => {
    it('should delete application without cascade', async () => {
      vi.mocked(api.delete).mockResolvedValue({} as any)

      await applicationsApi.deleteApplication('my-app')

      expect(api.delete).toHaveBeenCalledWith('/applications/my-app')
    })

    it('should delete application with cascade', async () => {
      vi.mocked(api.delete).mockResolvedValue({} as any)

      await applicationsApi.deleteApplication('my-app', true)

      expect(api.delete).toHaveBeenCalledWith('/applications/my-app?cascade=true')
    })

    it('should delete only the selected namespaced application', async () => {
      vi.mocked(api.delete).mockResolvedValue({} as any)

      await applicationsApi.deleteApplication('shared', true, 'team-a')

      expect(api.delete).toHaveBeenCalledWith(
        '/applications/shared?cascade=true&appNamespace=team-a',
      )
    })
  })

  describe('refreshApplication()', () => {
    it('should refresh application', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} } as any)

      await applicationsApi.refreshApplication('my-app')

      expect(api.get).toHaveBeenCalledWith('/applications/my-app?refresh=normal')
    })

    it('should refresh only the selected namespaced application', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} } as any)

      await applicationsApi.refreshApplication('shared', 'team-a')

      expect(api.get).toHaveBeenCalledWith(
        '/applications/shared?refresh=normal&appNamespace=team-a',
      )
    })
  })

  describe('getResourceTree()', () => {
    it('should fetch resource tree', async () => {
      const mockTree = {
        nodes: [
          { kind: 'Deployment', name: 'my-deployment', namespace: 'default' },
          { kind: 'Service', name: 'my-service', namespace: 'default' },
        ],
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockTree } as any)

      const result = await applicationsApi.getResourceTree('my-app')

      expect(api.get).toHaveBeenCalledWith('/applications/my-app/resource-tree')
      expect(result).toEqual(mockTree)
    })

    it('should fetch the selected namespaced application tree', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { nodes: [] } } as any)

      await applicationsApi.getResourceTree('shared', 'team-a')

      expect(api.get).toHaveBeenCalledWith(
        '/applications/shared/resource-tree?appNamespace=team-a',
      )
    })
  })

  describe('getManagedResources()', () => {
    it('should fetch managed resources', async () => {
      const mockResources = {
        items: [
          { kind: 'Deployment', name: 'web', namespace: 'default' },
        ],
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockResources } as any)

      const result = await applicationsApi.getManagedResources('my-app')

      expect(api.get).toHaveBeenCalledWith('/applications/my-app/managed-resources')
      expect(result).toEqual(mockResources)
    })

    it('should fetch the selected namespaced application resources', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { items: [] } } as any)

      await applicationsApi.getManagedResources('shared', 'team-a')

      expect(api.get).toHaveBeenCalledWith(
        '/applications/shared/managed-resources?appNamespace=team-a',
      )
    })
  })

  describe('getRevisionMetadata()', () => {
    it('should fetch revision metadata for the selected namespaced application', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} } as any)

      await applicationsApi.getRevisionMetadata('shared', 'abc123', 'team-a')

      expect(api.get).toHaveBeenCalledWith(
        '/applications/shared/revisions/abc123/metadata?appNamespace=team-a',
      )
    })
  })

  describe('getResource()', () => {
    it('should fetch a resource from the selected namespaced application', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: { manifest: '{"kind":"Deployment"}' } } as any)

      const result = await applicationsApi.getResource({
        appName: 'shared',
        appNamespace: 'team-a',
        resourceName: 'api',
        kind: 'Deployment',
        namespace: 'default',
        group: 'apps',
        version: 'v1',
      })

      expect(api.get).toHaveBeenCalledWith(
        '/applications/shared/resource?name=api&resourceName=api&kind=Deployment&version=v1&group=apps&namespace=default&appNamespace=team-a',
      )
      expect(result).toEqual({ kind: 'Deployment' })
    })
  })
})

describe('Application React Query Hooks', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )

  describe('useApplications()', () => {
    it('should fetch all applications', async () => {
      const mockApps = {
        metadata: {},
        items: [{ metadata: { name: 'app1' } }],
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockApps } as any)

      const { result } = renderHook(() => useApplications(), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockApps)
    })

    it('should fetch applications with filters', async () => {
      const mockApps = { metadata: {}, items: [] }
      vi.mocked(api.get).mockResolvedValue({ data: mockApps } as any)

      const { result } = renderHook(
        () => useApplications({ project: 'production' }),
        { wrapper }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('project=production'))
    })
  })

  describe('useApplication()', () => {
    it('should fetch single application', async () => {
      const mockApp = { metadata: { name: 'my-app' }, spec: {}, status: {} }
      vi.mocked(api.get).mockResolvedValue({ data: mockApp } as any)

      const { result } = renderHook(() => useApplication('my-app'), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockApp)
    })

    it('should not fetch when disabled', () => {
      const { result } = renderHook(() => useApplication('my-app', false), { wrapper })

      expect(result.current.isFetching).toBe(false)
    })

    it('should fetch and cache a namespaced application separately', async () => {
      const mockApp = { metadata: { name: 'shared', namespace: 'team-a' }, spec: {}, status: {} }
      vi.mocked(api.get).mockResolvedValue({ data: mockApp } as any)

      const { result } = renderHook(() => useApplication('shared', true, 'team-a'), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/applications/shared?appNamespace=team-a')
      expect(queryClient.getQueryData(applicationKeys.detail('shared', 'team-a'))).toEqual(mockApp)
      expect(queryClient.getQueryData(applicationKeys.detail('shared', 'team-b'))).toBeUndefined()
    })
  })

  describe('useCreateApplication()', () => {
    it('should create application and invalidate queries', async () => {
      const newApp = {
        metadata: { name: 'new-app' },
        spec: {
          project: 'default',
          source: { repoURL: 'https://github.com/test/repo', targetRevision: 'main', path: '.' },
          destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
        },
      }
      vi.mocked(api.post).mockResolvedValue({ data: newApp } as any)

      const { result } = renderHook(() => useCreateApplication(), { wrapper })

      result.current.mutate(newApp as any)

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(newApp)
    })
  })

  describe('useUpdateApplication()', () => {
    it('should update application', async () => {
      const updatedApp = {
        metadata: { name: 'my-app', labels: { env: 'prod' } },
      }
      vi.mocked(api.put).mockResolvedValue({ data: updatedApp } as any)

      const { result } = renderHook(() => useUpdateApplication(), { wrapper })

      result.current.mutate({ name: 'my-app', app: updatedApp as any })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(updatedApp)
    })
  })

  describe('useDeleteApplication()', () => {
    it('should delete application', async () => {
      vi.mocked(api.delete).mockResolvedValue({} as any)

      const { result } = renderHook(() => useDeleteApplication(), { wrapper })

      result.current.mutate({ name: 'my-app' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('should delete application with cascade', async () => {
      vi.mocked(api.delete).mockResolvedValue({} as any)

      const { result } = renderHook(() => useDeleteApplication(), { wrapper })

      result.current.mutate({ name: 'my-app', cascade: true })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.delete).toHaveBeenCalledWith('/applications/my-app?cascade=true')
    })
  })

  describe('useRefreshApplication()', () => {
    it('should refresh application', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: {} } as any)

      const { result } = renderHook(() => useRefreshApplication(), { wrapper })

      result.current.mutate({ name: 'my-app' })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(api.get).toHaveBeenCalledWith('/applications/my-app?refresh=normal')
    })
  })

  describe('useResourceTree()', () => {
    it('should fetch resource tree', async () => {
      const mockTree = {
        nodes: [{ kind: 'Deployment', name: 'web' }],
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockTree } as any)

      const { result } = renderHook(() => useResourceTree('my-app'), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockTree)
    })

    it('should not fetch when disabled', () => {
      const { result } = renderHook(() => useResourceTree('my-app', false), { wrapper })

      expect(result.current.isFetching).toBe(false)
    })
  })

  describe('useManagedResources()', () => {
    it('should fetch managed resources', async () => {
      const mockResources = {
        items: [{ kind: 'Deployment', name: 'web' }],
      }
      vi.mocked(api.get).mockResolvedValue({ data: mockResources } as any)

      const { result } = renderHook(() => useManagedResources('my-app'), { wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual(mockResources)
    })

    it('should not fetch when disabled', () => {
      const { result } = renderHook(() => useManagedResources('my-app', false), { wrapper })

      expect(result.current.isFetching).toBe(false)
    })
  })
})

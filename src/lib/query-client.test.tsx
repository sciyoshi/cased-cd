import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '@/lib/api-client'
import {
  useCreateApplication,
  useDeleteApplication,
  usePatchResource,
  useRollbackApplication,
  useSyncApplication,
} from '@/services/applications'
import type { Application } from '@/types/api'
import { QueryProvider, queryClient } from './query-client'

vi.mock('@/lib/api-client', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const responseLost = new Error('Response lost after the server accepted the request')

const application = {
  metadata: { name: 'demo', namespace: 'argocd' },
  spec: {
    project: 'default',
    source: { repoURL: 'https://example.com/repo.git' },
    destination: {
      server: 'https://kubernetes.default.svc',
      namespace: 'default',
    },
  },
} as Application

describe('QueryClient mutation retry safety', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
  })

  it('requires mutations to opt in to retries', () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('does not repeat a sync after an ambiguous network failure', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(responseLost)
    const { result } = renderHook(() => useSyncApplication(), { wrapper: QueryProvider })

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'demo', appNamespace: 'argocd' }))
        .rejects.toBe(responseLost)
    })

    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a rollback after an ambiguous network failure', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(responseLost)
    const { result } = renderHook(() => useRollbackApplication(), { wrapper: QueryProvider })

    await act(async () => {
      await expect(result.current.mutateAsync({
        name: 'demo',
        request: { id: 7, appNamespace: 'argocd' },
      })).rejects.toBe(responseLost)
    })

    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a delete after an ambiguous network failure', async () => {
    vi.mocked(api.delete).mockRejectedValueOnce(responseLost)
    const { result } = renderHook(() => useDeleteApplication(), { wrapper: QueryProvider })

    await act(async () => {
      await expect(result.current.mutateAsync({
        name: 'demo',
        appNamespace: 'argocd',
        cascade: true,
      })).rejects.toBe(responseLost)
    })

    expect(api.delete).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a create after an ambiguous network failure', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(responseLost)
    const { result } = renderHook(() => useCreateApplication(), { wrapper: QueryProvider })

    await act(async () => {
      await expect(result.current.mutateAsync(application)).rejects.toBe(responseLost)
    })

    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('does not repeat a live patch after an ambiguous network failure', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(responseLost)
    const { result } = renderHook(() => usePatchResource(), { wrapper: QueryProvider })

    await act(async () => {
      await expect(result.current.mutateAsync({
        appName: 'demo',
        appNamespace: 'argocd',
        resourceName: 'web',
        kind: 'Deployment',
        namespace: 'default',
        group: 'apps',
        version: 'v1',
        patch: { spec: { replicas: 2 } },
      })).rejects.toBe(responseLost)
    })

    expect(api.post).toHaveBeenCalledTimes(1)
  })
})

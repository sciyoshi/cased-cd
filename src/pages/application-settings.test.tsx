import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '@/types/api'
import { ApplicationSettingsPage } from './application-settings'

const router = vi.hoisted(() => ({ navigate: vi.fn() }))
const service = vi.hoisted(() => ({
  application: null as Application | null,
  updateSpec: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => router.navigate,
  useParams: () => ({ name: 'advanced-app' }),
}))

vi.mock('@/services/applications', () => ({
  useApplication: () => ({ data: service.application, isLoading: false }),
  useUpdateApplicationSpec: () => ({
    isPending: false,
    mutateAsync: service.updateSpec,
  }),
}))

vi.mock('@/services/projects', () => ({
  useProjects: () => ({
    data: { items: [{ metadata: { name: 'default' } }] },
  }),
}))

vi.mock('@/services/clusters', () => ({
  useClusters: () => ({
    data: {
      items: [
        {
          name: 'in-cluster',
          server: 'https://kubernetes.default.svc',
          config: {},
        },
        {
          name: 'production',
          server: 'https://production.example.com',
          config: {},
        },
      ],
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function application(spec: Application['spec']): Application {
  return {
    metadata: { name: 'advanced-app', namespace: 'argocd' },
    spec,
  }
}

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterAll(() => vi.unstubAllGlobals())

describe('ApplicationSettingsPage safe round trips', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    service.updateSpec.mockResolvedValue(undefined)
  })

  it('makes multi-source fields read-only while preserving sources and named destinations', async () => {
    service.application = application({
      project: 'default',
      sources: [
        {
          repoURL: 'https://charts.example.com',
          chart: 'api',
          targetRevision: '1.2.3',
          helm: { valueFiles: ['$values/prod.yaml'] },
        },
        {
          repoURL: 'https://github.com/example/values.git',
          targetRevision: 'main',
        },
      ],
      destination: { name: 'production', namespace: 'api' },
      syncPolicy: { syncOptions: ['RespectIgnoreDifferences=true'] },
    })
    const user = userEvent.setup()

    render(<ApplicationSettingsPage appNamespace="argocd" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Multi-source configuration is read-only here',
    )
    expect(screen.getByLabelText('Repository URL')).toBeDisabled()
    expect(screen.getByLabelText('Target Revision')).toBeDisabled()
    expect(screen.getByLabelText('Path')).toBeDisabled()

    await user.click(screen.getByRole('switch', { name: 'Automated Sync' }))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(service.updateSpec).toHaveBeenCalledOnce())
    const payload = service.updateSpec.mock.calls[0][0]
    expect(payload.spec.sources).toEqual(service.application?.spec.sources)
    expect(payload.spec).not.toHaveProperty('source')
    expect(payload.spec.destination).toEqual({ name: 'production', namespace: 'api' })
    expect(payload.spec.destination).not.toHaveProperty('server')
    expect(payload.spec.syncPolicy).toMatchObject({
      automated: { enabled: true },
      syncOptions: ['RespectIgnoreDifferences=true'],
    })
  })

  it('submits an unchanged advanced single-source spec without normalizing it', async () => {
    const spec = {
      project: 'default',
      source: {
        repoURL: 'https://charts.example.com',
        chart: 'worker',
        targetRevision: '4.5.6',
        helm: { parameters: [{ name: 'workers', value: '10' }] },
      },
      destination: {
        server: 'https://kubernetes.default.svc',
        namespace: 'workers',
      },
      syncPolicy: {
        automated: { enabled: false, prune: true },
        syncOptions: ['PrunePropagationPolicy=background'],
        retry: {
          limit: 5,
          backoff: { duration: '15s', factor: 3, maxDuration: '5m' },
        },
      },
      ignoreDifferences: [{ group: 'apps', kind: 'Deployment' }],
      revisionHistoryLimit: 15,
    } satisfies Application['spec']
    service.application = application(spec)
    const user = userEvent.setup()

    render(<ApplicationSettingsPage />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Chart sources do not use a Git path',
    )
    expect(screen.getByLabelText('Path')).toBeDisabled()
    await user.click(await screen.findByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(service.updateSpec).toHaveBeenCalledOnce())
    expect(service.updateSpec).toHaveBeenCalledWith({
      name: 'advanced-app',
      appNamespace: 'argocd',
      spec,
    })
  })
})

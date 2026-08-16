import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApplicationHistory } from './application-history'
import { ResourceDetailsPanel } from './resource-details-panel'
import { ResourceDiffPanel } from './resource-diff-panel'

vi.mock('@/services/applications', () => ({
  useResource: () => ({
    data: {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'guestbook-ui', namespace: 'default' },
    },
  }),
  useRollbackApplication: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePatchResource: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

const application = {
  metadata: { name: 'guestbook', namespace: 'argocd' },
  spec: {
    project: 'default',
    source: { repoURL: 'https://example.com/repo.git' },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
  },
  status: {
    sync: { status: 'Synced' as const, revision: '1234567890abcdef' },
    history: [
      {
        id: 1,
        revision: '1234567890abcdef',
        deployedAt: '2026-08-16T12:00:00Z',
        initiatedBy: { username: 'developer' },
      },
    ],
  },
}

describe('application detail responsive panels', () => {
  it('uses the full mobile width for resource details and wraps its actions', () => {
    render(
      <ResourceDetailsPanel
        resource={{
          kind: 'Deployment',
          name: 'guestbook-ui',
          namespace: 'default',
          status: 'Synced',
          health: { status: 'Healthy' },
        }}
        onClose={vi.fn()}
        appName="guestbook"
        app={application}
      />,
    )

    expect(screen.getByTestId('resource-details-panel')).toHaveClass('w-full', 'max-w-[600px]')
    expect(screen.getByRole('button', { name: 'Close resource details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' }).parentElement).toHaveClass('flex-wrap')
  })

  it('stacks the diff resource list above its viewer and keeps view controls available', () => {
    render(
      <ResourceDiffPanel
        resources={[{
          kind: 'Deployment',
          name: 'guestbook-ui',
          namespace: 'default',
          liveState: '{"spec":{"replicas":1}}',
          targetState: '{"spec":{"replicas":2}}',
        }]}
        resourceStatuses={[{
          kind: 'Deployment',
          name: 'guestbook-ui',
          namespace: 'default',
          status: 'OutOfSync',
        }]}
      />,
    )

    expect(screen.getByTestId('resource-diff-panel')).toHaveClass('flex-col', 'lg:flex-row')
    expect(screen.getByRole('button', { name: 'Split' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unified' })).toBeInTheDocument()
  })

  it('stacks history details and keeps rollback actions full-width on mobile', () => {
    render(<ApplicationHistory application={application} />)

    const entry = screen.getByTestId('history-entry')
    expect(entry.firstElementChild).toHaveClass('flex-col', 'sm:flex-row')
    expect(screen.getByRole('button', { name: 'Redeploy' })).toHaveClass('w-full', 'sm:w-auto')
  })
})

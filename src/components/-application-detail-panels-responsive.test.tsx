import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationHistory } from './application-history'
import { ResourceDetailsPanel } from './resource-details-panel'
import { ResourceEditModal } from './resource-edit-modal'
import { ResourceDiffPanel } from './resource-diff-panel'

const serviceCalls = vi.hoisted(() => ({
  useResource: vi.fn(),
  patchResource: vi.fn(),
}))

vi.mock('@/services/applications', () => ({
  useResource: (params: unknown) => {
    serviceCalls.useResource(params)
    return {
      data: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'guestbook-ui', namespace: 'default' },
      },
    }
  },
  useRollbackApplication: () => ({ isPending: false, mutateAsync: vi.fn() }),
  usePatchResource: () => ({ isPending: false, mutateAsync: serviceCalls.patchResource }),
}))

const application = {
  metadata: { name: 'guestbook', namespace: 'team-a' },
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
  beforeEach(() => vi.clearAllMocks())

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
    expect(serviceCalls.useResource).toHaveBeenCalledWith(expect.objectContaining({
      appName: 'guestbook',
      appNamespace: 'team-a',
    }))
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

  it('scopes live resource edits to the routed application namespace', async () => {
    const applicationWithoutMetadataNamespace = {
      ...application,
      metadata: { name: 'guestbook', namespace: '' },
    }

    render(
      <ResourceEditModal
        open
        onOpenChange={vi.fn()}
        resource={{
          kind: 'Deployment',
          name: 'guestbook-ui',
          namespace: 'default',
          manifest: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: { name: 'guestbook-ui', namespace: 'default' },
          },
        }}
        app={applicationWithoutMetadataNamespace}
        appName="guestbook"
        appNamespace="team-a"
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'YAML Mode' }))
    fireEvent.change(screen.getByLabelText('Resource Manifest (YAML)'), {
      target: {
        value: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: guestbook-ui
  namespace: default
spec:
  replicas: 2
`,
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }))

    await waitFor(() => expect(serviceCalls.patchResource).toHaveBeenCalledWith(
      expect.objectContaining({ appName: 'guestbook', appNamespace: 'team-a' }),
    ))
  })
})

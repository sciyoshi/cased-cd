import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '@/types/api'
import { ResourceEditModal } from './resource-edit-modal'

const serviceCalls = vi.hoisted(() => ({
  patchResource: vi.fn(),
}))

vi.mock('@/services/applications', () => ({
  usePatchResource: () => ({
    isPending: false,
    mutateAsync: serviceCalls.patchResource,
  }),
}))

const application = {
  metadata: { name: 'demo', namespace: 'team-a' },
  spec: {
    project: 'default',
    source: { repoURL: 'https://example.com/repo.git' },
    destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
  },
} as Application

const resource = {
  kind: 'Deployment',
  name: 'web',
  namespace: 'default',
  manifest: {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'web',
      namespace: 'default',
      uid: 'resource-uid',
      resourceVersion: '42',
    },
    spec: {
      replicas: 1,
      selector: { matchLabels: { app: 'web' } },
      template: {
        metadata: { labels: { app: 'web' } },
        spec: { containers: [{ name: 'web', image: 'nginx:1.0' }] },
      },
    },
    status: { availableReplicas: 1 },
  },
}

interface ModalOptions {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function modal({ open = true, onOpenChange = vi.fn() }: ModalOptions = {}) {
  return (
    <ResourceEditModal
      open={open}
      onOpenChange={onOpenChange}
      resource={resource}
      app={application}
      appName="demo"
      appNamespace="team-a"
    />
  )
}

function changeReplicas(value: number) {
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Replicas' }), {
    target: { value: String(value) },
  })
}

describe('ResourceEditModal safety confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceCalls.patchResource.mockResolvedValue(undefined)
  })

  it('requires a new confirmation every time the modal opens', async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(modal({ onOpenChange }))
    changeReplicas(2)
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }))

    await waitFor(() => expect(serviceCalls.patchResource).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)

    rerender(modal({ open: false, onOpenChange }))
    rerender(modal({ open: true, onOpenChange }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Confirm Apply' })).not.toBeInTheDocument()

    changeReplicas(3)
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(serviceCalls.patchResource).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }))

    await waitFor(() => expect(serviceCalls.patchResource).toHaveBeenCalledTimes(2))
  })

  it('keeps confirmation through manifest object refreshes while open', async () => {
    const { rerender } = render(modal())
    changeReplicas(2)
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()

    rerender(
      <ResourceEditModal
        open
        onOpenChange={vi.fn()}
        resource={{ ...resource, manifest: structuredClone(resource.manifest) }}
        app={application}
        appName="demo"
        appNamespace="team-a"
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }))
    await waitFor(() => expect(serviceCalls.patchResource).toHaveBeenCalledTimes(1))
  })

  it('invalidates confirmation whenever the edit mode changes', async () => {
    const user = userEvent.setup()
    render(modal())
    changeReplicas(2)
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'YAML Mode' }))
    expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm Apply' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Quick Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(serviceCalls.patchResource).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()
  })

  it('invalidates confirmation after content changes and submits only the fresh diff', async () => {
    render(modal())
    changeReplicas(2)
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()

    changeReplicas(3)
    expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(serviceCalls.patchResource).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }))

    await waitFor(() => expect(serviceCalls.patchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        appName: 'demo',
        appNamespace: 'team-a',
        patch: { spec: { replicas: 3 } },
      }),
    ))
  })

  it('shows invalid YAML without entering confirmation', async () => {
    const user = userEvent.setup()
    render(modal())
    await user.click(screen.getByRole('tab', { name: 'YAML Mode' }))
    fireEvent.change(await screen.findByLabelText('Resource Manifest (YAML)'), {
      target: { value: 'kind: [invalid' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))

    expect(screen.getByText(/Invalid YAML:/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm Apply' })).not.toBeInTheDocument()
    expect(serviceCalls.patchResource).not.toHaveBeenCalled()
  })

  it('shows protected YAML edits without entering confirmation', async () => {
    const user = userEvent.setup()
    render(modal())
    await user.click(screen.getByRole('tab', { name: 'YAML Mode' }))
    const editor = await screen.findByLabelText('Resource Manifest (YAML)')
    fireEvent.change(editor, {
      target: { value: (editor as HTMLTextAreaElement).value.replace('name: web', 'name: renamed') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))

    expect(screen.getByText(/metadata\.name:.*immutable after resource creation/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm Apply' })).not.toBeInTheDocument()
    expect(serviceCalls.patchResource).not.toHaveBeenCalled()
  })

  it('shows API failures and requires confirmation again before retrying', async () => {
    const onOpenChange = vi.fn()
    serviceCalls.patchResource.mockRejectedValueOnce(new Error('Forbidden by Argo CD'))
    render(modal({ onOpenChange }))
    changeReplicas(2)
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Apply' }))

    expect(await screen.findByText('Failed to apply changes: Forbidden by Argo CD'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply Changes' })).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    expect(serviceCalls.patchResource).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Confirm Apply' })).toBeInTheDocument()
  })
})

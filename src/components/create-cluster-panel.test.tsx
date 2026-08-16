import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateClusterPanel } from './create-cluster-panel'

const createCluster = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
}))

vi.mock('@/services/clusters', () => ({
  useCreateCluster: () => createCluster,
}))

function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText('production-cluster'), {
    target: { value: 'production' },
  })
  fireEvent.change(screen.getByPlaceholderText('https://kubernetes.default.svc'), {
    target: { value: 'https://api.example.com:6443' },
  })
}

describe('CreateClusterPanel namespace restrictions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createCluster.mutateAsync.mockResolvedValue({})
  })

  it('normalizes, deduplicates, and submits namespace restrictions', async () => {
    render(<CreateClusterPanel isOpen onClose={vi.fn()} />)
    fillRequiredFields()

    fireEvent.change(screen.getByLabelText('Namespaces (optional)'), {
      target: { value: ' default, kube-system, default, production ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Cluster' }))

    await waitFor(() => expect(createCluster.mutateAsync).toHaveBeenCalledOnce())
    expect(createCluster.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      namespaces: ['default', 'kube-system', 'production'],
    }))
  })

  it('omits namespace restrictions when the field is blank', async () => {
    render(<CreateClusterPanel isOpen onClose={vi.fn()} />)
    fillRequiredFields()

    fireEvent.change(screen.getByLabelText('Namespaces (optional)'), {
      target: { value: ' , , ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Cluster' }))

    await waitFor(() => expect(createCluster.mutateAsync).toHaveBeenCalledOnce())
    expect(createCluster.mutateAsync.mock.calls[0][0]).not.toHaveProperty('namespaces')
  })

  it('rejects invalid Kubernetes namespace names without submitting', async () => {
    render(<CreateClusterPanel isOpen onClose={vi.fn()} />)
    fillRequiredFields()

    const namespaces = screen.getByLabelText('Namespaces (optional)')
    fireEvent.change(namespaces, { target: { value: 'default, Production' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Cluster' }))

    expect(await screen.findByText(/Invalid namespace: Production/)).toBeInTheDocument()
    expect(namespaces).toHaveAttribute('aria-invalid', 'true')
    expect(createCluster.mutateAsync).not.toHaveBeenCalled()
  })
})

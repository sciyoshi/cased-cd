import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProjectPanel } from './create-project-panel'

const createProject = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
}))

vi.mock('@/services/projects', () => ({
  useCreateProject: () => createProject,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('CreateProjectPanel destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createProject.mutateAsync.mockResolvedValue({})
  })

  it('exposes the panel and close control with accessible names', () => {
    const onClose = vi.fn()
    render(<CreateProjectPanel isOpen onClose={onClose} />)

    expect(screen.getByRole('dialog', { name: 'Create Project' })).toBeInTheDocument()

    const closeButton = screen.getByRole('button', { name: 'Close create project panel' })
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('submits URL and named-cluster destinations without truncating them', async () => {
    render(<CreateProjectPanel isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('my-project'), {
      target: { value: 'platform' },
    })
    fireEvent.change(screen.getByLabelText('Destinations (optional)'), {
      target: {
        value: [
          'server=https://api.example.com:6443/clusters/production | namespace=staging',
          'name=in-cluster | namespace=default',
        ].join('\n'),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    await waitFor(() => expect(createProject.mutateAsync).toHaveBeenCalledOnce())
    expect(createProject.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      spec: expect.objectContaining({
        destinations: [
          {
            server: 'https://api.example.com:6443/clusters/production',
            namespace: 'staging',
          },
          { name: 'in-cluster', namespace: 'default' },
        ],
      }),
    }))
  })

  it('shows ambiguous destination input as a field error without submitting', async () => {
    render(<CreateProjectPanel isOpen onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('my-project'), {
      target: { value: 'platform' },
    })
    const destinations = screen.getByLabelText('Destinations (optional)')
    fireEvent.change(destinations, { target: { value: 'in-cluster/default' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    expect(await screen.findByText(/Line 1: use "server=/)).toBeInTheDocument()
    expect(destinations).toHaveAttribute('aria-invalid', 'true')
    expect(createProject.mutateAsync).not.toHaveBeenCalled()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationsPage } from '@/pages/applications'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('@/services/applications', () => ({
  useApplications: () => ({
    data: {
      items: [
        {
          metadata: { name: 'guestbook', namespace: 'argocd' },
          spec: {
            project: 'default',
            destination: { name: 'in-cluster', namespace: 'default' },
          },
          status: {
            health: { status: 'Healthy' },
            sync: { status: 'Synced' },
          },
        },
        {
          metadata: { name: 'helm-guestbook', namespace: 'argocd' },
          spec: {
            project: 'default',
            destination: { name: 'production', namespace: 'apps' },
          },
          status: {
            health: { status: 'Degraded' },
            sync: { status: 'OutOfSync' },
          },
        },
        {
          metadata: { name: 'api', namespace: 'argocd' },
          spec: {
            project: 'default',
            destination: { name: 'production', namespace: 'default' },
          },
          status: {
            health: { status: 'Progressing' },
            sync: { status: 'OutOfSync' },
          },
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRefreshApplication: () => ({ mutateAsync: vi.fn() }),
  useSyncApplication: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('@/components/-applications/application-card', () => ({
  ApplicationCard: ({ app }: { app: { metadata: { name: string } } }) => (
    <div data-testid="application-card">{app.metadata.name}</div>
  ),
}))

vi.mock('@/components/-applications/application-table', () => ({
  ApplicationTable: ({
    applications,
  }: {
    applications: Array<{ metadata: { name: string } }>
  }) => (
    <div data-testid="application-table">
      {applications.map((app) => app.metadata.name).join(', ')}
    </div>
  ),
}))

vi.mock('@/components/create-application-panel', () => ({
  CreateApplicationPanel: () => null,
}))

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}))

const storageKey = 'cased_cd_applications_view'

describe('ApplicationsPage view selection', () => {
  beforeAll(() => {
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { value: () => false },
      setPointerCapture: { value: () => undefined },
      releasePointerCapture: { value: () => undefined },
      scrollIntoView: { value: () => undefined },
    })
  })

  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to cards and switches to the table view', () => {
    render(<ApplicationsPage />)

    expect(screen.getAllByTestId('application-card')).toHaveLength(3)
    expect(screen.queryByTestId('application-table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Table view' }))

    expect(screen.queryByTestId('application-card')).not.toBeInTheDocument()
    expect(screen.getByTestId('application-table')).toHaveTextContent('guestbook')
    expect(screen.getByRole('button', { name: 'Table view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(localStorage.getItem(storageKey)).toBe('table')
  })

  it('restores the saved table preference', () => {
    localStorage.setItem(storageKey, 'table')

    render(<ApplicationsPage />)

    expect(screen.getByTestId('application-table')).toBeInTheDocument()
    expect(screen.queryByTestId('application-card')).not.toBeInTheDocument()
  })

  it('filters applications by cluster, namespace, and state', async () => {
    const user = userEvent.setup()
    render(<ApplicationsPage />)

    await user.click(screen.getByRole('combobox', { name: 'Filter by cluster' }))
    await user.click(screen.getByRole('option', { name: 'production' }))

    expect(screen.queryByText('guestbook')).not.toBeInTheDocument()
    expect(screen.getByText('helm-guestbook')).toBeInTheDocument()
    expect(screen.getByText('api')).toBeInTheDocument()

    await user.click(
      screen.getByRole('combobox', { name: 'Filter by namespace' }),
    )
    await user.click(screen.getByRole('option', { name: 'default' }))

    expect(screen.queryByText('helm-guestbook')).not.toBeInTheDocument()
    expect(screen.getByText('api')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Filter by state' }))
    await user.click(screen.getByRole('option', { name: 'Health: Degraded' }))

    expect(screen.queryByTestId('application-card')).not.toBeInTheDocument()
    expect(screen.getByText('No applications found')).toBeInTheDocument()
    expect(
      screen.getByText('Try adjusting your search or filters'),
    ).toBeInTheDocument()
  })
})

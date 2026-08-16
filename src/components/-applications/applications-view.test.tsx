import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationsPage } from '@/routes/_authenticated/applications/index'

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
            destination: { namespace: 'default' },
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
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to cards and switches to the table view', () => {
    render(<ApplicationsPage />)

    expect(screen.getByTestId('application-card')).toBeInTheDocument()
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
})

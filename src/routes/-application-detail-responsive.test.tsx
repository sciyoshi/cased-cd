import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApplicationDetailLayout } from './_authenticated/applications.$name'

const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: '/applications/guestbook/tree',
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => options,
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  Outlet: () => <div data-testid="detail-outlet">Route content</div>,
  useNavigate: () => router.navigate,
  useParams: () => ({ name: 'guestbook' }),
  useRouterState: () => ({ location: { pathname: router.pathname } }),
}))

const application = vi.hoisted(() => ({
  metadata: { name: 'guestbook', namespace: 'argocd' },
  spec: {
    project: 'default',
    source: {
      repoURL: 'https://github.com/argoproj/argocd-example-apps',
      targetRevision: 'HEAD',
    },
    destination: {
      server: 'https://kubernetes.default.svc',
      namespace: 'default',
    },
  },
  status: {
    health: { status: 'Healthy' },
    sync: { status: 'Synced' },
  },
}))

vi.mock('@/services/applications', () => {
  const mutation = () => ({ isPending: false, mutateAsync: vi.fn() })

  return {
    useApplication: () => ({
      data: application,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useApplications: () => ({ data: { items: [application] } }),
    useUpdateApplicationSpec: mutation,
    useSyncApplication: mutation,
    useDeleteApplication: mutation,
    useRefreshApplication: mutation,
  }
})

vi.mock('@/components/sync-progress-sheet', () => ({
  SyncProgressSheet: () => null,
}))

describe('ApplicationDetailLayout responsive controls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('wraps every critical action and labels the auto-sync control', () => {
    render(<ApplicationDetailLayout />)

    const actions = screen.getByTestId('application-actions')
    expect(actions).toHaveClass('w-full', 'flex-wrap', 'lg:flex-nowrap')
    expect(screen.getByRole('combobox', { name: 'Select application' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Toggle automatic sync' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('exposes all detail views and stacks metadata below route content', () => {
    render(<ApplicationDetailLayout />)

    const views = screen.getByRole('navigation', { name: 'Application views' })
    for (const name of ['Tree', 'List', 'Pods', 'Diff', 'History']) {
      expect(views).toHaveTextContent(name)
    }
    expect(screen.getByRole('button', { name: 'Tree' })).toHaveClass('bg-blue-700')

    const outlet = screen.getByTestId('detail-outlet')
    expect(outlet.parentElement).toHaveClass('min-h-[28rem]', 'lg:min-h-0')

    const metadata = screen.getByRole('complementary')
    expect(metadata).toHaveClass('w-full', 'border-t', 'lg:w-80', 'lg:border-l')
  })

  it('keeps application settings reachable from the responsive action group', () => {
    render(<ApplicationDetailLayout />)

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(router.navigate).toHaveBeenCalledWith({
      to: '/applications/$name/settings',
      params: { name: 'guestbook' },
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SettingsPage } from './settings'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  refetchClusters: vi.fn(),
  useClusters: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => mocks.navigate }))
vi.mock('@/lib/theme', () => ({
  useAppearance: () => ({ appearance: 'system', setAppearance: vi.fn() }),
}))
vi.mock('@/services/clusters', () => ({
  useClusters: mocks.useClusters,
}))
vi.mock('@/services/certificates', () => ({
  useCertificates: () => ({ data: { items: [] } }),
}))
vi.mock('@/services/gpgkeys', () => ({
  useGPGKeys: () => ({ data: { items: [] } }),
}))

function setClusterQuery(overrides: Record<string, unknown> = {}) {
  mocks.useClusters.mockReturnValue({
    data: { items: [] },
    isLoading: false,
    error: null,
    refetch: mocks.refetchClusters,
    ...overrides,
  })
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setClusterQuery()
  })

  it('does not advertise a fabricated or broken Accounts destination', () => {
    render(<SettingsPage />)

    expect(screen.queryByRole('heading', { name: 'Accounts' })).not.toBeInTheDocument()
    expect(screen.queryByText('Manage user accounts and permissions')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Certificates' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'GPG Keys' })).toBeInTheDocument()
  })

  it('renders an authoritative empty inventory without inventing an in-cluster destination', () => {
    render(<SettingsPage />)

    expect(screen.getByText('0 registered clusters')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'No clusters registered' })).toBeInTheDocument()
    expect(screen.getByText('Argo CD returned an empty cluster inventory.')).toBeInTheDocument()
    expect(screen.queryByText('https://kubernetes.default.svc')).not.toBeInTheDocument()
    expect(screen.queryByText(/k3d-cased-cd|Production Cluster/)).not.toBeInTheDocument()
  })

  it('renders real name, server, connection, version, and counts for one cluster', () => {
    setClusterQuery({
      data: {
        items: [
          {
            name: 'production-us-east',
            server: 'https://api.prod.example.com:6443',
            config: {},
            connectionState: { status: 'Successful' },
            info: {
              serverVersion: 'v1.31.2',
              applicationsCount: 7,
              cacheInfo: { resourcesCount: 1_234 },
            },
          },
        ],
      },
    })

    render(<SettingsPage />)

    expect(screen.getByText('1 registered cluster')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'production-us-east' })).toBeInTheDocument()
    expect(screen.getAllByText('https://api.prod.example.com:6443')).toHaveLength(2)
    expect(screen.getByText('Successful')).toBeInTheDocument()
    expect(screen.getByText('v1.31.2')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  it('renders every cluster returned by Argo CD without environment labels', () => {
    setClusterQuery({
      data: {
        items: [
          {
            name: 'in-cluster',
            server: 'https://kubernetes.default.svc',
            config: {},
            connectionState: { status: 'Successful' },
          },
          {
            name: 'staging-eu',
            server: 'https://staging.example.com',
            config: {},
            connectionState: { status: 'Failed' },
          },
        ],
      },
    })

    render(<SettingsPage />)

    expect(screen.getByText('2 registered clusters')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'in-cluster' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'staging-eu' })).toBeInTheDocument()
    expect(screen.getByText('Successful')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.queryByText('Local')).not.toBeInTheDocument()
    expect(screen.queryByText('Production')).not.toBeInTheDocument()
  })

  it('labels fields that Argo CD does not provide as unavailable', () => {
    setClusterQuery({
      data: { items: [{ name: '', server: '', config: {} }] },
    })

    render(<SettingsPage />)

    expect(screen.getByRole('heading', { name: 'Name unavailable' })).toBeInTheDocument()
    expect(screen.getAllByText('Endpoint unavailable')).toHaveLength(2)
    expect(screen.getByText('Status unavailable')).toBeInTheDocument()
    expect(screen.getAllByText('Unavailable')).toHaveLength(3)
  })

  it('explains restricted cluster inventory access and allows retrying', async () => {
    const user = userEvent.setup()
    setClusterQuery({
      data: undefined,
      error: { response: { status: 403 } },
    })

    render(<SettingsPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Cluster inventory unavailable')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Argo CD account does not have permission to view registered clusters.',
    )
    expect(screen.queryByRole('heading', { name: 'No clusters registered' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(mocks.refetchClusters).toHaveBeenCalledOnce()
  })

  it('links to the full cluster inventory', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: 'Manage clusters' }))
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/clusters' })
  })
})

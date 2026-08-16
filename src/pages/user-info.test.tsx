import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth, type AuthContextType } from '@/lib/auth'
import { useAccount } from '@/services/accounts'
import { UserInfoPage } from './user-info'

vi.mock('@/lib/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth')>()
  return { ...original, useAuth: vi.fn() }
})

vi.mock('@/services/accounts', () => ({ useAccount: vi.fn() }))

const mockUseAuth = vi.mocked(useAuth)
const mockUseAccount = vi.mocked(useAccount)
const refreshAuthentication = vi.fn()
const refetchAccount = vi.fn()

function auth(overrides: Partial<AuthContextType> = {}): AuthContextType {
  return {
    isAuthenticated: true,
    token: 'token',
    userInfo: { loggedIn: true, username: 'admin', iss: 'argocd', groups: [] },
    userInfoError: null,
    login: vi.fn(),
    startSsoLogin: vi.fn(),
    logout: vi.fn(),
    isLoading: false,
    authSettings: null,
    authSettingsError: null,
    refreshAuthentication,
    ...overrides,
  }
}

function accountQuery(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: refetchAccount,
    ...overrides,
  } as unknown as ReturnType<typeof useAccount>
}

describe('UserInfoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue(auth())
    mockUseAccount.mockReturnValue(accountQuery({
      data: {
        name: 'admin',
        enabled: true,
        capabilities: ['login', 'apiKey'],
        tokens: [],
      },
    }))
  })

  it('shows authoritative local admin account capabilities', () => {
    render(<UserInfoPage />)

    expect(screen.getAllByText('admin')).toHaveLength(2)
    expect(screen.getAllByText('argocd')).toHaveLength(2)
    expect(screen.getByText('Local Argo CD account')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
    expect(screen.getByText('login')).toBeInTheDocument()
    expect(screen.getByText('apiKey')).toBeInTheDocument()
    expect(screen.getByText('No groups reported by Argo CD')).toBeInTheDocument()

    expect(screen.queryByText('Administrator')).not.toBeInTheDocument()
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Production Token/)).not.toBeInTheDocument()
    expect(screen.queryByText('admin@cased.cd')).not.toBeInTheDocument()
    expect(mockUseAccount).toHaveBeenCalledWith('admin', true)
  })

  it('shows a non-admin local account without elevating its capabilities', () => {
    mockUseAuth.mockReturnValue(auth({
      userInfo: { loggedIn: true, username: 'dev-user', iss: 'argocd', groups: ['team-dev'] },
    }))
    mockUseAccount.mockReturnValue(accountQuery({
      data: {
        name: 'dev-user',
        enabled: true,
        capabilities: ['login'],
        tokens: [],
      },
    }))

    render(<UserInfoPage />)

    expect(screen.getAllByText('dev-user')).toHaveLength(2)
    expect(screen.getByText('team-dev')).toBeInTheDocument()
    expect(screen.getByText('login')).toBeInTheDocument()
    expect(screen.queryByText('apiKey')).not.toBeInTheDocument()
    expect(screen.queryByText('Administrator')).not.toBeInTheDocument()
  })

  it('shows an OIDC identity, issuer, and groups without local-account fields', () => {
    mockUseAuth.mockReturnValue(auth({
      token: null,
      userInfo: {
        loggedIn: true,
        username: 'oidc.user@example.com',
        iss: 'https://accounts.google.com',
        groups: ['developers', 'platform-readonly'],
      },
    }))
    mockUseAccount.mockReturnValue(accountQuery())

    render(<UserInfoPage />)

    expect(screen.getAllByText('oidc.user@example.com')).toHaveLength(2)
    expect(screen.getAllByText('https://accounts.google.com')).toHaveLength(2)
    expect(screen.getByText('External SSO identity')).toBeInTheDocument()
    expect(screen.getByText('developers')).toBeInTheDocument()
    expect(screen.getByText('platform-readonly')).toBeInTheDocument()
    expect(screen.getByText(/capabilities only for configured local accounts/)).toBeInTheDocument()
    expect(screen.queryByText('Enabled')).not.toBeInTheDocument()
    expect(mockUseAccount).toHaveBeenCalledWith('oidc.user@example.com', false)
  })

  it('handles identity loading and retryable errors', async () => {
    const { rerender } = render(<UserInfoPage />)
    mockUseAuth.mockReturnValue(auth({ isLoading: true, userInfo: null }))
    rerender(<UserInfoPage />)

    expect(screen.getByText('Loading identity from Argo CD...')).toBeInTheDocument()

    mockUseAuth.mockReturnValue(auth({
      userInfo: null,
      userInfoError: 'Unable to load the authenticated identity from Argo CD.',
    }))
    rerender(<UserInfoPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Identity unavailable')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshAuthentication).toHaveBeenCalledOnce()
  })
})

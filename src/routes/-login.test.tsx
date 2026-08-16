import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/lib/auth'
import { LoginPage } from './login'

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useSearch: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useSearch: routerMocks.useSearch,
  }),
  useNavigate: () => routerMocks.navigate,
}))

vi.mock('@/lib/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...original,
    useAuth: vi.fn(),
  }
})

const mockUseAuth = vi.mocked(useAuth)
const login = vi.fn()
const startSsoLogin = vi.fn()
const refreshAuthentication = vi.fn()

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    token: null,
    login,
    startSsoLogin,
    logout: vi.fn(),
    isLoading: false,
    authSettings: {
      oidcConfig: null,
      dexConfig: { connectors: [] },
      userLoginsDisabled: false,
    },
    authSettingsError: null,
    refreshAuthentication,
    ...overrides,
  })
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerMocks.useSearch.mockReturnValue({})
    mockAuth()
  })

  it('renders only Google SSO for an SSO-only installation', async () => {
    mockAuth({
      authSettings: {
        oidcConfig: { name: 'Google' },
        dexConfig: { connectors: [] },
        userLoginsDisabled: true,
      },
    })

    render(<LoginPage />)

    const button = screen.getByRole('button', { name: 'Sign in with Google' })
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()

    await userEvent.click(button)
    expect(startSsoLogin).toHaveBeenCalledWith('/applications')
  })

  it('renders both SSO and local login only when Argo CD enables both', () => {
    mockAuth({
      authSettings: {
        oidcConfig: { name: 'Google' },
        userLoginsDisabled: false,
      },
    })

    render(<LoginPage />)

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with username' })).toBeInTheDocument()
  })

  it('reports an Argo CD callback failure without starting a redirect loop', () => {
    routerMocks.useSearch.mockReturnValue({ has_sso_error: true })
    mockAuth({
      authSettings: {
        oidcConfig: { name: 'Google' },
        userLoginsDisabled: true,
      },
    })

    render(<LoginPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Single sign-on failed')
    expect(startSsoLogin).not.toHaveBeenCalled()
  })

  it('does not expose a password form when settings discovery fails', async () => {
    mockAuth({
      authSettings: null,
      authSettingsError: 'Unable to load authentication options from Argo CD.',
    })

    render(<LoginPage />)

    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load authentication options')

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshAuthentication).toHaveBeenCalledOnce()
  })

  it('submits local credentials and navigates after a successful login', async () => {
    login.mockResolvedValue(undefined)
    routerMocks.navigate.mockResolvedValue(undefined)

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Username'), 'admin')
    await userEvent.type(screen.getByLabelText('Password'), 'demo')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with username' }))

    expect(login).toHaveBeenCalledWith('admin', 'demo')
    expect(routerMocks.navigate).toHaveBeenCalledWith({ to: '/applications' })
  })
})

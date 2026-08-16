import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import api from './api-client'
import {
  AuthProvider,
  buildSsoLoginUrl,
  getSsoLoginLabel,
  normalizeAuthReturnUrl,
  useAuth,
} from './auth'

vi.mock('./api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)

function AuthProbe() {
  const auth = useAuth()

  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="provider">{auth.authSettings?.oidcConfig?.name ?? 'none'}</span>
      <span data-testid="username">{auth.userInfo?.username ?? 'none'}</span>
      <span data-testid="identity-error">{auth.userInfoError ?? 'none'}</span>
      <button type="button" onClick={() => void auth.login('admin', 'demo')}>Local login</button>
      <button type="button" onClick={auth.logout}>Logout</button>
    </div>
  )
}

describe('authentication', () => {
  const originalLocation = window.location
  const assign = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Partial<Location> }).location = {
      ...originalLocation,
      origin: 'http://localhost:3000',
      assign,
    }
  })

  afterAll(() => {
    ;(window as unknown as { location: Location }).location = originalLocation
  })

  it('discovers an existing Argo CD SSO cookie session', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: {
            oidcConfig: { name: 'Google' },
            dexConfig: { connectors: [] },
            userLoginsDisabled: true,
          },
          status: 200,
        } as never)
      }

      return Promise.resolve({
        data: {
          loggedIn: true,
          username: 'oidc.user@example.com',
          iss: 'https://accounts.google.com',
          groups: ['developers'],
        },
        status: 200,
      } as never)
    })

    render(<AuthProvider><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('provider')).toHaveTextContent('Google')
    expect(screen.getByTestId('username')).toHaveTextContent('oidc.user@example.com')
    expect(mockGet).toHaveBeenCalledWith('/session/userinfo', expect.objectContaining({
      validateStatus: expect.any(Function),
    }))
  })

  it('keeps an unauthenticated SSO-only installation logged out', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { oidcConfig: { name: 'Google' }, userLoginsDisabled: true },
          status: 200,
        } as never)
      }

      return Promise.resolve({
        data: localStorage.getItem('argocd_token')
          ? { loggedIn: true, username: 'admin', iss: 'argocd', groups: [] }
          : { loggedIn: false },
        status: 200,
      } as never)
    })

    render(<AuthProvider><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('retains username and password login support when Argo CD enables it', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { oidcConfig: null, userLoginsDisabled: false },
          status: 200,
        } as never)
      }

      return Promise.resolve({
        data: localStorage.getItem('argocd_token')
          ? { loggedIn: true, username: 'admin', iss: 'argocd', groups: [] }
          : { loggedIn: false },
        status: 200,
      } as never)
    })
    mockPost.mockResolvedValue({ data: { token: 'local-token' } } as never)

    render(<AuthProvider><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))

    fireEvent.click(screen.getByRole('button', { name: 'Local login' }))

    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'))
    expect(localStorage.getItem('argocd_token')).toBe('local-token')
    expect(screen.getByTestId('username')).toHaveTextContent('admin')
  })

  it('clears local state and delegates logout to Argo CD', async () => {
    localStorage.setItem('argocd_token', 'local-token')
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { oidcConfig: null, userLoginsDisabled: false },
          status: 200,
        } as never)
      }

      return Promise.resolve({
        data: { loggedIn: true, username: 'admin', iss: 'argocd', groups: [] },
        status: 200,
      } as never)
    })

    render(<AuthProvider><AuthProbe /></AuthProvider>)
    await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'))

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(localStorage.getItem('argocd_token')).toBeNull()
    expect(assign).toHaveBeenCalledWith('/auth/logout')
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
  })

  it('preserves a local session and reports a retryable identity discovery error', async () => {
    localStorage.setItem('argocd_token', 'local-token')
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { oidcConfig: null, userLoginsDisabled: false },
          status: 200,
        } as never)
      }

      return Promise.reject(new Error('network unavailable'))
    })

    render(<AuthProvider><AuthProbe /></AuthProvider>)

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true')
    expect(screen.getByTestId('username')).toHaveTextContent('none')
    expect(screen.getByTestId('identity-error')).toHaveTextContent('Unable to load')
    expect(localStorage.getItem('argocd_token')).toBe('local-token')
  })

  it('builds same-origin SSO redirects and rejects redirect loops or external URLs', () => {
    expect(normalizeAuthReturnUrl('/applications?project=default', 'https://cd.example.com'))
      .toBe('/applications?project=default')
    expect(normalizeAuthReturnUrl('https://evil.example/phish', 'https://cd.example.com'))
      .toBe('/applications')
    expect(normalizeAuthReturnUrl('/auth/callback', 'https://cd.example.com'))
      .toBe('/applications')
    expect(buildSsoLoginUrl('/applications'))
      .toBe('/auth/login?return_url=http%3A%2F%2Flocalhost%3A3000%2Fapplications')
  })

  it('uses a clear Google label without exposing provider configuration', () => {
    expect(getSsoLoginLabel({ oidcConfig: { name: 'Google' } })).toBe('Sign in with Google')
    expect(getSsoLoginLabel({
      oidcConfig: { name: 'Google' },
      uiLoginButtonText: 'Company SSO',
    })).toBe('Company SSO')
  })
})

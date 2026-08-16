import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import api from './api-client'
import { AuthProvider, useAuth } from './auth'
import { QueryProvider, queryClient } from './query-client'

vi.mock('./api-client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockGet = vi.mocked(api.get)
const mockPost = vi.mocked(api.post)

const identity = {
  current: {
    loggedIn: true,
    username: 'user-a',
    iss: 'argocd',
    groups: ['team-a'],
  },
}

function ApplicationsProbe() {
  const applications = useQuery<{ metadata: { name: string } }[]>({
    queryKey: ['applications'],
    queryFn: async () => [],
    enabled: false,
  })

  return applications.data?.map((application) => application.metadata.name).join(',') || 'none'
}

function SessionCacheProbe() {
  const auth = useAuth()

  return (
    <div>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="username">{auth.userInfo?.username || 'none'}</span>
      <span data-testid="applications">
        {auth.isAuthenticated ? <ApplicationsProbe /> : 'none'}
      </span>
      <button type="button" onClick={() => void auth.login('user-b', 'demo')}>
        Login user B
      </button>
      <button type="button" onClick={() => void auth.refreshAuthentication()}>
        Refresh identity
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Logout
      </button>
    </div>
  )
}

describe('authentication query cache boundaries', () => {
  const originalLocation = window.location
  const assign = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    queryClient.clear()
    localStorage.clear()
    sessionStorage.clear()
    assign.mockReset()
    identity.current = {
      loggedIn: true,
      username: 'user-a',
      iss: 'argocd',
      groups: ['team-a'],
    }
    delete (window as unknown as { location?: Location }).location
    ;(window as unknown as { location: Partial<Location> }).location = {
      ...originalLocation,
      origin: 'http://localhost:3000',
      assign,
    }
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { oidcConfig: null, userLoginsDisabled: false },
          status: 200,
        } as never)
      }

      return Promise.resolve({ data: { ...identity.current }, status: 200 } as never)
    })
    mockPost.mockResolvedValue({ data: { token: 'user-b-token' } } as never)
  })

  afterAll(() => {
    ;(window as unknown as { location: Location }).location = originalLocation
  })

  it('cancels and removes user A data before logout navigation or user B login', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <SessionCacheProbe />
        </AuthProvider>
      </QueryProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('user-a'))

    act(() => {
      queryClient.setQueryData(['applications'], [
        { metadata: { name: 'user-a-private-app' } },
      ])
    })
    await waitFor(() => {
      expect(screen.getByTestId('applications')).toHaveTextContent('user-a-private-app')
    })

    let finishCancellation: (() => void) | undefined
    const cancellation = new Promise<void>((resolve) => {
      finishCancellation = resolve
    })
    vi.spyOn(queryClient, 'cancelQueries').mockReturnValueOnce(cancellation)

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))

    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByTestId('applications')).toHaveTextContent('none')
    expect(queryClient.getQueryData(['applications'])).toBeDefined()

    finishCancellation?.()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/auth/logout'))
    expect(queryClient.getQueryData(['applications'])).toBeUndefined()

    identity.current = {
      loggedIn: true,
      username: 'user-b',
      iss: 'argocd',
      groups: ['team-b'],
    }
    fireEvent.click(screen.getByRole('button', { name: 'Login user B' }))

    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('user-b'))
    expect(screen.getByTestId('applications')).toHaveTextContent('none')
    expect(queryClient.getQueryData(['applications'])).toBeUndefined()
  })

  it('clears cached RBAC data before exposing a changed discovered identity', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <SessionCacheProbe />
        </AuthProvider>
      </QueryProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('user-a'))
    act(() => {
      queryClient.setQueryData(['applications'], [
        { metadata: { name: 'team-a-only' } },
      ])
    })

    identity.current = {
      loggedIn: true,
      username: 'user-b',
      iss: 'argocd',
      groups: ['team-b'],
    }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh identity' }))

    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('user-b'))
    expect(screen.getByTestId('applications')).toHaveTextContent('none')
    expect(queryClient.getQueryData(['applications'])).toBeUndefined()
  })

  it('does not restore an identity refresh that finishes after logout', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <SessionCacheProbe />
        </AuthProvider>
      </QueryProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('user-a'))

    let finishIdentityRequest: ((value: unknown) => void) | undefined
    const identityRequest = new Promise((resolve) => {
      finishIdentityRequest = resolve
    })
    mockGet.mockImplementation((url) => {
      if (url === '/settings') {
        return Promise.resolve({ data: { oidcConfig: null }, status: 200 } as never)
      }
      return identityRequest as never
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh identity' }))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('true'))
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/auth/logout'))

    finishIdentityRequest?.({
      data: {
        loggedIn: true,
        username: 'stale-user-b',
        iss: 'argocd',
        groups: ['team-b'],
      },
      status: 200,
    })

    await act(async () => {
      await identityRequest
    })
    expect(screen.getByTestId('username')).toHaveTextContent('none')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
})

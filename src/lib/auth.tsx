import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import api from './api-client'
import { clearStoredAuthToken, getStoredAuthToken, storeAuthToken } from './auth-token'
import { clearAuthenticatedQueryState } from './query-client'
import type { SessionInfo } from '@/types/api'

const DEFAULT_AUTHENTICATED_PATH = '/applications'

export interface ArgoCDAuthSettings {
  dexConfig?: {
    connectors?: Array<{
      name?: string
      type?: string
    }>
  }
  oidcConfig?: {
    name?: string
  } | null
  userLoginsDisabled?: boolean
  uiLoginButtonText?: string
}

export type ArgoCDUserInfo = SessionInfo

type AuthenticationMethod = 'local' | 'sso' | null

export interface AuthContextType {
  isAuthenticated: boolean
  token: string | null
  userInfo: ArgoCDUserInfo | null
  userInfoError: string | null
  login: (username: string, password: string) => Promise<void>
  startSsoLogin: (returnUrl?: string) => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
  authSettings: ArgoCDAuthSettings | null
  authSettingsError: string | null
  refreshAuthentication: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function isSsoConfigured(settings: ArgoCDAuthSettings | null): boolean {
  if (!settings) return false

  return Boolean(
    settings.oidcConfig ||
      (settings.dexConfig?.connectors && settings.dexConfig.connectors.length > 0),
  )
}

export function getSsoLoginLabel(settings: ArgoCDAuthSettings): string {
  if (settings.uiLoginButtonText) return settings.uiLoginButtonText

  const connectors = settings.dexConfig?.connectors ?? []
  const providerName = settings.oidcConfig?.name ||
    (connectors.length === 1 ? connectors[0]?.name : undefined)

  if (providerName?.toLowerCase().includes('google')) {
    return 'Sign in with Google'
  }

  return providerName ? `Sign in with ${providerName}` : 'Sign in with SSO'
}

export function normalizeAuthReturnUrl(
  returnUrl: string | undefined,
  origin = window.location.origin,
): string {
  if (!returnUrl) return DEFAULT_AUTHENTICATED_PATH

  try {
    const url = new URL(returnUrl, origin)
    if (url.origin !== origin) return DEFAULT_AUTHENTICATED_PATH

    const path = `${url.pathname}${url.search}${url.hash}`
    if (url.pathname === '/login' || url.pathname.startsWith('/auth/')) {
      return DEFAULT_AUTHENTICATED_PATH
    }

    return path || DEFAULT_AUTHENTICATED_PATH
  } catch {
    return DEFAULT_AUTHENTICATED_PATH
  }
}

export function buildSsoLoginUrl(returnUrl?: string): string {
  const safeReturnUrl = normalizeAuthReturnUrl(returnUrl)
  const absoluteReturnUrl = new URL(safeReturnUrl, window.location.origin).href
  return `/auth/login?return_url=${encodeURIComponent(absoluteReturnUrl)}`
}

export function getAuthenticationPrincipal(userInfo: ArgoCDUserInfo | null): string | null {
  if (!userInfo?.loggedIn) return null

  return JSON.stringify([
    userInfo.iss || '',
    userInfo.username || '',
    [...(userInfo.groups || [])].sort(),
  ])
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const cachePrincipal = useRef<string | null | undefined>(undefined)
  const authenticationAttempt = useRef(0)
  const [token, setToken] = useState<string | null>(null)
  const [authenticationMethod, setAuthenticationMethod] = useState<AuthenticationMethod>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authSettings, setAuthSettings] = useState<ArgoCDAuthSettings | null>(null)
  const [authSettingsError, setAuthSettingsError] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<ArgoCDUserInfo | null>(null)
  const [userInfoError, setUserInfoError] = useState<string | null>(null)

  const transitionCachePrincipal = useCallback(async (nextPrincipal: string | null) => {
    if (cachePrincipal.current === nextPrincipal) return

    // Set the target first so React Strict Mode or overlapping discovery calls
    // cannot start duplicate cache transitions for the same identity.
    cachePrincipal.current = nextPrincipal
    await clearAuthenticatedQueryState(queryClient)
  }, [queryClient])

  const refreshAuthentication = useCallback(async () => {
    const attempt = ++authenticationAttempt.current
    setIsLoading(true)
    setAuthSettingsError(null)
    setUserInfoError(null)

    if (cachePrincipal.current === undefined) {
      await transitionCachePrincipal(null)
    }

    const storedToken = getStoredAuthToken()
    const settingsRequest = api.get<ArgoCDAuthSettings>('/settings')
    const userInfoRequest = api.get<ArgoCDUserInfo>('/session/userinfo', {
      // An unauthenticated response is expected during session discovery and
      // must not trigger the API client's global 401 redirect.
      validateStatus: (status) => [200, 401, 403].includes(status),
    })

    const [settingsResult, userInfoResult] = await Promise.allSettled([
      settingsRequest,
      userInfoRequest,
    ])

    if (attempt !== authenticationAttempt.current) return

    if (settingsResult.status === 'fulfilled') {
      setAuthSettings(settingsResult.value.data)
    } else {
      setAuthSettings(null)
      setAuthSettingsError('Unable to load authentication options from Argo CD.')
    }

    if (
      userInfoResult.status === 'fulfilled' &&
      userInfoResult.value.status === 200 &&
      userInfoResult.value.data.loggedIn
    ) {
      const nextUserInfo = {
        ...userInfoResult.value.data,
        groups: userInfoResult.value.data.groups ?? [],
      }
      await transitionCachePrincipal(getAuthenticationPrincipal(nextUserInfo))
      if (attempt !== authenticationAttempt.current) return
      setUserInfo(nextUserInfo)
      setToken(storedToken)
      setAuthenticationMethod(storedToken ? 'local' : 'sso')
    } else if (userInfoResult.status === 'rejected') {
      setUserInfo(null)
      setUserInfoError('Unable to load the authenticated identity from Argo CD.')

      // Preserve a locally stored session during a transient network failure so
      // the identity view can offer a retry instead of fabricating user data.
      setToken(storedToken)
      setAuthenticationMethod(storedToken ? 'local' : null)
    } else {
      if (storedToken) clearStoredAuthToken()
      await transitionCachePrincipal(null)
      if (attempt !== authenticationAttempt.current) return
      setUserInfo(null)
      setToken(null)
      setAuthenticationMethod(null)
    }

    setIsLoading(false)
  }, [transitionCachePrincipal])

  useEffect(() => {
    void refreshAuthentication()
  }, [refreshAuthentication])

  const login = async (username: string, password: string) => {
    const attempt = ++authenticationAttempt.current
    cachePrincipal.current = null
    await clearAuthenticatedQueryState(queryClient)
    if (attempt !== authenticationAttempt.current) return

    const response = await api.post<{ token: string }>('/session', {
      username,
      password,
    })

    if (attempt !== authenticationAttempt.current) return

    const newToken = response.data.token
    storeAuthToken(newToken)
    await refreshAuthentication()
  }

  const startSsoLogin = async (returnUrl?: string) => {
    const attempt = ++authenticationAttempt.current
    cachePrincipal.current = null
    await clearAuthenticatedQueryState(queryClient)
    if (attempt !== authenticationAttempt.current) return
    window.location.assign(buildSsoLoginUrl(returnUrl))
  }

  const logout = async () => {
    const attempt = ++authenticationAttempt.current
    clearStoredAuthToken()
    setToken(null)
    setUserInfo(null)
    setUserInfoError(null)
    setAuthenticationMethod(null)
    setIsLoading(false)
    cachePrincipal.current = null

    await clearAuthenticatedQueryState(queryClient)
    if (attempt !== authenticationAttempt.current) return

    // Argo CD owns cookie removal, token revocation, and any configured OIDC
    // provider logout redirect. This route also handles local UI sessions.
    window.location.assign('/auth/logout')
  }

  const value: AuthContextType = {
    isAuthenticated: authenticationMethod !== null,
    token,
    userInfo,
    userInfoError,
    login,
    startSsoLogin,
    logout,
    isLoading,
    authSettings,
    authSettingsError,
    refreshAuthentication,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-black">
      <div className="text-center">
        <div className="h-8 w-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-neutral-400">Loading...</p>
      </div>
    </div>
  )
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import api from './api-client'

const AUTH_TOKEN_STORAGE_KEY = 'argocd_token'
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

interface ArgoCDUserInfo {
  loggedIn: boolean
}

type AuthenticationMethod = 'local' | 'sso' | null

interface AuthContextType {
  isAuthenticated: boolean
  token: string | null
  login: (username: string, password: string) => Promise<void>
  startSsoLogin: (returnUrl?: string) => void
  logout: () => void
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [authenticationMethod, setAuthenticationMethod] = useState<AuthenticationMethod>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [authSettings, setAuthSettings] = useState<ArgoCDAuthSettings | null>(null)
  const [authSettingsError, setAuthSettingsError] = useState<string | null>(null)

  const refreshAuthentication = useCallback(async () => {
    setIsLoading(true)
    setAuthSettingsError(null)

    const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
    const settingsRequest = api.get<ArgoCDAuthSettings>('/settings')
    const userInfoRequest = storedToken
      ? Promise.resolve(null)
      : api.get<ArgoCDUserInfo>('/session/userinfo', {
          // An unauthenticated response is expected during session discovery and
          // must not trigger the API client's global 401 redirect.
          validateStatus: (status) => [200, 401, 403].includes(status),
        })

    const [settingsResult, userInfoResult] = await Promise.allSettled([
      settingsRequest,
      userInfoRequest,
    ])

    if (settingsResult.status === 'fulfilled') {
      setAuthSettings(settingsResult.value.data)
    } else {
      setAuthSettings(null)
      setAuthSettingsError('Unable to load authentication options from Argo CD.')
    }

    if (storedToken) {
      setToken(storedToken)
      setAuthenticationMethod('local')
    } else if (
      userInfoResult.status === 'fulfilled' &&
      userInfoResult.value?.status === 200 &&
      userInfoResult.value.data.loggedIn
    ) {
      setToken(null)
      setAuthenticationMethod('sso')
    } else {
      setToken(null)
      setAuthenticationMethod(null)
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    void refreshAuthentication()
  }, [refreshAuthentication])

  const login = async (username: string, password: string) => {
    const response = await api.post<{ token: string }>('/session', {
      username,
      password,
    })

    const newToken = response.data.token
    localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, newToken)
    setToken(newToken)
    setAuthenticationMethod('local')
  }

  const startSsoLogin = (returnUrl?: string) => {
    window.location.assign(buildSsoLoginUrl(returnUrl))
  }

  const logout = () => {
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    setToken(null)
    setAuthenticationMethod(null)

    // Argo CD owns cookie removal, token revocation, and any configured OIDC
    // provider logout redirect. This route also handles local UI sessions.
    window.location.assign('/auth/logout')
  }

  const value = useMemo<AuthContextType>(() => ({
    isAuthenticated: authenticationMethod !== null,
    token,
    login,
    startSsoLogin,
    logout,
    isLoading,
    authSettings,
    authSettingsError,
    refreshAuthentication,
  }), [
    authenticationMethod,
    token,
    isLoading,
    authSettings,
    authSettingsError,
    refreshAuthentication,
  ])

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

const AUTH_TOKEN_STORAGE_KEY = 'argocd_token'

/**
 * Return the local-login token for this browser tab. Older releases persisted
 * this bearer credential in localStorage; migrate it once, then remove the
 * durable copy so closing the tab ends its exposure window.
 */
export function getStoredAuthToken(): string | null {
  const sessionToken = sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (sessionToken) return sessionToken

  const legacyToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (!legacyToken) return null

  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, legacyToken)
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  return legacyToken
}

export function storeAuthToken(token: string): void {
  sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

export function clearStoredAuthToken(): void {
  sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

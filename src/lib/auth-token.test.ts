import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredAuthToken,
  getStoredAuthToken,
  storeAuthToken,
} from './auth-token'

describe('local-login token storage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('stores bearer credentials only for the current tab session', () => {
    storeAuthToken('session-token')

    expect(sessionStorage.getItem('argocd_token')).toBe('session-token')
    expect(localStorage.getItem('argocd_token')).toBeNull()
    expect(getStoredAuthToken()).toBe('session-token')
  })

  it('migrates and deletes a legacy persistent token', () => {
    localStorage.setItem('argocd_token', 'legacy-token')

    expect(getStoredAuthToken()).toBe('legacy-token')
    expect(sessionStorage.getItem('argocd_token')).toBe('legacy-token')
    expect(localStorage.getItem('argocd_token')).toBeNull()
  })

  it('clears both current and legacy storage', () => {
    sessionStorage.setItem('argocd_token', 'session-token')
    localStorage.setItem('argocd_token', 'legacy-token')

    clearStoredAuthToken()

    expect(sessionStorage.getItem('argocd_token')).toBeNull()
    expect(localStorage.getItem('argocd_token')).toBeNull()
  })
})

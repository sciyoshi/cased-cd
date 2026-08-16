import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { IconCircleWarning, IconSpinnerBall } from 'obra-icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getSsoLoginLabel,
  isSsoConfigured,
  normalizeAuthReturnUrl,
  useAuth,
} from '@/lib/auth'

interface LoginSearch {
  redirect?: string
  return_url?: string
  has_sso_error?: boolean
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
    return_url: typeof search.return_url === 'string' ? search.return_url : undefined,
    has_sso_error: search.has_sso_error === true || search.has_sso_error === 'true',
  }),
  component: LoginPage,
})

export function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const {
    authSettings,
    authSettingsError,
    isAuthenticated,
    isLoading,
    login,
    refreshAuthentication,
    startSsoLogin,
    userInfoError,
  } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const returnUrl = normalizeAuthReturnUrl(search.redirect || search.return_url)
  const ssoConfigured = isSsoConfigured(authSettings)
  const localLoginEnabled = Boolean(authSettings && !authSettings.userLoginsDisabled)

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.replace(returnUrl)
    }
  }, [isAuthenticated, isLoading, returnUrl])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(username, password)
      await navigate({ to: '/applications' })
    } catch (err) {
      if (err instanceof Error && 'response' in err) {
        const response = err.response as { status?: number; data?: { error?: string } }

        if (response?.status === 429) {
          setError('Too many login attempts. Please wait a minute and try again.')
        } else {
          setError(response?.data?.error || err.message || 'Login failed')
        }
      } else {
        setError(err instanceof Error ? err.message : 'Login failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-blue-800 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="mb-12">
            <img src="/cased-logo.svg" alt="Cased CD" className="h-18 w-auto" />
          </div>
          <p className="text-xl text-blue-100">
            Modern GitOps deployment platform powered by ArgoCD
          </p>
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-white" />
              <span className="text-blue-50">Continuous Deployment</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-white" />
              <span className="text-blue-50">GitOps Automation</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-white" />
              <span className="text-blue-50">Deployment Intelligence</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-lg">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-neutral-900 mb-2">Welcome back</h2>
              <p className="text-sm text-neutral-600">Sign in to your account to continue</p>
            </div>

            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-600">
                <IconSpinnerBall size={18} className="animate-spin" />
                Loading authentication options...
              </div>
            )}

            {!isLoading && authSettingsError && (
              <div className="space-y-4">
                <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <IconCircleWarning size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-700">{authSettingsError}</p>
                  </div>
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => void refreshAuthentication()}>
                  Try again
                </Button>
              </div>
            )}

            {!isLoading && !authSettingsError && authSettings && (
              <div className="space-y-6">
                {userInfoError && (
                  <div role="alert" className="rounded-lg border border-amber-600/30 bg-amber-500/10 p-4">
                    <p className="text-sm text-amber-800 dark:text-amber-300">
                      {userInfoError} You can retry session discovery or sign in again.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => void refreshAuthentication()}
                    >
                      Retry session check
                    </Button>
                  </div>
                )}

                {ssoConfigured && (
                  <div className="space-y-4">
                    <Button
                      type="button"
                      variant="default"
                      className="w-full bg-blue-700 text-white hover:bg-blue-800"
                      onClick={() => void startSsoLogin(returnUrl)}
                    >
                      {getSsoLoginLabel(authSettings)}
                    </Button>
                    {search.has_sso_error && (
                      <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700">
                        Single sign-on failed. Please try again or contact your administrator.
                      </div>
                    )}
                    {localLoginEnabled && (
                      <div className="flex items-center gap-3" aria-hidden="true">
                        <div className="h-px flex-1 bg-neutral-200" />
                        <span className="text-xs uppercase tracking-wide text-neutral-500">or</span>
                        <div className="h-px flex-1 bg-neutral-200" />
                      </div>
                    )}
                  </div>
                )}

                {localLoginEnabled && (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-neutral-700 mb-2">
                        Username
                      </label>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="admin"
                        required
                        autoComplete="username"
                        autoFocus={!ssoConfigured}
                        disabled={isSubmitting}
                        className="bg-white text-neutral-900"
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-2">
                        Password
                      </label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        className="bg-white text-neutral-900"
                      />
                    </div>

                    {error && (
                      <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                        <div className="flex items-start gap-3">
                          <IconCircleWarning size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-red-700">{error}</p>
                        </div>
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="default"
                      disabled={isSubmitting}
                      className="w-full gap-2 bg-blue-700 text-white hover:bg-blue-800"
                    >
                      {isSubmitting && <IconSpinnerBall size={16} className="animate-spin" />}
                      {isSubmitting ? 'Signing in...' : 'Sign in with username'}
                    </Button>
                  </form>
                )}

                {authSettings.userLoginsDisabled && !ssoConfigured && (
                  <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700">
                    Login is disabled. Please contact your administrator.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs text-neutral-500">
              Powered by ArgoCD • Built by Cased
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <span className="text-xs text-neutral-600">
                v{import.meta.env.PACKAGE_VERSION || '0.1.15'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
                {import.meta.env.VITE_IS_ENTERPRISE === 'true' ? 'Enterprise Edition' : 'Community Edition'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

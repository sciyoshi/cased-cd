import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from '@/pages/login'

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

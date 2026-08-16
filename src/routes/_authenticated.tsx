import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { Layout } from '@/components/layout/layout'
import { AuthLoading, useAuth } from '@/lib/auth'

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({
        to: '/login',
        search: {
          redirect: window.location.href,
        },
        replace: true,
      })
    }
  }, [isAuthenticated, isLoading, navigate])

  if (isLoading) return <AuthLoading />
  if (!isAuthenticated) return null

  return <Layout />
}

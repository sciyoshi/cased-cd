import { createRootRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { ThemeProvider } from '@/lib/theme'
import { QueryProvider } from '@/lib/query-client'
import { AuthProvider } from '@/lib/auth'
import { Toaster } from '@/components/ui/sonner'

const RouterDevtools = import.meta.env.DEV
  ? lazy(async () => {
      const { TanStackRouterDevtools } = await import('@tanstack/router-devtools')
      return { default: TanStackRouterDevtools }
    })
  : null

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster />
          {RouterDevtools && (
            <Suspense fallback={null}>
              <RouterDevtools />
            </Suspense>
          )}
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  )
}

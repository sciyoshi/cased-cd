import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'

// Query client configuration
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      refetchOnWindowFocus: false,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      // A lost response does not prove a write failed server-side. Retrying
      // creates, deletes, syncs, rollbacks, and live patches can repeat the
      // operation, so mutations must opt in only when they provide their own
      // idempotency guarantee.
      retry: false,
    },
  },
})

/**
 * End an authenticated cache lifetime without allowing canceled requests to
 * repopulate data after the cache has been removed.
 */
export async function clearAuthenticatedQueryState(
  client: QueryClient = queryClient,
): Promise<void> {
  try {
    await client.cancelQueries()
  } catch {
    // Clearing is the security boundary. A cancellation implementation must
    // not prevent cached data removal or the caller's logout/redirect.
  } finally {
    client.clear()
  }
}

// Query provider component
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

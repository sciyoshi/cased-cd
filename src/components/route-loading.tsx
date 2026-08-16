import { LoadingSpinner } from '@/components/ui/loading-spinner'

export function RouteLoading() {
  return (
    <div
      className="flex min-h-48 items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner />
      <span className="sr-only">Loading page…</span>
    </div>
  )
}

import { lazy, Suspense } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import type { ResourceDetailsPanelProps } from '@/components/resource-details-panel'

const ResourceDetailsPanel = lazy(async () => {
  const module = await import('@/components/resource-details-panel')
  return { default: module.ResourceDetailsPanel }
})

export function LazyResourceDetailsPanel(props: ResourceDetailsPanelProps) {
  return (
    <Suspense
      fallback={
        <aside
          className="fixed inset-y-0 right-0 z-50 w-full max-w-[600px] border-l border-border bg-card shadow-2xl"
          role="status"
          aria-live="polite"
        >
          <LoadingSpinner message="Loading resource details…" size="lg" />
        </aside>
      }
    >
      <ResourceDetailsPanel {...props} />
    </Suspense>
  )
}

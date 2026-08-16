import { createFileRoute } from '@tanstack/react-router'
import { ApplicationDetailLayout } from '@/components/application-detail-layout'

export interface ApplicationDetailSearch {
  appNamespace?: string
}

export const Route = createFileRoute('/_authenticated/applications/$name')({
  validateSearch: (search: Record<string, unknown>): ApplicationDetailSearch => ({
    appNamespace:
      typeof search.appNamespace === 'string' && search.appNamespace.trim().length > 0
        ? search.appNamespace
        : undefined,
  }),
  component: ApplicationDetailLayout,
})

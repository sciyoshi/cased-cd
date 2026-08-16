import { createFileRoute } from '@tanstack/react-router'
import { useManagedResources, useApplication } from '@/services/applications'
import { ResourceDiffPanel } from '@/components/resource-diff-panel'

export const Route = createFileRoute('/_authenticated/applications/$name/diff')({
  component: DiffPage,
})

function DiffPage() {
  const { name } = Route.useParams()
  const { appNamespace } = Route.useSearch()
  const { data: managedResourcesData, isLoading: isLoadingResources } = useManagedResources(
    name || '',
    true,
    appNamespace,
  )
  const { data: applicationData, isLoading: isLoadingApp } = useApplication(
    name || '',
    true,
    appNamespace,
  )

  const resources = managedResourcesData?.items || []
  const resourceStatuses = applicationData?.status?.resources || []

  return (
    <div className="h-full">
      <ResourceDiffPanel
        resources={resources}
        resourceStatuses={resourceStatuses}
        isLoading={isLoadingResources || isLoadingApp}
      />
    </div>
  )
}

import { lazy, Suspense, useState } from 'react'
import {
  IconSearch,
  IconAdd,
  IconCircleForward,
  IconGrid,
  IconTable,
} from 'obra-icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useApplications,
  useRefreshApplication,
  useSyncApplication,
} from '@/services/applications'
import { ErrorAlert } from '@/components/ui/error-alert'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { ApplicationCard } from '@/components/-applications/application-card'
import { ApplicationTable } from '@/components/-applications/application-table'
import { PageHeader } from '@/components/ui/page-header'
import { PageContent } from '@/components/ui/page-content'
import { useDebounce } from '@/hooks/useDebounce'
import type { Application, HealthStatus, SyncStatus } from '@/types/api'

const CreateApplicationPanel = lazy(async () => {
  const module = await import('@/components/create-application-panel')
  return { default: module.CreateApplicationPanel }
})

type ApplicationView = 'cards' | 'table'
type ApplicationStateFilter =
  | 'all'
  | `health:${HealthStatus}`
  | `sync:${SyncStatus}`

const APPLICATION_VIEW_STORAGE_KEY = 'cased_cd_applications_view'
const ALL_FILTER_VALUE = 'all'
const UNKNOWN_CLUSTER = 'Unknown cluster'
const HEALTH_STATES: HealthStatus[] = [
  'Healthy',
  'Progressing',
  'Degraded',
  'Suspended',
  'Missing',
  'Unknown',
]
const SYNC_STATES: SyncStatus[] = ['Synced', 'OutOfSync', 'Unknown']

function getApplicationCluster(app: Application) {
  return (
    app.spec.destination.name ||
    app.spec.destination.server ||
    UNKNOWN_CLUSTER
  )
}

function matchesState(
  app: Application,
  stateFilter: ApplicationStateFilter,
) {
  if (stateFilter === ALL_FILTER_VALUE) return true

  const [stateType, state] = stateFilter.split(':')
  if (stateType === 'health') {
    return (app.status?.health?.status || 'Unknown') === state
  }

  return (app.status?.sync?.status || 'Unknown') === state
}

export function ApplicationsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [clusterFilter, setClusterFilter] = useState(ALL_FILTER_VALUE)
  const [namespaceFilter, setNamespaceFilter] = useState(ALL_FILTER_VALUE)
  const [stateFilter, setStateFilter] =
    useState<ApplicationStateFilter>(ALL_FILTER_VALUE)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [view, setView] = useState<ApplicationView>(() =>
    localStorage.getItem(APPLICATION_VIEW_STORAGE_KEY) === 'table'
      ? 'table'
      : 'cards',
  )
  const { data, isLoading, error, refetch } = useApplications()
  const refreshMutation = useRefreshApplication()
  const syncMutation = useSyncApplication()

  // Debounce search to avoid excessive filtering on every keystroke
  const debouncedSearch = useDebounce(searchQuery, 300)

  const applications = data?.items || []
  const clusterOptions = Array.from(
    new Set(applications.map(getApplicationCluster)),
  ).sort((a, b) => a.localeCompare(b))
  const namespaceOptions = Array.from(
    new Set(
      applications.map((app) => app.spec.destination.namespace || 'default'),
    ),
  ).sort((a, b) => a.localeCompare(b))

  // Apply search and selected filters together on the loaded application list.
  const filteredApps =
    applications.filter((app) => {
      const matchesSearch = app.metadata.name
        .toLowerCase()
        .includes(debouncedSearch.toLowerCase())
      const matchesCluster =
        clusterFilter === ALL_FILTER_VALUE ||
        getApplicationCluster(app) === clusterFilter
      const matchesNamespace =
        namespaceFilter === ALL_FILTER_VALUE ||
        (app.spec.destination.namespace || 'default') === namespaceFilter

      return (
        matchesSearch &&
        matchesCluster &&
        matchesNamespace &&
        matchesState(app, stateFilter)
      )
    })

  const hasActiveFilters =
    searchQuery.length > 0 ||
    clusterFilter !== ALL_FILTER_VALUE ||
    namespaceFilter !== ALL_FILTER_VALUE ||
    stateFilter !== ALL_FILTER_VALUE

  const handleRefresh = async (name: string, appNamespace?: string) => {
    await refreshMutation.mutateAsync({ name, appNamespace })
    // No need to manually refetch - React Query invalidation handles it
  }

  const handleSync = async (name: string, appNamespace?: string) => {
    try {
      await syncMutation.mutateAsync({ name, appNamespace, prune: true })
      // No need to manually refetch - React Query invalidation + polling handles it
    } catch (error) {
      console.error('Sync failed:', error)
    }
  }

  const handleViewChange = (nextView: ApplicationView) => {
    setView(nextView)
    localStorage.setItem(APPLICATION_VIEW_STORAGE_KEY, nextView)
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Applications"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <IconCircleForward
                size={16}
                className={isLoading ? 'animate-spin' : ''}
              />
              Refresh
            </Button>
            <Button variant="default" onClick={() => setShowCreatePanel(true)}>
              <IconAdd size={16} />
              New Application
            </Button>
          </>
        }
      />

      {/* Content */}
      <PageContent>
        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <IconSearch
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <Input
              placeholder="Search applications..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={clusterFilter} onValueChange={setClusterFilter}>
            <SelectTrigger
              className="h-8 w-auto min-w-36 rounded px-3 py-1 text-xs"
              aria-label="Filter by cluster"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All Clusters</SelectItem>
              {clusterOptions.map((cluster) => (
                <SelectItem key={cluster} value={cluster}>
                  {cluster}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
            <SelectTrigger
              className="h-8 w-auto min-w-40 rounded px-3 py-1 text-xs"
              aria-label="Filter by namespace"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All Namespaces</SelectItem>
              {namespaceOptions.map((namespace) => (
                <SelectItem key={namespace} value={namespace}>
                  {namespace}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={stateFilter}
            onValueChange={(value) =>
              setStateFilter(value as ApplicationStateFilter)
            }
          >
            <SelectTrigger
              className="h-8 w-auto min-w-32 rounded px-3 py-1 text-xs"
              aria-label="Filter by state"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>All States</SelectItem>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Health</SelectLabel>
                {HEALTH_STATES.map((state) => (
                  <SelectItem key={`health:${state}`} value={`health:${state}`}>
                    Health: {state}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Sync status</SelectLabel>
                {SYNC_STATES.map((state) => (
                  <SelectItem key={`sync:${state}`} value={`sync:${state}`}>
                    Sync: {state}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div
            className="ml-auto flex items-center rounded border border-input bg-background p-0.5"
            role="group"
            aria-label="Application view"
          >
            <Button
              type="button"
              variant={view === 'cards' ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="Card view"
              aria-pressed={view === 'cards'}
              title="Card view"
              onClick={() => handleViewChange('cards')}
            >
              <IconGrid size={16} />
            </Button>
            <Button
              type="button"
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="Table view"
              aria-pressed={view === 'table'}
              title="Table view"
              onClick={() => handleViewChange('table')}
            >
              <IconTable size={16} />
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <LoadingSpinner message="Loading applications..." size="lg" />
        )}

        {/* Error State */}
        {error && (
          <ErrorAlert
            error={error}
            onRetry={() => refetch()}
            title="Failed to load applications"
            size="lg"
          />
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredApps.length === 0 && (
          <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 text-center">
            <div className="max-w-md mx-auto">
              <div className="h-12 w-12 rounded bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center mx-auto mb-3">
                <IconGrid size={24} className="text-neutral-400" />
              </div>
              <h3 className="text-sm font-medium text-black dark:text-white mb-1">
                {hasActiveFilters
                  ? 'No applications found'
                  : 'No applications yet'}
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-4">
                {hasActiveFilters
                  ? 'Try adjusting your search or filters'
                  : 'Create your first application to get started with GitOps deployments'}
              </p>
              {!hasActiveFilters && (
                <Button
                  variant="default"
                  onClick={() => setShowCreatePanel(true)}
                >
                  <IconAdd size={16} />
                  Create Application
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Applications Card View */}
        {!isLoading && !error && filteredApps.length > 0 && view === 'cards' && (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredApps.map((app) => (
              <ApplicationCard
                key={`${app.metadata.namespace || ''}/${app.metadata.name}`}
                app={app}
                onRefresh={handleRefresh}
                onSync={handleSync}
              />
            ))}

            {data?.items?.length === 0 && (
              <div
                className="rounded border-2 border-dashed border-neutral-300 dark:border-neutral-800 bg-transparent p-3 flex flex-col items-center justify-center text-center hover:border-neutral-400 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-950 transition-colors cursor-pointer group"
                onClick={() => setShowCreatePanel(true)}
              >
                <div className="h-8 w-8 rounded bg-neutral-200 dark:bg-neutral-900 flex items-center justify-center mb-2 group-hover:bg-neutral-300 dark:group-hover:bg-neutral-800 transition-colors">
                  <IconAdd
                    size={16}
                    className="text-neutral-600 dark:text-neutral-400"
                  />
                </div>
                <h3 className="text-sm font-medium text-black dark:text-white mb-0.5">
                  Create an application
                </h3>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-500">
                  Deploy a new application to your cluster
                </p>
              </div>
            )}
          </div>
        )}

        {/* Applications Table View */}
        {!isLoading && !error && filteredApps.length > 0 && view === 'table' && (
          <ApplicationTable applications={filteredApps} />
        )}
      </PageContent>

      {/* Create Application Panel */}
      {showCreatePanel && (
        <Suspense fallback={<span className="sr-only" role="status">Loading application form…</span>}>
          <CreateApplicationPanel
            onClose={() => setShowCreatePanel(false)}
            onSuccess={() => refetch()}
          />
        </Suspense>
      )}
    </div>
  )
}

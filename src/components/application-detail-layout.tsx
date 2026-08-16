import { Link, Outlet, useNavigate, useParams, useRouterState, useSearch } from '@tanstack/react-router'
import { lazy, Suspense, useState, useEffect } from 'react'
import {
  IconCircleForward,
  IconDelete,
  IconCodeBranch,
  IconSettings,
  IconChevronRight,
  IconCircleCheckFill,
  IconChevronDown,
  IconBrandGithubFill
} from 'obra-icons-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from 'sonner'
import { getHealthIcon } from '@/lib/status-icons'
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn, formatRepoUrl } from '@/lib/utils'
import {
  useApplication,
  useApplications,
  useUpdateApplicationSpec,
  useSyncApplication,
  useDeleteApplication,
  useRefreshApplication,
} from '@/services/applications'
const SyncProgressSheet = lazy(async () => {
  const module = await import('@/components/sync-progress-sheet')
  return { default: module.SyncProgressSheet }
})

export function ApplicationDetailLayout() {
  const { name } = useParams({ from: '/_authenticated/applications/$name' })
  const { appNamespace } = useSearch({ from: '/_authenticated/applications/$name' })
  const navigate = useNavigate()
  const router = useRouterState()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [syncProgressOpen, setSyncProgressOpen] = useState(false)
  const [comboboxOpen, setComboboxOpen] = useState(false)

  // Get current view from pathname
  const currentPath = router.location.pathname
  const currentView = currentPath.split('/').pop() || 'tree'

  const { data: app, isLoading, error, refetch } = useApplication(
    name || '',
    !!name,
    appNamespace,
  )
  const { data: allApps } = useApplications()
  const effectiveAppNamespace = app?.metadata.namespace || appNamespace

  const syncMutation = useSyncApplication()
  const updateSpecMutation = useUpdateApplicationSpec()
  const deleteMutation = useDeleteApplication()
  const refreshMutation = useRefreshApplication()

  // Auto-open sync progress sheet when operation is running
  useEffect(() => {
    if (app?.status?.operationState?.phase === 'Running') {
      setSyncProgressOpen(true)
    }
  }, [app?.status?.operationState?.phase])

  const handleSync = async () => {
    if (!name) return
    try {
      setSyncProgressOpen(true)
      await syncMutation.mutateAsync({
        name,
        appNamespace: effectiveAppNamespace,
        prune: false,
        dryRun: false,
      })
      toast.success('Application synced', {
        description: 'Sync initiated successfully',
      })
      refetch()
    } catch (error) {
      toast.error('Failed to sync application', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setSyncProgressOpen(false)
    }
  }

  const handleRefresh = async () => {
    if (!name) return
    try {
      await refreshMutation.mutateAsync({ name, appNamespace: effectiveAppNamespace })
      toast.success('Application refreshed', {
        description: 'Refresh initiated successfully',
      })
      refetch()
    } catch (error) {
      toast.error('Failed to refresh application', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleToggleAutoSync = async (checked: boolean) => {
    if (!name || !app) return
    try {
      await updateSpecMutation.mutateAsync({
        name,
        appNamespace: effectiveAppNamespace,
        spec: {
          ...app.spec,
          syncPolicy: checked
            ? {
                ...app.spec.syncPolicy,
                automated: {
                  prune: false,
                  selfHeal: false,
                },
              }
            : {
                ...app.spec.syncPolicy,
                automated: undefined,
              },
        },
      })
      toast.success(checked ? 'Auto-sync enabled' : 'Auto-sync disabled', {
        description: checked
          ? 'Application will sync automatically on changes'
          : 'Application will require manual sync',
      })
    } catch (error) {
      toast.error('Failed to toggle auto-sync', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!name) return
    try {
      await deleteMutation.mutateAsync({
        name,
        appNamespace: effectiveAppNamespace,
        cascade: true,
      })
      toast.success('Application deleted', {
        description: `Successfully deleted application "${name}" with cascade`,
      })
      setDeleteDialogOpen(false)
      navigate({ to: '/applications' })
    } catch (error) {
      console.error('Failed to delete application:', error)
      toast.error('Failed to delete application', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <IconCircleForward size={32} className="animate-spin text-neutral-400 mx-auto mb-4" />
          <p className="text-neutral-400">Loading application...</p>
        </div>
      </div>
    )
  }

  if (error || !app) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6 max-w-md">
          <div className="flex items-start gap-3">
            <div>
              <h3 className="font-medium text-red-400 mb-1">Failed to load application</h3>
              <p className="text-sm text-red-400/80 mb-3">
                {error instanceof Error ? error.message : 'Application not found'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate({ to: '/applications' })}>
                  Back to Applications
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const healthStatus = app.status?.health?.status || 'Unknown'
  const syncStatus = app.status?.sync?.status || 'Unknown'
  const { color: healthColor } = getHealthIcon(healthStatus)

  // Parse app versions from image tags
  const appVersions = parseAppVersions(app.status?.summary?.images)

  return (
    <div className="flex min-h-0 h-full flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-black">
        {/* Breadcrumb section - full width */}
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="min-w-0">
                <BreadcrumbItem className="min-w-0">
                  <Link
                    to="/applications"
                    className="text-sm text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white"
                  >
                    Applications
                  </Link>
                </BreadcrumbItem>
                <BreadcrumbSeparator>
                  <IconChevronRight size={14} />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        role="combobox"
                        aria-label="Select application"
                        aria-expanded={comboboxOpen}
                        className="h-auto min-w-0 max-w-[calc(100vw-10rem)] gap-1.5 p-0 text-sm font-medium text-black hover:bg-transparent dark:text-white sm:max-w-xs"
                      >
                        <span className="truncate">{app.metadata.name}</span>
                        <IconChevronDown size={14} className="shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-2rem)] max-w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search applications..." />
                        <CommandList>
                          <CommandEmpty>No application found.</CommandEmpty>
                          <CommandGroup>
                            {allApps?.items?.map((application) => (
                              <CommandItem
                                key={`${application.metadata.namespace || ''}/${application.metadata.name}`}
                                value={`${application.metadata.name} ${application.metadata.namespace || ''}`}
                                onSelect={() => {
                                  navigate({
                                    to: '/applications/$name/tree',
                                    params: { name: application.metadata.name },
                                    search: { appNamespace: application.metadata.namespace },
                                  })
                                  setComboboxOpen(false)
                                }}
                              >
                                <span>{application.metadata.name}</span>
                                {application.metadata.namespace && (
                                  <span className="ml-1 text-xs text-muted-foreground">
                                    ({application.metadata.namespace})
                                  </span>
                                )}
                                <IconCircleCheckFill
                                  size={16}
                                  className={cn(
                                    'ml-auto',
                                    app.metadata.name === application.metadata.name &&
                                      app.metadata.namespace === application.metadata.namespace
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            {/* Actions */}
            <div
              data-testid="application-actions"
              className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:gap-3"
            >
              {/* Auto-sync toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-600 dark:text-neutral-400">Auto-sync</span>
                <Switch
                  aria-label="Toggle automatic sync"
                  checked={!!app.spec?.syncPolicy?.automated}
                  onCheckedChange={handleToggleAutoSync}
                  disabled={updateSpecMutation.isPending}
                />
              </div>

              <div className="hidden h-4 w-px bg-neutral-200 dark:bg-neutral-800 lg:block" />

              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({
                  to: '/applications/$name/settings',
                  params: { name },
                  search: { appNamespace: effectiveAppNamespace },
                })}
              >
                <IconSettings size={16} />
                Settings
              </Button>

              <div className="hidden h-4 w-px bg-neutral-200 dark:bg-neutral-800 lg:block" />

              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshMutation.isPending}
              >
                <IconCircleForward size={16} className={refreshMutation.isPending ? 'animate-spin' : ''} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                Sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteClick}
                className="text-red-400 hover:text-red-300"
              >
                <IconDelete size={16} />
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area with sidebar */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white dark:bg-black lg:flex-row lg:overflow-hidden">
        {/* Left content area */}
        <div className="flex min-w-0 flex-col lg:flex-1 lg:overflow-hidden">
          {/* View switcher - hide on settings page */}
          {currentView !== 'settings' && (
            <nav className="px-4 py-3 sm:px-6" aria-label="Application views">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant={currentView === 'tree' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate({
                    to: '/applications/$name/tree',
                    params: { name },
                    search: { appNamespace: effectiveAppNamespace },
                  })}
                  className={cn('gap-1', currentView === 'tree' && 'bg-blue-700 hover:bg-blue-800')}
                >
                  Tree
                </Button>
                <Button
                  variant={currentView === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate({
                    to: '/applications/$name/list',
                    params: { name },
                    search: { appNamespace: effectiveAppNamespace },
                  })}
                  className={cn('gap-1', currentView === 'list' && 'bg-blue-700 hover:bg-blue-800')}
                >
                  List
                </Button>
                <Button
                  variant={currentView === 'pods' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate({
                    to: '/applications/$name/pods',
                    params: { name },
                    search: { appNamespace: effectiveAppNamespace },
                  })}
                  className={cn('gap-1', currentView === 'pods' && 'bg-blue-700 hover:bg-blue-800')}
                >
                  Pods
                </Button>
                <Button
                  variant={currentView === 'diff' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate({
                    to: '/applications/$name/diff',
                    params: { name },
                    search: { appNamespace: effectiveAppNamespace },
                  })}
                  className={cn('gap-1', currentView === 'diff' && 'bg-blue-700 hover:bg-blue-800')}
                >
                  Diff
                </Button>
                <Button
                  variant={currentView === 'history' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => navigate({
                    to: '/applications/$name/history',
                    params: { name },
                    search: { appNamespace: effectiveAppNamespace },
                  })}
                  className={cn('gap-1', currentView === 'history' && 'bg-blue-700 hover:bg-blue-800')}
                >
                  History
                </Button>
              </div>
            </nav>
          )}

          {/* Content - Outlet for nested routes */}
          <div className="min-h-[28rem] flex-1 overflow-auto lg:min-h-0">
            <Outlet />
          </div>
        </div>

        {/* Right sidebar - metadata */}
        <aside className="w-full shrink-0 space-y-4 border-t border-border p-4 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:p-6">
          {/* Health status */}
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Health</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${healthColor.replace('text-', 'bg-').replace('bg-grass-11', 'bg-grass-9')}`} />
                <div className="text-sm">{healthStatus}</div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Sync status</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${syncStatus === 'Synced' ? 'bg-grass-9' : 'bg-amber-400'}`} />
                <div className="text-sm">{syncStatus}</div>
              </div>
            </div>
          </div>

          {/* Namespace */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Namespace</div>
            <div className="text-sm">{app.spec.destination.namespace || 'default'}</div>
          </div>

          {/* Destination server */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Destination</div>
            <div className="text-sm break-all">{app.spec.destination.server || app.spec.destination.name || 'unknown'}</div>
          </div>

          {/* Repository - single source */}
          {app.spec.source && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Repository</div>
              <div className="flex items-center gap-1.5 text-sm break-all">
                {formatRepoUrl(app.spec.source.repoURL).isGithub ? (
                  <IconBrandGithubFill size={14} className="flex-shrink-0" />
                ) : (
                  <IconCodeBranch size={14} className="flex-shrink-0" />
                )}
                <span>{formatRepoUrl(app.spec.source.repoURL).displayText}</span>
              </div>
            </div>
          )}
          {/* Repository - multi-source */}
          {!app.spec.source && app.spec.sources && app.spec.sources.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Repositories ({app.spec.sources.length})
              </div>
              <div className="space-y-2">
                {app.spec.sources.map((source, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-sm break-all">
                    {formatRepoUrl(source.repoURL).isGithub ? (
                      <IconBrandGithubFill size={14} className="flex-shrink-0" />
                    ) : (
                      <IconCodeBranch size={14} className="flex-shrink-0" />
                    )}
                    <span>{formatRepoUrl(source.repoURL).displayText}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Target revision - single source */}
          {app.spec.source?.targetRevision && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-1">Target revision</div>
              <div className="text-sm font-mono">{app.spec.source.targetRevision}</div>
            </div>
          )}

          {/* App Versions */}
          {appVersions.length > 0 && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">App versions</div>
              <div className="space-y-1.5">
                {appVersions.map((version, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium">{version.name}:</span>{' '}
                    <span className="font-mono">{version.version}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Application"
        description={`Are you sure you want to delete the application "${name}"? This action cannot be undone and will remove all associated resources from the cluster.`}
        confirmText="Delete"
        resourceName={name || ''}
        resourceType="application"
        onConfirm={handleDeleteConfirm}
        isLoading={deleteMutation.isPending}
      />

      {/* Sync Progress Sheet */}
      {syncProgressOpen && (
        <Suspense fallback={<span className="sr-only" role="status">Loading sync progress…</span>}>
          <SyncProgressSheet
            application={app}
            open={syncProgressOpen}
            onOpenChange={setSyncProgressOpen}
          />
        </Suspense>
      )}
    </div>
  )
}

// Helper function to parse app versions from Docker images
interface AppVersion {
  name: string
  version: string
  isCommitSha: boolean
}

function parseAppVersions(images: string[] | undefined): AppVersion[] {
  if (!images || images.length === 0) return []

  return images
    .map(image => {
      const parts = image.split('/')
      const lastPart = parts[parts.length - 1]
      const [name, tag] = lastPart.split(':')

      if (!tag || tag === 'latest') return null

      const isCommitSha = /^[0-9a-f]{40}$/i.test(tag)
      const version = isCommitSha ? tag.substring(0, 7) : tag

      return { name, version, isCommitSha }
    })
    .filter((v): v is AppVersion => v !== null)
}

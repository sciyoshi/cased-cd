import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api-client'
import type { Application, ApplicationList, ApplicationSpec, ManagedResourcesResponse, RevisionMetadata, RollbackRequest } from '@/types/api'
import { toast } from 'sonner'

// API endpoints
const ENDPOINTS = {
  applications: '/applications',
  application: (name: string) => `/applications/${name}`,
  applicationSpec: (name: string) => `/applications/${name}/spec`,
  sync: (name: string) => `/applications/${name}/sync`,
  rollback: (name: string) => `/applications/${name}/rollback`,
  resource: (name: string) => `/applications/${name}/resource`,
  resourceTree: (name: string) => `/applications/${name}/resource-tree`,
  managedResources: (name: string) => `/applications/${name}/managed-resources`,
  revisionMetadata: (name: string, revision: string) => `/applications/${name}/revisions/${revision}/metadata`,
  patchResource: (name: string) => `/applications/${name}/resource`,
}

// Query Keys
export const applicationKeys = {
  all: ['applications'] as const,
  lists: () => [...applicationKeys.all, 'list'] as const,
  list: (filters?: ApplicationFilters) => [...applicationKeys.lists(), filters] as const,
  details: () => [...applicationKeys.all, 'detail'] as const,
  detail: (name: string, appNamespace?: string) =>
    [...applicationKeys.details(), name, appNamespace || ''] as const,
  resourceTree: (name: string, appNamespace?: string) =>
    [...applicationKeys.all, 'resourceTree', name, appNamespace || ''] as const,
  managedResources: (name: string, appNamespace?: string) =>
    [...applicationKeys.all, 'managedResources', name, appNamespace || ''] as const,
  resource: (
    appName: string,
    resourceName: string,
    kind: string,
    namespace?: string,
    appNamespace?: string,
  ) => [
    ...applicationKeys.all,
    'resource',
    appName,
    appNamespace || '',
    kind,
    namespace || '',
    resourceName,
  ] as const,
  revisionMetadata: (appName: string, revision: string, appNamespace?: string) =>
    [...applicationKeys.all, 'revisionMetadata', appName, appNamespace || '', revision] as const,
}

// Types
export interface ApplicationFilters {
  project?: string
  cluster?: string
  namespace?: string
  name?: string
  health?: string
  sync?: string
  appNamespace?: string
}

export interface ApplicationReference {
  name: string
  appNamespace?: string
}

function withApplicationQuery(
  endpoint: string,
  appNamespace?: string,
  values?: Record<string, string>,
) {
  const params = new URLSearchParams(values)
  if (appNamespace) params.set('appNamespace', appNamespace)
  const query = params.toString()
  return query ? `${endpoint}?${query}` : endpoint
}

export interface ResourceTree {
  nodes?: Array<{
    kind: string
    name: string
    namespace?: string
    status?: string
    health?: {
      status: string
    }
    group?: string
    version?: string
    parentRefs?: Array<{
      kind: string
      name: string
      namespace?: string
      group?: string
    }>
  }>
}

// API Functions
export const applicationsApi = {
  // Get all applications
  getApplications: async (filters?: ApplicationFilters): Promise<ApplicationList> => {
    const params = new URLSearchParams()
    if (filters?.project) params.append('project', filters.project)
    if (filters?.cluster) params.append('cluster', filters.cluster)
    if (filters?.namespace) params.append('namespace', filters.namespace)
    if (filters?.name) params.append('name', filters.name)
    if (filters?.appNamespace) params.append('appNamespace', filters.appNamespace)

    const response = await api.get<ApplicationList>(
      `${ENDPOINTS.applications}?${params.toString()}`
    )
    return response.data
  },

  // Get single application
  getApplication: async (name: string, appNamespace?: string): Promise<Application> => {
    const response = await api.get<Application>(
      withApplicationQuery(ENDPOINTS.application(name), appNamespace),
    )
    return response.data
  },

  // Create application
  createApplication: async (app: Application): Promise<Application> => {
    const response = await api.post<Application>(ENDPOINTS.applications, app)
    return response.data
  },

  // Update application
  updateApplication: async (
    name: string,
    app: Partial<Application>,
    appNamespace?: string,
  ): Promise<Application> => {
    const namespacedApplication = appNamespace
      ? {
          ...app,
          metadata: {
            ...app.metadata,
            name: app.metadata?.name || name,
            namespace: appNamespace,
          },
        }
      : app
    const response = await api.put<Application>(ENDPOINTS.application(name), namespacedApplication)
    return response.data
  },

  // Update application spec only
  updateApplicationSpec: async (
    name: string,
    spec: ApplicationSpec,
    appNamespace?: string,
  ): Promise<ApplicationSpec> => {
    const response = await api.put<ApplicationSpec>(
      withApplicationQuery(ENDPOINTS.applicationSpec(name), appNamespace),
      spec,
    )
    return response.data
  },

  // Delete application
  deleteApplication: async (
    name: string,
    cascade?: boolean,
    appNamespace?: string,
  ): Promise<void> => {
    await api.delete(withApplicationQuery(
      ENDPOINTS.application(name),
      appNamespace,
      cascade ? { cascade: 'true' } : undefined,
    ))
  },

  // Sync application
  syncApplication: async (
    name: string,
    prune?: boolean,
    dryRun?: boolean,
    appNamespace?: string,
  ): Promise<void> => {
    await api.post(ENDPOINTS.sync(name), {
      prune,
      dryRun,
      strategy: { hook: {} },
      ...(appNamespace ? { appNamespace } : {}),
    })
  },

  // Refresh application
  refreshApplication: async (name: string, appNamespace?: string): Promise<void> => {
    await api.get(withApplicationQuery(
      ENDPOINTS.application(name),
      appNamespace,
      { refresh: 'normal' },
    ))
  },

  // Get resource tree (includes pods and all child resources)
  getResourceTree: async (name: string, appNamespace?: string): Promise<ResourceTree> => {
    const response = await api.get<ResourceTree>(
      withApplicationQuery(ENDPOINTS.resourceTree(name), appNamespace),
    )
    return response.data
  },

  // Get managed resources with diff information
  getManagedResources: async (
    name: string,
    appNamespace?: string,
  ): Promise<ManagedResourcesResponse> => {
    const response = await api.get<ManagedResourcesResponse>(
      withApplicationQuery(ENDPOINTS.managedResources(name), appNamespace),
    )
    return response.data
  },

  // Get individual resource manifest
  getResource: async (params: {
    appName: string
    appNamespace?: string
    resourceName: string
    kind: string
    namespace?: string
    group?: string
    version?: string
  }): Promise<Record<string, unknown>> => {
    // ArgoCD requires both 'name' AND 'resourceName' parameters (quirky API design)
    const queryParams = new URLSearchParams({
      name: params.resourceName,           // Primary parameter
      resourceName: params.resourceName,   // Duplicate (required by ArgoCD)
      kind: params.kind,
      version: params.version || '',       // Send empty string if missing
      group: params.group || '',           // Send empty string for core API
    })

    if (params.namespace) {
      queryParams.append('namespace', params.namespace)
    }

    if (params.appNamespace) {
      queryParams.append('appNamespace', params.appNamespace)
    }

    const response = await api.get<{ manifest: unknown }>(
      `${ENDPOINTS.resource(params.appName)}?${queryParams.toString()}`
    )
    // ArgoCD returns manifest as JSON string sometimes, so parse if needed
    const manifest = response.data.manifest
    if (typeof manifest === 'string') {
      return JSON.parse(manifest)
    }
    return manifest as Record<string, unknown>
  },

  // Get revision metadata (commit details)
  getRevisionMetadata: async (
    name: string,
    revision: string,
    appNamespace?: string,
  ): Promise<RevisionMetadata> => {
    const response = await api.get<RevisionMetadata>(
      withApplicationQuery(ENDPOINTS.revisionMetadata(name, revision), appNamespace),
    )
    return response.data
  },

  // Rollback application to a previous revision
  rollbackApplication: async (name: string, request: RollbackRequest): Promise<Application> => {
    const response = await api.post<Application>(ENDPOINTS.rollback(name), request)
    return response.data
  },

  // Patch a resource in the cluster (live edit)
  patchResource: async (params: {
    appName: string
    appNamespace?: string
    resourceName: string
    kind: string
    namespace?: string
    group?: string
    version?: string
    patch: Record<string, unknown>
    patchType?: 'application/json-patch+json' | 'application/merge-patch+json' | 'application/strategic-merge-patch+json'
  }): Promise<void> => {
    // Build query params - note: 'name' is in the URL path, not query string
    const queryParams = new URLSearchParams({
      resourceName: params.resourceName,
      kind: params.kind,
      namespace: params.namespace || '',
      group: params.group || '',
      version: params.version || 'v1',
      patchType: params.patchType || 'application/merge-patch+json',
    })

    // Add optional appNamespace if provided
    if (params.appNamespace) {
      queryParams.set('appNamespace', params.appNamespace)
    }

    const url = `${ENDPOINTS.patchResource(params.appName)}?${queryParams.toString()}`

    // ArgoCD's gRPC gateway expects the patch as a JSON string (not an object)
    // The protobuf field is type string, so we need to double-encode:
    // 1. JSON.stringify(patch) converts the object to a JSON string
    // 2. JSON.stringify(patchString) wraps it in quotes for the gRPC gateway to unmarshal as a string
    const patchString = JSON.stringify(params.patch)
    await api.post(url, JSON.stringify(patchString), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  },
}

// React Query Hooks

// Get all applications
export function useApplications(filters?: ApplicationFilters) {
  return useQuery({
    queryKey: applicationKeys.list(filters),
    queryFn: () => applicationsApi.getApplications(filters),
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
    refetchIntervalInBackground: false, // Only when tab is active
  })
}

// Get single application
export function useApplication(
  name: string,
  enabled: boolean = true,
  appNamespace?: string,
) {
  return useQuery({
    queryKey: applicationKeys.detail(name, appNamespace),
    queryFn: () => applicationsApi.getApplication(name, appNamespace),
    enabled: enabled && !!name,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
    refetchIntervalInBackground: false, // Only when tab is active
  })
}

// Create application mutation
export function useCreateApplication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: applicationsApi.createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

// Update application mutation
export function useUpdateApplication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, appNamespace, app }: ApplicationReference & { app: Partial<Application> }) =>
      applicationsApi.updateApplication(name, app, appNamespace),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.detail(variables.name, variables.appNamespace),
      })
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

// Update application spec mutation
export function useUpdateApplicationSpec() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, appNamespace, spec }: ApplicationReference & { spec: ApplicationSpec }) =>
      applicationsApi.updateApplicationSpec(name, spec, appNamespace),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.detail(variables.name, variables.appNamespace),
      })
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

// Delete application mutation
export function useDeleteApplication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, appNamespace, cascade }: ApplicationReference & { cascade?: boolean }) =>
      applicationsApi.deleteApplication(name, cascade, appNamespace),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
    },
  })
}

// Sync application mutation
export function useSyncApplication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, appNamespace, prune, dryRun }: ApplicationReference & {
      prune?: boolean
      dryRun?: boolean
    }) => applicationsApi.syncApplication(name, prune, dryRun, appNamespace),
    onMutate: async (variables) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: applicationKeys.detail(variables.name, variables.appNamespace),
      })
      await queryClient.cancelQueries({ queryKey: applicationKeys.lists() })

      // Snapshot the previous value
      const previousApp = queryClient.getQueryData<Application>(
        applicationKeys.detail(variables.name, variables.appNamespace),
      )
      const previousList = queryClient.getQueryData<ApplicationList>(applicationKeys.lists())

      // Optimistically update to show syncing state
      if (previousApp) {
        queryClient.setQueryData<Application>(
          applicationKeys.detail(variables.name, variables.appNamespace),
          {
            ...previousApp,
            status: {
              ...previousApp.status,
              operationState: {
                ...previousApp.status?.operationState,
                phase: 'Running',
                message: 'Sync initiated...',
                startedAt: new Date().toISOString(),
              },
            },
          },
        )
      }

      // Update the app in the list too
      if (previousList) {
        queryClient.setQueryData<ApplicationList>(applicationKeys.lists(), {
          ...previousList,
          items: previousList.items.map((app) =>
            app.metadata.name === variables.name &&
            (!variables.appNamespace || app.metadata.namespace === variables.appNamespace)
              ? {
                  ...app,
                  status: {
                    ...app.status,
                    operationState: {
                      ...app.status?.operationState,
                      phase: 'Running',
                      message: 'Sync initiated...',
                      startedAt: new Date().toISOString(),
                    },
                  },
                }
              : app
          ),
        })
      }

      return { previousApp, previousList }
    },
    onSuccess: (_, variables) => {
      // Immediately refetch to get the latest state
      queryClient.invalidateQueries({
        queryKey: applicationKeys.detail(variables.name, variables.appNamespace),
      })
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })

      // Poll for updates for 30 seconds to catch the sync completing
      const pollInterval = setInterval(() => {
        queryClient.invalidateQueries({
          queryKey: applicationKeys.detail(variables.name, variables.appNamespace),
        })
        queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
      }, 2000) // Poll every 2 seconds

      // Stop polling after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval)
      }, 30000)
    },
    onError: (_, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousApp) {
        queryClient.setQueryData(
          applicationKeys.detail(variables.name, variables.appNamespace),
          context.previousApp,
        )
      }
      if (context?.previousList) {
        queryClient.setQueryData(applicationKeys.lists(), context.previousList)
      }
    },
  })
}

// Refresh application mutation
export function useRefreshApplication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, appNamespace }: ApplicationReference) =>
      applicationsApi.refreshApplication(name, appNamespace),
    onSuccess: (_, { name, appNamespace }) => {
      // Immediately refetch to get the refreshed state
      queryClient.invalidateQueries({ queryKey: applicationKeys.detail(name, appNamespace) })
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })

      // Poll for a few seconds to ensure we catch any state changes
      const pollInterval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: applicationKeys.detail(name, appNamespace) })
        queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
      }, 1000)

      setTimeout(() => {
        clearInterval(pollInterval)
      }, 5000)
    },
  })
}

// Get resource tree (includes pods)
export function useResourceTree(
  name: string,
  enabled: boolean = true,
  appNamespace?: string,
) {
  return useQuery({
    queryKey: applicationKeys.resourceTree(name, appNamespace),
    queryFn: () => applicationsApi.getResourceTree(name, appNamespace),
    enabled: enabled && !!name,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 10 * 1000, // Auto-refetch every 10 seconds
  })
}

// Get managed resources with diff information
export function useManagedResources(
  name: string,
  enabled: boolean = true,
  appNamespace?: string,
) {
  return useQuery({
    queryKey: applicationKeys.managedResources(name, appNamespace),
    queryFn: () => applicationsApi.getManagedResources(name, appNamespace),
    enabled: enabled && !!name,
    staleTime: 5 * 1000, // 5 seconds
  })
}

// Get individual resource manifest
export function useResource(params: {
  appName: string
  appNamespace?: string
  resourceName: string
  kind: string
  namespace?: string
  group?: string
  version?: string
}, enabled: boolean = true) {
  return useQuery({
    queryKey: applicationKeys.resource(
      params.appName,
      params.resourceName,
      params.kind,
      params.namespace,
      params.appNamespace,
    ),
    queryFn: () => applicationsApi.getResource(params),
    enabled: enabled && !!params.appName && !!params.resourceName && !!params.kind,
    staleTime: 10 * 1000, // 10 seconds
  })
}

// Get revision metadata (commit details)
export function useRevisionMetadata(
  appName: string,
  revision: string,
  enabled: boolean = true,
  appNamespace?: string,
) {
  return useQuery({
    queryKey: applicationKeys.revisionMetadata(appName, revision, appNamespace),
    queryFn: () => applicationsApi.getRevisionMetadata(appName, revision, appNamespace),
    enabled: enabled && !!appName && !!revision,
    staleTime: 60 * 1000, // 1 minute (commit metadata doesn't change)
  })
}

// Rollback application mutation
export function useRollbackApplication() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ name, request }: { name: string; request: RollbackRequest }) =>
      applicationsApi.rollbackApplication(name, request),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: applicationKeys.detail(variables.name, variables.request.appNamespace),
      })
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
      toast.success('Rollback initiated', {
        description: `Rolling back to revision ID ${variables.request.id}`,
      })

      // Poll for updates for 30 seconds to catch the rollback completing
      const pollInterval = setInterval(() => {
        queryClient.invalidateQueries({
          queryKey: applicationKeys.detail(variables.name, variables.request.appNamespace),
        })
        queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })
      }, 2000) // Poll every 2 seconds

      // Stop polling after 30 seconds
      setTimeout(() => {
        clearInterval(pollInterval)
      }, 30000)
    },
    onError: (error) => {
      toast.error('Rollback failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

// Patch resource mutation (live cluster edits)
export function usePatchResource() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: applicationsApi.patchResource,
    onSuccess: (_, variables) => {
      // Invalidate the specific resource query
      queryClient.invalidateQueries({
        queryKey: applicationKeys.resource(
          variables.appName,
          variables.resourceName,
          variables.kind,
          variables.namespace,
          variables.appNamespace,
        ),
      })
      // Invalidate app detail and tree to show updated state
      queryClient.invalidateQueries({
        queryKey: applicationKeys.detail(variables.appName, variables.appNamespace),
      })
      queryClient.invalidateQueries({
        queryKey: applicationKeys.resourceTree(variables.appName, variables.appNamespace),
      })
      queryClient.invalidateQueries({ queryKey: applicationKeys.lists() })

      toast.success('Resource updated', {
        description: 'The live cluster resource has been modified. Application will show as OutOfSync.',
      })
    },
    onError: (error) => {
      toast.error('Patch failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    },
  })
}

import type {
  ApplicationDestination,
  ApplicationSource,
  ApplicationSpec,
  SyncPolicy,
} from '@/types/api'

export interface ApplicationSettingsValues {
  project: string
  repoURL: string
  targetRevision: string
  path: string
  sourceReadOnly: boolean
  destinationCluster: string
  destinationNamespace: string
  autoSyncEnabled: boolean
  prune: boolean
  selfHeal: boolean
  allowEmpty: boolean
  createNamespace: boolean
  pruneLast: boolean
  applyOutOfSyncOnly: boolean
  serverSideApply: boolean
  retryEnabled: boolean
  retryLimit: number
}

const syncOptionFields = {
  CreateNamespace: 'createNamespace',
  PruneLast: 'pruneLast',
  ApplyOutOfSyncOnly: 'applyOutOfSyncOnly',
  ServerSideApply: 'serverSideApply',
} as const

type SyncOptionName = keyof typeof syncOptionFields

function isEnabledSyncOption(options: string[] | undefined, name: SyncOptionName) {
  return options?.includes(`${name}=true`) ?? false
}

export function usesNamedDestination(destination: ApplicationDestination) {
  return Boolean(destination.name)
}

export function isMultiSourceSpec(spec: ApplicationSpec) {
  return Array.isArray(spec.sources)
}

export function hasChartSource(spec: ApplicationSpec) {
  return !isMultiSourceSpec(spec) && Boolean(spec.source?.chart)
}

export function getApplicationSettingsValues(
  spec: ApplicationSpec,
): ApplicationSettingsValues {
  const sourceReadOnly = isMultiSourceSpec(spec)
  const source = sourceReadOnly ? spec.sources?.[0] : spec.source
  const automated = spec.syncPolicy?.automated
  const syncOptions = spec.syncPolicy?.syncOptions

  return {
    project: spec.project || 'default',
    repoURL: source?.repoURL || '',
    targetRevision: source?.targetRevision || 'HEAD',
    path: source?.path || '',
    sourceReadOnly,
    destinationCluster: usesNamedDestination(spec.destination)
      ? spec.destination.name || ''
      : spec.destination.server || '',
    destinationNamespace: spec.destination.namespace || '',
    autoSyncEnabled: Boolean(automated) && automated?.enabled !== false,
    prune: automated?.prune || false,
    selfHeal: automated?.selfHeal || false,
    allowEmpty: automated?.allowEmpty || false,
    createNamespace: isEnabledSyncOption(syncOptions, 'CreateNamespace'),
    pruneLast: isEnabledSyncOption(syncOptions, 'PruneLast'),
    applyOutOfSyncOnly: isEnabledSyncOption(syncOptions, 'ApplyOutOfSyncOnly'),
    serverSideApply: isEnabledSyncOption(syncOptions, 'ServerSideApply'),
    retryEnabled: Boolean(spec.syncPolicy?.retry),
    retryLimit: spec.syncPolicy?.retry?.limit || 2,
  }
}

function withoutProperty<T extends object, K extends keyof T>(object: T, key: K): Omit<T, K> {
  const rest: Partial<T> = { ...object }
  delete rest[key]
  return rest as Omit<T, K>
}

function updateSource(
  source: ApplicationSource | undefined,
  originalValues: ApplicationSettingsValues,
  values: ApplicationSettingsValues,
) {
  let nextSource: ApplicationSource = {
    ...source,
    repoURL: source?.repoURL || values.repoURL,
  }

  if (values.repoURL !== originalValues.repoURL) {
    nextSource.repoURL = values.repoURL
  }
  if (values.targetRevision !== originalValues.targetRevision) {
    nextSource.targetRevision = values.targetRevision
  }
  if (values.path !== originalValues.path && !source?.chart) {
    nextSource = values.path
      ? { ...nextSource, path: values.path }
      : withoutProperty(nextSource, 'path')
  }

  return nextSource
}

function updateDestination(
  destination: ApplicationDestination,
  values: ApplicationSettingsValues,
) {
  const named = usesNamedDestination(destination)
  const unchangedDestination = withoutProperty(
    withoutProperty(destination, 'server'),
    'name',
  )

  return {
    ...unchangedDestination,
    ...(named
      ? { name: values.destinationCluster }
      : { server: values.destinationCluster }),
    namespace: values.destinationNamespace,
  }
}

function updateSyncOptions(
  originalOptions: string[] | undefined,
  originalValues: ApplicationSettingsValues,
  values: ApplicationSettingsValues,
) {
  const changedOptions = (Object.entries(syncOptionFields) as Array<
    [SyncOptionName, (typeof syncOptionFields)[SyncOptionName]]
  >).filter(([, field]) => originalValues[field] !== values[field])

  if (changedOptions.length === 0) return originalOptions

  const changedNames = new Set(changedOptions.map(([name]) => name))
  const preservedOptions = (originalOptions || []).filter((option) => {
    const optionName = option.split('=', 1)[0] as SyncOptionName
    return !changedNames.has(optionName)
  })

  for (const [name, field] of changedOptions) {
    if (values[field]) preservedOptions.push(`${name}=true`)
  }

  return preservedOptions.length > 0 ? preservedOptions : undefined
}

function updateSyncPolicy(
  syncPolicy: SyncPolicy | undefined,
  originalValues: ApplicationSettingsValues,
  values: ApplicationSettingsValues,
) {
  const automatedChanged =
    originalValues.autoSyncEnabled !== values.autoSyncEnabled ||
    originalValues.prune !== values.prune ||
    originalValues.selfHeal !== values.selfHeal ||
    originalValues.allowEmpty !== values.allowEmpty
  const syncOptions = updateSyncOptions(
    syncPolicy?.syncOptions,
    originalValues,
    values,
  )
  const syncOptionsChanged = syncOptions !== syncPolicy?.syncOptions
  const retryChanged =
    originalValues.retryEnabled !== values.retryEnabled ||
    originalValues.retryLimit !== values.retryLimit

  if (!automatedChanged && !syncOptionsChanged && !retryChanged) {
    return syncPolicy
  }

  let nextPolicy: SyncPolicy = { ...syncPolicy }

  if (automatedChanged) {
    if (values.autoSyncEnabled) {
      nextPolicy.automated = {
        ...(syncPolicy?.automated || {}),
        enabled: true,
        prune: values.prune,
        selfHeal: values.selfHeal,
        allowEmpty: values.allowEmpty,
      }
    } else {
      nextPolicy.automated = {
        ...(syncPolicy?.automated || {}),
        enabled: false,
      }
    }
  }

  if (syncOptionsChanged) {
    nextPolicy = syncOptions
      ? { ...nextPolicy, syncOptions }
      : withoutProperty(nextPolicy, 'syncOptions')
  }

  if (retryChanged) {
    if (values.retryEnabled) {
      nextPolicy.retry = {
        ...(syncPolicy?.retry || {
          backoff: {
            duration: '5s',
            factor: 2,
            maxDuration: '3m0s',
          },
        }),
        limit: values.retryLimit,
      }
    } else {
      nextPolicy = withoutProperty(nextPolicy, 'retry')
    }
  }

  return Object.keys(nextPolicy).length > 0 ? nextPolicy : undefined
}

export function buildApplicationSettingsSpec(
  spec: ApplicationSpec,
  values: ApplicationSettingsValues,
): ApplicationSpec {
  const originalValues = getApplicationSettingsValues(spec)
  const unchangedSpec = withoutProperty(withoutProperty(spec, 'source'), 'sources')
  const sourceConfiguration = isMultiSourceSpec(spec)
    ? { sources: spec.sources || [] }
    : { source: updateSource(spec.source, originalValues, values) }
  const syncPolicy = updateSyncPolicy(spec.syncPolicy, originalValues, values)

  const nextSpec: ApplicationSpec = {
    ...unchangedSpec,
    ...sourceConfiguration,
    project: values.project,
    destination: updateDestination(spec.destination, values),
  }

  return syncPolicy
    ? { ...nextSpec, syncPolicy }
    : withoutProperty(nextSpec, 'syncPolicy')
}

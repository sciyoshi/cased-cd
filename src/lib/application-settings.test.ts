import { describe, expect, it } from 'vitest'
import type { ApplicationSpec } from '@/types/api'
import {
  buildApplicationSettingsSpec,
  getApplicationSettingsValues,
} from './application-settings'

describe('application settings spec round trips', () => {
  it('preserves advanced single-source and sync policy fields when unedited', () => {
    const spec = {
      project: 'platform',
      source: {
        repoURL: 'https://charts.example.com',
        chart: 'api',
        targetRevision: '1.2.3',
        helm: {
          valueFiles: ['$values/environments/prod.yaml'],
          parameters: [{ name: 'replicas', value: '5' }],
        },
      },
      destination: {
        server: 'https://prod.example.com',
        namespace: 'api',
      },
      syncPolicy: {
        automated: { prune: true, selfHeal: true, allowEmpty: false },
        syncOptions: [
          'CreateNamespace=true',
          'RespectIgnoreDifferences=true',
          'PrunePropagationPolicy=foreground',
        ],
        retry: {
          limit: 7,
          backoff: { duration: '10s', factor: 3, maxDuration: '10m' },
        },
      },
      ignoreDifferences: [{ group: 'apps', kind: 'Deployment' }],
      revisionHistoryLimit: 20,
    } as ApplicationSpec

    expect(
      buildApplicationSettingsSpec(spec, getApplicationSettingsValues(spec)),
    ).toEqual(spec)
  })

  it('preserves multi-source applications and never emits source and sources together', () => {
    const spec = {
      project: 'default',
      source: {
        repoURL: 'https://invalid.example.com/legacy.git',
        path: 'legacy',
      },
      sources: [
        {
          repoURL: 'https://charts.example.com',
          chart: 'api',
          targetRevision: '1.0.0',
          helm: { valueFiles: ['$values/prod.yaml'] },
        },
        {
          repoURL: 'https://github.com/example/values.git',
          targetRevision: 'main',
        },
      ],
      destination: { name: 'production', namespace: 'api' },
      syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
    } satisfies ApplicationSpec
    const values = getApplicationSettingsValues(spec)

    expect(values.sourceReadOnly).toBe(true)
    const result = buildApplicationSettingsSpec(spec, {
      ...values,
      project: 'production',
      repoURL: 'https://ignored.example.com',
    })

    expect(result).toMatchObject({
      project: 'production',
      sources: spec.sources,
      destination: { name: 'production', namespace: 'api' },
      syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
    })
    expect(result).not.toHaveProperty('source')
    expect(result.destination).not.toHaveProperty('server')
  })

  it('updates named destinations without converting them to server destinations', () => {
    const spec: ApplicationSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/example/app.git' },
      destination: { name: 'in-cluster', namespace: 'default' },
    }
    const result = buildApplicationSettingsSpec(spec, {
      ...getApplicationSettingsValues(spec),
      destinationCluster: 'production',
      destinationNamespace: 'apps',
    })

    expect(result.destination).toEqual({ name: 'production', namespace: 'apps' })
    expect(result.destination).not.toHaveProperty('server')
  })

  it('changes represented sync options without discarding custom options', () => {
    const spec: ApplicationSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/example/app.git' },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
      syncPolicy: {
        syncOptions: [
          'CreateNamespace=true',
          'RespectIgnoreDifferences=true',
          'ServerSideApply=false',
        ],
      },
    }
    const values = getApplicationSettingsValues(spec)
    const result = buildApplicationSettingsSpec(spec, {
      ...values,
      createNamespace: false,
      serverSideApply: true,
    })

    expect(result.syncPolicy?.syncOptions).toEqual([
      'RespectIgnoreDifferences=true',
      'ServerSideApply=true',
    ])
  })

  it('preserves custom retry backoff when only the limit changes', () => {
    const spec: ApplicationSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/example/app.git' },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
      syncPolicy: {
        retry: {
          limit: 3,
          backoff: { duration: '30s', factor: 4, maxDuration: '20m' },
        },
      },
    }
    const result = buildApplicationSettingsSpec(spec, {
      ...getApplicationSettingsValues(spec),
      retryLimit: 8,
    })

    expect(result.syncPolicy?.retry).toEqual({
      limit: 8,
      backoff: { duration: '30s', factor: 4, maxDuration: '20m' },
    })
  })

  it('does not convert a Helm chart source into an invalid chart-and-path source', () => {
    const spec: ApplicationSpec = {
      project: 'default',
      source: {
        repoURL: 'https://charts.example.com',
        chart: 'api',
        targetRevision: '1.0.0',
      },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
    }
    const result = buildApplicationSettingsSpec(spec, {
      ...getApplicationSettingsValues(spec),
      path: 'manifests',
    })

    expect(result.source).toEqual(spec.source)
    expect(result.source).not.toHaveProperty('path')
  })

  it('disables automated sync without discarding its saved behavior', () => {
    const spec: ApplicationSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/example/app.git' },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
      syncPolicy: {
        automated: { prune: true, selfHeal: true, allowEmpty: true },
      },
    }
    const result = buildApplicationSettingsSpec(spec, {
      ...getApplicationSettingsValues(spec),
      autoSyncEnabled: false,
    })

    expect(result.syncPolicy?.automated).toEqual({
      enabled: false,
      prune: true,
      selfHeal: true,
      allowEmpty: true,
    })
  })

  it('respects an explicitly disabled automated policy', () => {
    const spec: ApplicationSpec = {
      project: 'default',
      source: { repoURL: 'https://github.com/example/app.git' },
      destination: { server: 'https://kubernetes.default.svc', namespace: 'default' },
      syncPolicy: {
        automated: { enabled: false, prune: true, selfHeal: true },
      },
    }

    const values = getApplicationSettingsValues(spec)
    expect(values.autoSyncEnabled).toBe(false)
    expect(buildApplicationSettingsSpec(spec, values)).toEqual(spec)
  })
})

import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Application } from '@/types/api'
import { ApplicationTable } from './application-table'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    ...props
  }: {
    children: ReactNode
    params: { name: string }
    search?: { appNamespace?: string }
  }) => (
    <a
      href={`/applications/${params.name}/tree${search?.appNamespace ? `?appNamespace=${search.appNamespace}` : ''}`}
      {...props}
    >
      {children}
    </a>
  ),
}))

const application: Application = {
  metadata: {
    name: 'guestbook',
    namespace: 'argocd',
  },
  spec: {
    project: 'default',
    destination: {
      name: 'in-cluster',
      namespace: 'guestbook',
    },
    source: {
      repoURL: 'https://github.com/argoproj/argocd-example-apps.git',
      path: 'guestbook',
    },
  },
  status: {
    health: { status: 'Healthy' },
    sync: { status: 'Synced' },
  },
}

describe('ApplicationTable', () => {
  it('renders application status and destination details', () => {
    render(<ApplicationTable applications={[application]} />)

    expect(screen.getByRole('link', { name: 'guestbook' })).toHaveAttribute(
      'href',
      '/applications/guestbook/tree?appNamespace=argocd',
    )
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    expect(screen.getByText('Synced')).toBeInTheDocument()
    expect(screen.getByText('argoproj/argocd-example-apps')).toBeInTheDocument()
    expect(screen.getByText('in-cluster')).toBeInTheDocument()
    expect(screen.getByText('Namespace: guestbook')).toBeInTheDocument()
    expect(screen.getByText('Never')).toBeInTheDocument()
  })

  it('handles multi-source applications and running operations', () => {
    const multiSourceApplication: Application = {
      ...application,
      metadata: { ...application.metadata, name: 'multi-source' },
      spec: {
        ...application.spec,
        source: undefined,
        sources: [
          { repoURL: 'https://github.com/example/config.git' },
          { repoURL: 'https://charts.example.com' },
        ],
      },
      status: {
        ...application.status,
        operationState: { phase: 'Running' },
      },
    }

    render(<ApplicationTable applications={[multiSourceApplication]} />)

    expect(screen.getByText('example/config +1 more')).toBeInTheDocument()
    expect(screen.getByText('Syncing')).toBeInTheDocument()
  })

  it('links same-name applications to their distinct namespaces', () => {
    const teamApplication: Application = {
      ...application,
      metadata: { ...application.metadata, namespace: 'team-a' },
    }

    render(<ApplicationTable applications={[application, teamApplication]} />)

    expect(screen.getAllByRole('link', { name: 'guestbook' }).map((link) => link.getAttribute('href')))
      .toEqual([
        '/applications/guestbook/tree?appNamespace=argocd',
        '/applications/guestbook/tree?appNamespace=team-a',
      ])
  })
})

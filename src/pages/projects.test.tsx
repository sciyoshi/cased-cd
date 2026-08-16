import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from './projects'

const refetch = vi.fn()
const deleteProject = vi.fn()

vi.mock('@/services/projects', () => ({
  useProjects: () => ({
    data: {
      items: [
        {
          metadata: { name: 'default' },
          spec: { sourceRepos: ['*'], destinations: [], roles: [] },
        },
        {
          metadata: { name: 'platform' },
          spec: { sourceRepos: ['*'], destinations: [], roles: [] },
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch,
  }),
  useDeleteProject: () => ({ mutateAsync: deleteProject, isPending: false }),
  useCreateProject: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

describe('ProjectsPage accessibility', () => {
  it('names each available project delete action contextually', () => {
    render(<ProjectsPage />)

    expect(screen.getByRole('button', { name: 'Delete project platform' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete project default' })).not.toBeInTheDocument()
    expect(screen.getByText('Actions')).toHaveClass('sr-only')
  })
})

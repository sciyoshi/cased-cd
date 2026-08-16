import { IconClose, IconFolder } from 'obra-icons-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCreateProject } from '@/services/projects'
import { toast } from 'sonner'
import { parseProjectDestinations } from '@/lib/project-destinations'

interface CreateProjectPanelProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CreateProjectPanel({ isOpen, onClose, onSuccess }: CreateProjectPanelProps) {
  const createMutation = useCreateProject()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sourceRepos: '',
    destinations: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation
    const newErrors: Record<string, string> = {}
    if (!formData.name) newErrors.name = 'Project name is required'
    if (formData.name && !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(formData.name)) {
      newErrors.name = 'Name must be lowercase alphanumeric with hyphens (RFC 1123)'
    }

    const destinationResult = parseProjectDestinations(formData.destinations)
    if (!destinationResult.ok) {
      newErrors.destinations = destinationResult.error
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    try {
      // Parse source repos (comma or newline separated)
      const sourceRepos = formData.sourceRepos
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(s => s.length > 0)

      const destinations = destinationResult.ok ? destinationResult.destinations : []

      // Create minimal project - ArgoCD has very specific requirements
      const project = {
        metadata: {
          name: formData.name,
        },
        spec: {
          sourceRepos: sourceRepos.length > 0 ? sourceRepos : ['*'],
          destinations: destinations.length > 0 ? destinations : [
            {
              server: '*',  // Wildcard to allow all clusters
              namespace: '*'
            }
          ],
          ...(formData.description ? { description: formData.description } : {}),
        },
      }

      console.log('Creating project with payload:', JSON.stringify(project, null, 2))

      await createMutation.mutateAsync(project)
      toast.success('Project created', {
        description: `Successfully created project "${formData.name}"`,
      })
      onSuccess?.()
      onClose()

      // Reset form
      setFormData({
        name: '',
        description: '',
        sourceRepos: '',
        destinations: '',
      })
      setErrors({})
    } catch (error) {
      console.error('Create project failed:', error)
      toast.error('Failed to create project', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to create project' })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-black border-l border-neutral-200 dark:border-neutral-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
              <IconFolder size={16} className="text-neutral-600 dark:text-neutral-400" />
            </div>
            <h2 className="text-lg font-semibold text-black dark:text-white">Create Project</h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            <IconClose size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Project Name *
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="my-project"
              />
              {errors.name && <p className="text-sm text-red-400 mt-1">{errors.name}</p>}
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Must be lowercase alphanumeric with hyphens (e.g., my-project)
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Description (optional)
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this project"
              />
            </div>

            {/* Source Repositories */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Source Repositories (optional)
              </label>
              <textarea
                value={formData.sourceRepos}
                onChange={(e) => setFormData({ ...formData, sourceRepos: e.target.value })}
                placeholder="https://github.com/org/repo1&#10;https://github.com/org/repo2&#10;&#10;Leave empty to allow all repositories (*)"
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono min-h-[120px]"
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                One repository URL per line. Use * to allow all repositories.
              </p>
            </div>

            {/* Destinations */}
            <div>
              <label
                htmlFor="project-destinations"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
              >
                Destinations (optional)
              </label>
              <textarea
                id="project-destinations"
                value={formData.destinations}
                onChange={(e) => setFormData({ ...formData, destinations: e.target.value })}
                placeholder="name=in-cluster | namespace=default&#10;name=production | namespace=apps&#10;server=https://kubernetes.default.svc | namespace=staging&#10;&#10;Leave empty to allow all clusters and namespaces"
                aria-invalid={!!errors.destinations}
                aria-describedby={errors.destinations ? 'project-destinations-error project-destinations-help' : 'project-destinations-help'}
                className="w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono min-h-[120px]"
              />
              {errors.destinations && (
                <p id="project-destinations-error" className="mt-1 text-sm text-red-400">
                  {errors.destinations}
                </p>
              )}
              <p id="project-destinations-help" className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                One per line. Use server=&lt;HTTP(S) URL&gt; or name=&lt;cluster&gt;, then | namespace=&lt;namespace&gt;.
                Leave empty to allow all clusters and namespaces (*/*).
              </p>
            </div>

            {/* Info Box */}
            <div className="rounded-md border border-blue-500/20 bg-blue-500/10 p-3">
              <p className="text-xs text-blue-400">
                Projects provide logical grouping and RBAC boundaries for applications. After creating a project, you can configure additional settings like resource whitelists, roles, and sync windows.
              </p>
            </div>

            {/* Error message */}
            {errors.submit && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3">
                <p className="text-sm text-red-400">{errors.submit}</p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </div>
    </div>
  )
}

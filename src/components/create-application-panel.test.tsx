import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateApplicationPanel } from './create-application-panel'

const mocks = vi.hoisted(() => ({
  createApplication: vi.fn(),
}))

vi.mock('@/services/applications', () => ({
  useCreateApplication: () => ({
    mutateAsync: mocks.createApplication,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('@/services/projects', () => ({
  useProjects: () => ({
    data: {
      items: [
        { metadata: { name: 'default' } },
        { metadata: { name: 'test-project' } },
      ],
    },
  }),
}))

describe('CreateApplicationPanel', () => {
  let queryClient: QueryClient
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    vi.clearAllMocks()
    mocks.createApplication.mockResolvedValue(undefined)
  })

  const renderPanel = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <CreateApplicationPanel onClose={mockOnClose} onSuccess={mockOnSuccess} />
      </QueryClientProvider>
    )
  }

  const showYamlEditor = () => {
    fireEvent.click(screen.getByRole('button', { name: /YAML/ }))
    return screen.getByLabelText('Application Manifest')
  }

  const submitYaml = async (manifest: string) => {
    fireEvent.change(showYamlEditor(), { target: { value: manifest } })
    fireEvent.click(screen.getByRole('button', { name: 'Create Application' }))
    await waitFor(() => expect(screen.queryByText('Creating...')).not.toBeInTheDocument())
  }

  it('should render the create application form', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Create Application' })).toBeInTheDocument()
    expect(screen.getByText('Deploy a new application to your cluster')).toBeInTheDocument()
  })

  it('should mark required fields with asterisk', () => {
    renderPanel()
    expect(screen.getByText('Application Name *')).toBeInTheDocument()
    expect(screen.getByText('Repository URL *')).toBeInTheDocument()
    expect(screen.getByText('Path *')).toBeInTheDocument()
    expect(screen.getByText('Namespace *')).toBeInTheDocument()
  })

  it('should show helpful description for Path field', () => {
    renderPanel()
    expect(
      screen.getByText(/Directory path within the repository containing your manifests or Helm chart/)
    ).toBeInTheDocument()
  })

  it('should not submit form when Path is empty', async () => {
    renderPanel()

    // Fill in other required fields
    fireEvent.change(screen.getByPlaceholderText('my-app'), {
      target: { value: 'test-app' },
    })
    fireEvent.change(screen.getByPlaceholderText('https://github.com/argoproj/argocd-example-apps'), {
      target: { value: 'https://github.com/test/repo' },
    })

    // Leave Path empty - get the button and click it
    const submitButton = screen.getByRole('button', { name: /Create Application/ })
    fireEvent.click(submitButton)

    // Form should not submit due to HTML5 validation
    await waitFor(() => {
      expect(mockOnSuccess).not.toHaveBeenCalled()
    })
  })

  it('should have required attribute on Path input', () => {
    renderPanel()
    const pathInput = screen.getByPlaceholderText('guestbook')
    expect(pathInput).toHaveAttribute('required')
  })

  it('should switch between Form and YAML modes', () => {
    renderPanel()

    // Initially in Form mode
    expect(screen.getByPlaceholderText('my-app')).toBeInTheDocument()

    // Click YAML mode button
    const yamlButton = screen.getByRole('button', { name: /YAML/ })
    fireEvent.click(yamlButton)

    // Should show YAML textarea
    expect(screen.getByPlaceholderText(/metadata:/)).toBeInTheDocument()

    // Click Form mode button
    const formButton = screen.getByRole('button', { name: /Form/ })
    fireEvent.click(formButton)

    // Should show form inputs again
    expect(screen.getByPlaceholderText('my-app')).toBeInTheDocument()
  })

  it('creates a valid single-source application without weakening path or chart validation', async () => {
    renderPanel()
    await submitYaml(`
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: single-source
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://charts.example.com
    chart: web
    targetRevision: 1.2.3
  destination:
    server: https://kubernetes.default.svc
    namespace: web
`)

    await waitFor(() => expect(mocks.createApplication).toHaveBeenCalledOnce())
    expect(mocks.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ name: 'single-source' }),
        spec: expect.objectContaining({
          source: {
            repoURL: 'https://charts.example.com',
            chart: 'web',
            targetRevision: '1.2.3',
          },
        }),
      }),
    )
    expect(mockOnSuccess).toHaveBeenCalledOnce()
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('creates a multi-source application with path, chart, and ref sources intact', async () => {
    renderPanel()
    await submitYaml(`
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: multi-source
  namespace: argocd
spec:
  project: default
  sources:
    - repoURL: https://github.com/example/manifests.git
      path: apps/web
      targetRevision: main
      name: manifests
    - repoURL: https://prometheus-community.github.io/helm-charts
      chart: prometheus
      targetRevision: 27.5.1
      helm:
        valueFiles:
          - $values/environments/prod.yaml
    - repoURL: https://github.com/example/values.git
      targetRevision: main
      ref: values
  destination:
    server: https://kubernetes.default.svc
    namespace: monitoring
`)

    await waitFor(() => expect(mocks.createApplication).toHaveBeenCalledOnce())
    const application = mocks.createApplication.mock.calls[0][0]
    expect(application.spec).not.toHaveProperty('source')
    expect(application.spec.sources).toEqual([
      {
        repoURL: 'https://github.com/example/manifests.git',
        path: 'apps/web',
        targetRevision: 'main',
        name: 'manifests',
      },
      {
        repoURL: 'https://prometheus-community.github.io/helm-charts',
        chart: 'prometheus',
        targetRevision: '27.5.1',
        helm: { valueFiles: ['$values/environments/prod.yaml'] },
      },
      {
        repoURL: 'https://github.com/example/values.git',
        targetRevision: 'main',
        ref: 'values',
      },
    ])
    expect(mockOnSuccess).toHaveBeenCalledOnce()
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('rejects manifests that define both source and sources', async () => {
    renderPanel()
    await submitYaml(`
metadata:
  name: ambiguous
spec:
  source:
    repoURL: https://github.com/example/app.git
    path: app
  sources:
    - repoURL: https://github.com/example/app.git
      path: app
  destination:
    namespace: default
`)

    expect(screen.getByText('spec.source and spec.sources are mutually exclusive')).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('rejects manifests that define neither source form', async () => {
    renderPanel()
    await submitYaml(`
metadata:
  name: missing-source
spec:
  destination:
    namespace: default
`)

    expect(screen.getByText('Either spec.source or spec.sources is required')).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('keeps single-source path-or-chart validation strict', async () => {
    renderPanel()
    await submitYaml(`
metadata:
  name: incomplete-single
spec:
  source:
    repoURL: https://github.com/example/app.git
  destination:
    namespace: default
`)

    expect(screen.getByText('Either spec.source.path or spec.source.chart is required')).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('requires a non-empty multi-source list and validates each repository', async () => {
    renderPanel()
    await submitYaml(`
metadata:
  name: empty-sources
spec:
  sources: []
  destination:
    namespace: default
`)

    expect(screen.getByText('spec.sources must contain at least one source')).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Application Manifest'), {
      target: {
        value: `
metadata:
  name: missing-repository
spec:
  sources:
    - path: app
  destination:
    namespace: default
`,
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Application' }))

    expect(await screen.findByText('Repository URL is required in spec.sources[0].repoURL')).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('requires each multi-source entry to provide path, chart, or ref', async () => {
    renderPanel()
    await submitYaml(`
metadata:
  name: incomplete-multi
spec:
  sources:
    - repoURL: https://github.com/example/app.git
      targetRevision: main
  destination:
    namespace: default
`)

    expect(
      screen.getByText(
        'One of spec.sources[0].path, spec.sources[0].chart, or spec.sources[0].ref is required',
      ),
    ).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()
  })

  it('rejects ref sources that also define an unsupported chart', async () => {
    renderPanel()
    await submitYaml(`
metadata:
  name: invalid-ref-chart
spec:
  sources:
    - repoURL: https://charts.example.com
      chart: web
      ref: values
  destination:
    namespace: default
`)

    expect(screen.getByText('spec.sources[0] cannot define both chart and ref')).toBeInTheDocument()
    expect(mocks.createApplication).not.toHaveBeenCalled()
  })
})

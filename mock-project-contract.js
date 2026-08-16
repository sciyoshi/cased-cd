function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDnsSubdomain(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 253 &&
    value.split('.').every(label =>
      label.length <= 63 && /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(label)
    )
  )
}

function validationError() {
  return {
    status: 400,
    body: {
      error: 'Invalid project request: expected { project: { metadata: { name }, spec } }',
    },
  }
}

export function createMockProject(
  requestBody,
  projects,
  now = () => new Date().toISOString(),
) {
  if (!isPlainObject(requestBody) || !isPlainObject(requestBody.project)) {
    return validationError()
  }

  const { project } = requestBody
  if (
    !isPlainObject(project.metadata) ||
    !isDnsSubdomain(project.metadata.name) ||
    !isPlainObject(project.spec) ||
    (project.metadata.namespace !== undefined &&
      !isDnsSubdomain(project.metadata.namespace))
  ) {
    return validationError()
  }

  const { name } = project.metadata
  if (projects.some(existing => existing.metadata?.name === name)) {
    return {
      status: 409,
      body: { error: `Project "${name}" already exists` },
    }
  }

  const newProject = {
    ...project,
    metadata: {
      ...project.metadata,
      namespace: project.metadata.namespace || 'argocd',
      creationTimestamp: now(),
    },
  }
  projects.push(newProject)

  return { status: 201, body: newProject }
}

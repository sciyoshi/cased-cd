import type { Project } from '@/types/api'

type ProjectDestination = NonNullable<Project['spec']['destinations']>[number]

export type ProjectDestinationParseResult =
  | { ok: true; destinations: ProjectDestination[] }
  | { ok: false; error: string }

const FORMAT_GUIDANCE =
  'use "server=<http(s) URL> | namespace=<namespace>" or "name=<cluster> | namespace=<namespace>"'

function invalidLine(lineNumber: number, reason?: string): ProjectDestinationParseResult {
  return {
    ok: false,
    error: `Line ${lineNumber}: ${reason ? `${reason}; ` : ''}${FORMAT_GUIDANCE}.`,
  }
}

export function parseProjectDestinations(input: string): ProjectDestinationParseResult {
  const lines = input
    .split('\n')
    .map((value, index) => ({ value: value.trim(), lineNumber: index + 1 }))
    .filter(({ value }) => value.length > 0)

  const destinations: ProjectDestination[] = []

  for (const { value, lineNumber } of lines) {
    const segments = value.split('|').map(segment => segment.trim())
    if (segments.length !== 2) {
      return invalidLine(lineNumber)
    }

    const fields = new Map<string, string>()
    for (const segment of segments) {
      const separatorIndex = segment.indexOf('=')
      if (separatorIndex <= 0) {
        return invalidLine(lineNumber)
      }

      const key = segment.slice(0, separatorIndex).trim()
      const fieldValue = segment.slice(separatorIndex + 1).trim()
      if (!['server', 'name', 'namespace'].includes(key) || !fieldValue || fields.has(key)) {
        return invalidLine(lineNumber)
      }

      fields.set(key, fieldValue)
    }

    const server = fields.get('server')
    const name = fields.get('name')
    const namespace = fields.get('namespace')

    if (!namespace || (server ? 1 : 0) + (name ? 1 : 0) !== 1) {
      return invalidLine(lineNumber)
    }

    if (server) {
      try {
        const url = new URL(server)
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
          return invalidLine(lineNumber, 'server must be a valid HTTP(S) URL')
        }
      } catch {
        return invalidLine(lineNumber, 'server must be a valid HTTP(S) URL')
      }

      destinations.push({ server, namespace })
    } else {
      destinations.push({ name, namespace })
    }
  }

  return { ok: true, destinations }
}

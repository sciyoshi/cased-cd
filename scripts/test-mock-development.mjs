import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import net from 'node:net'
import path from 'node:path'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const processes = []

function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => reject(new Error(`Port ${port} is already in use`)))
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close(() => {
        if (port === null) {
          reject(new Error('Could not allocate a frontend smoke-test port'))
        } else {
          resolve(port)
        }
      })
    })
  })
}

function startProcess(name, args) {
  const environment = { ...process.env }
  delete environment.PORT

  const child = spawn(npmCommand, args, {
    cwd: repositoryRoot,
    detached: process.platform !== 'win32',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const state = { child, name, output: '' }
  const appendOutput = chunk => {
    state.output = `${state.output}${chunk}`.slice(-12_000)
  }
  child.stdout.on('data', appendOutput)
  child.stderr.on('data', appendOutput)
  processes.push(state)
  return state
}

async function waitForResponse(url, processState, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (processState.child.exitCode !== null) {
      throw new Error(`${processState.name} exited early:\n${processState.output}`)
    }

    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {
      // The server is still starting.
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`Timed out waiting for ${url}:\n${processState.output}`)
}

async function stopProcess({ child }) {
  if (child.exitCode !== null || child.pid === undefined) return

  const exited = once(child, 'exit').then(() => true)
  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM')
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    return
  }

  const stopped = await Promise.race([
    exited,
    new Promise(resolve => setTimeout(() => resolve(false), 3_000)),
  ])
  if (!stopped) {
    try {
      if (process.platform === 'win32') {
        child.kill('SIGKILL')
      } else {
        process.kill(-child.pid, 'SIGKILL')
      }
    } catch {
      // The process exited between the timeout and forced cleanup.
    }
  }
}

try {
  await assertPortAvailable(3000)
  const vitePort = await getAvailablePort()

  const mockServer = startProcess('mock API', ['run', 'dev:mock'])
  await waitForResponse('http://127.0.0.1:3000/api/v1/settings', mockServer)

  const viteServer = startProcess('Vite frontend', [
    'run',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(vitePort),
    '--strictPort',
  ])
  await waitForResponse(`http://127.0.0.1:${vitePort}`, viteServer)

  const loginResponse = await fetch(`http://127.0.0.1:${vitePort}/api/v1/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'demo' }),
  })
  if (!loginResponse.ok) {
    throw new Error(`Mock login failed through Vite with HTTP ${loginResponse.status}`)
  }
  const session = await loginResponse.json()
  if (typeof session.token !== 'string' || session.token.length === 0) {
    throw new Error('Mock login did not return a token')
  }

  const applicationsResponse = await fetch(`http://127.0.0.1:${vitePort}/api/v1/applications`, {
    headers: { authorization: `Bearer ${session.token}` },
  })
  if (!applicationsResponse.ok) {
    throw new Error(`Applications failed through Vite with HTTP ${applicationsResponse.status}`)
  }
  const applications = await applicationsResponse.json()
  if (!Array.isArray(applications.items) || applications.items.length === 0) {
    throw new Error('Applications response did not contain mock application data')
  }

  const patchString = JSON.stringify({ spec: { replicas: 4 } })
  const resourcePatchResponse = await fetch(
    `http://127.0.0.1:${vitePort}/api/v1/applications/guestbook/resource?resourceName=guestbook-ui&kind=Deployment&namespace=default&group=apps&version=v1&patchType=application%2Fmerge-patch%2Bjson&appNamespace=argocd`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(patchString),
    },
  )
  if (!resourcePatchResponse.ok) {
    throw new Error(
      `Resource patch failed through Vite with HTTP ${resourcePatchResponse.status}`,
    )
  }

  const disallowedOriginResponse = await fetch('http://127.0.0.1:3000/api/v1/settings', {
    headers: { origin: 'https://attacker.example' },
  })
  if (disallowedOriginResponse.headers.has('access-control-allow-origin')) {
    throw new Error('Mock API granted CORS access to an untrusted origin')
  }

  const allowedOriginResponse = await fetch('http://127.0.0.1:3000/api/v1/settings', {
    headers: { origin: 'http://localhost:5173' },
  })
  if (allowedOriginResponse.headers.get('access-control-allow-origin') !== 'http://localhost:5173') {
    throw new Error('Mock API did not grant CORS access to the documented Vite origin')
  }

  const secretPath = 'must-not-appear-in-helper-logs'
  const ssrfResponse = await fetch(
    `http://127.0.0.1:${vitePort}/api/v1/notifications/services/test/test/webhook`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: `http://169.254.169.254/${secretPath}` }),
    },
  )
  if (ssrfResponse.status !== 400) {
    throw new Error(`Mock webhook SSRF target was not rejected (HTTP ${ssrfResponse.status})`)
  }
  await new Promise(resolve => setTimeout(resolve, 50))
  if (mockServer.output.includes(secretPath)) {
    throw new Error('Mock webhook logs exposed the secret URL path')
  }

  const oversizedResponse = await fetch('http://127.0.0.1:3000/api/v1/applications', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(70 * 1024) }),
  })
  if (oversizedResponse.status !== 413) {
    throw new Error(`Mock API did not reject an oversized request (HTTP ${oversizedResponse.status})`)
  }

  console.log(
    `Mock development smoke test passed (${applications.items.length} applications loaded, resource patch accepted, helper boundaries enforced)`,
  )
} finally {
  await Promise.all(processes.reverse().map(stopProcess))
}

import { spawn } from 'node:child_process'

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024
const KUBECTL_TIMEOUT_MS = 10_000

export function runKubectl(
  args,
  { input = '', spawnImpl = spawn, timeoutMs = KUBECTL_TIMEOUT_MS } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl('kubectl', args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timeout

    const finish = callback => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback()
    }

    const appendOutput = (current, chunk) => {
      const next = current + chunk.toString()
      if (Buffer.byteLength(next) > MAX_COMMAND_OUTPUT_BYTES) {
        child.kill('SIGKILL')
        finish(() => reject(new Error('kubectl output exceeded the safety limit')))
        return current
      }
      return next
    }

    child.stdout.on('data', chunk => {
      stdout = appendOutput(stdout, chunk)
    })
    child.stderr.on('data', chunk => {
      stderr = appendOutput(stderr, chunk)
    })
    child.stdin.once('error', error => finish(() => reject(error)))
    child.once('error', error => finish(() => reject(error)))
    child.once('close', (code, signal) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`kubectl exited with ${code ?? signal ?? 'unknown status'}`))
        }
      })
    })

    timeout = setTimeout(() => {
      child.kill('SIGKILL')
      finish(() => reject(new Error('kubectl timed out')))
    }, timeoutMs)

    child.stdin.end(input)
  })
}

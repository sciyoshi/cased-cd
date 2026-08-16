// @vitest-environment node

import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { PassThrough, Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { runKubectl } from './kubectl-client.js'

function createFakeChild({ close = true } = {}) {
  const child = new EventEmitter()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn()
  let stdin = ''
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      stdin += chunk.toString()
      callback()
    },
    final(callback) {
      callback()
      if (close) queueMicrotask(() => child.emit('close', 0, null))
    },
  })

  return { child, getStdin: () => stdin }
}

describe('kubectl process execution', () => {
  it('passes hostile request data only through stdin without invoking a shell', async () => {
    const fake = createFakeChild()
    const spawnImpl = vi.fn(() => fake.child)
    const hostileConfig = JSON.stringify({
      data: { "service.attacker": "value'; touch /tmp/cased-cd-pwned; #" },
    })

    await runKubectl(['apply', '-f', '-'], {
      input: hostileConfig,
      spawnImpl,
    })

    expect(spawnImpl).toHaveBeenCalledWith('kubectl', ['apply', '-f', '-'], {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    expect(fake.getStdin()).toBe(hostileConfig)
    const proxySource = readFileSync(new URL('./kubectl-proxy.js', import.meta.url), 'utf8')
    expect(proxySource).not.toMatch(/\bexec\s*\(/)
    expect(proxySource).not.toContain("echo '")
  })

  it('terminates kubectl when its execution timeout expires', async () => {
    const fake = createFakeChild({ close: false })

    await expect(
      runKubectl(['get', 'configmap'], {
        spawnImpl: () => fake.child,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('timed out')
    expect(fake.child.kill).toHaveBeenCalledWith('SIGKILL')
  })
})

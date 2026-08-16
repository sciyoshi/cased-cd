import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const REQUEST_BODY_LIMIT = '64kb'
export const OUTBOUND_TIMEOUT_MS = 5_000

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export function getDevServerHost(environment = process.env) {
  return environment.DEV_SERVER_HOST?.trim() || '127.0.0.1'
}

export function getAllowedOrigins(environment = process.env) {
  const configured = environment.DEV_SERVER_ALLOWED_ORIGINS
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

export function createRestrictedCorsOptions(environment = process.env) {
  const allowedOrigins = getAllowedOrigins(environment)

  return {
    origin(origin, callback) {
      // Requests without an Origin header are local tools or same-origin
      // server-to-server traffic and do not receive a CORS grant.
      callback(null, origin !== undefined && allowedOrigins.has(origin) ? origin : false)
    },
  }
}

export function getConfiguredWebhookHosts(environment = process.env) {
  return new Set(
    (environment.MOCK_WEBHOOK_ALLOWED_HOSTS || '')
      .split(',')
      .map(host => host.trim().toLowerCase())
      .filter(Boolean),
  )
}

function isPublicIpv4(address) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet))) return false

  const [first, second, third] = octets
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false
  if (first === 100 && second >= 64 && second <= 127) return false
  if (first === 169 && second === 254) return false
  if (first === 172 && second >= 16 && second <= 31) return false
  if (first === 192 && second === 0) return false
  if (first === 192 && second === 168) return false
  if (first === 198 && (second === 18 || second === 19)) return false
  if (first === 198 && second === 51 && third === 100) return false
  if (first === 203 && second === 0 && third === 113) return false
  return true
}

function isPublicIp(address) {
  const family = isIP(address)
  if (family === 4) return isPublicIpv4(address)
  if (family !== 6) return false

  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return false
  if (normalized.startsWith('::ffff:')) return false
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return false
  if (/^fe[89ab]/.test(normalized)) return false
  if (/^fe[c-f]/.test(normalized)) return false
  if (normalized.startsWith('ff')) return false
  if (normalized.startsWith('2001:db8:')) return false
  return true
}

export function redactUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    return `${url.protocol}//${url.hostname}/[redacted]`
  } catch {
    return '[invalid URL]'
  }
}

export async function validateOutboundUrl(
  rawUrl,
  { allowedHosts, requiredPathPrefix, lookup = dnsLookup },
) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2_048) {
    throw new Error('Outbound URL is missing or too long')
  }

  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Outbound URL is invalid')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (url.protocol !== 'https:') throw new Error('Outbound URL must use HTTPS')
  if (url.username || url.password) throw new Error('Outbound URL must not contain credentials')
  if (url.port && url.port !== '443') throw new Error('Outbound URL must use the default HTTPS port')
  if (!allowedHosts.has(hostname)) throw new Error('Outbound URL host is not allowlisted')
  if (requiredPathPrefix && !url.pathname.startsWith(requiredPathPrefix)) {
    throw new Error('Outbound URL path is not allowed')
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true })

  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Outbound URL resolves to a non-public address')
  }

  return url
}

export async function postJsonToAllowedTarget(
  rawUrl,
  payload,
  policy,
  { fetchImpl = fetch, lookup = dnsLookup, timeoutMs = OUTBOUND_TIMEOUT_MS } = {},
) {
  const signal = AbortSignal.timeout(timeoutMs)
  const timedOut = new Promise((_, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new Error('Outbound request timed out')),
      { once: true },
    )
  })
  const url = await Promise.race([
    validateOutboundUrl(rawUrl, { ...policy, lookup }),
    timedOut,
  ])

  return fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(policy.headers || {}),
    },
    body: JSON.stringify(payload),
    redirect: 'manual',
    signal,
  })
}

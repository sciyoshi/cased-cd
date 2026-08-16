// Simple kubectl proxy for ArgoCD notifications ConfigMap access
import express from 'express'
import cors from 'cors'
import {
  REQUEST_BODY_LIMIT,
  createRestrictedCorsOptions,
  getDevServerHost,
} from './dev-server-security.js'
import { runKubectl } from './kubectl-client.js'

const app = express()
const PORT = Number(process.env.KUBECTL_PROXY_PORT || 9001)
const DEV_SERVER_HOST = getDevServerHost()

app.use(cors(createRestrictedCorsOptions()))
app.use(express.json({ limit: REQUEST_BODY_LIMIT }))

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

// Get notifications ConfigMap
app.get('/api/v1/notifications/config', async (req, res) => {
  try {
    const { stdout } = await runKubectl([
      'get',
      'configmap',
      'argocd-notifications-cm',
      '-n',
      'argocd',
      '-o',
      'json',
    ])
    const configMap = JSON.parse(stdout)
    res.json(configMap)
  } catch {
    console.error('Error fetching notifications ConfigMap')
    res.status(500).json({ error: 'Failed to fetch notifications ConfigMap' })
  }
})

// Update notifications ConfigMap
app.put('/api/v1/notifications/config', async (req, res) => {
  try {
    const config = req.body

    // First get the current ConfigMap
    if (!isNotificationsConfig(config)) {
      res.status(400).json({ error: 'Invalid notifications configuration' })
      return
    }

    const { stdout } = await runKubectl([
      'get',
      'configmap',
      'argocd-notifications-cm',
      '-n',
      'argocd',
      '-o',
      'json',
    ])
    const configMap = JSON.parse(stdout)

    // Rebuild data object from structured config
    const data = {}

    config.services.forEach((service) => {
      data[`service.${service.name}`] = service.config
    })

    config.templates.forEach((template) => {
      data[`template.${template.name}`] = template.config
    })

    config.triggers.forEach((trigger) => {
      data[`trigger.${trigger.name}`] = trigger.config
    })

    // Update ConfigMap data
    configMap.data = data

    // Apply the updated ConfigMap
    await runKubectl(['apply', '-f', '-'], { input: JSON.stringify(configMap) })

    res.json({ success: true })
  } catch {
    console.error('Error updating notifications ConfigMap')
    res.status(500).json({ error: 'Failed to update notifications ConfigMap' })
  }
})

function isNotificationsConfig(config) {
  if (!config || typeof config !== 'object') return false

  return ['services', 'templates', 'triggers'].every(collection =>
    Array.isArray(config[collection]) &&
    config[collection].every(entry =>
      entry &&
      typeof entry === 'object' &&
      typeof entry.name === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(entry.name) &&
      typeof entry.config === 'string' &&
      entry.config.length <= 32_768
    )
  )
}

app.listen(PORT, DEV_SERVER_HOST, () => {
  console.log(`Kubectl proxy server running on http://${DEV_SERVER_HOST}:${PORT}`)
})

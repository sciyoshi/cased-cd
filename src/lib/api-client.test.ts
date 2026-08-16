/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'

describe('API Client Module', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // Mock window.location
    delete (window as any).location
    ;(window as any).location = { ...originalLocation, href: '' }

    // Mock both current tab-scoped storage and the legacy persistent store.
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    })
    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      writable: true,
    })
  })

  afterEach(() => {
    ;(window as any).location = originalLocation
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('Axios Configuration', () => {
    it('should create axios instance with correct base URL and timeout', async () => {
      const createSpy = vi.spyOn(axios, 'create')

      // Re-import to trigger axios.create
      await import('./api-client')

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: '/api/v1',
          timeout: 30000,
        })
      )
    })
  })

  describe('Request Interceptor', () => {
    it('should register request interceptor', async () => {
      const mockAxios = axios.create()
      const useSpy = vi.spyOn(mockAxios.interceptors.request, 'use')
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      expect(useSpy).toHaveBeenCalled()
    })

    it('should add Authorization header when token exists in sessionStorage', async () => {
      const token = 'test-token-123'
      vi.mocked(sessionStorage.getItem).mockReturnValue(token)

      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const config = { headers: {} as any }
      const result = requestInterceptor(config)

      expect(sessionStorage.getItem).toHaveBeenCalledWith('argocd_token')
      expect(result.headers.Authorization).toBe(`Bearer ${token}`)
    })

    it('migrates a legacy persistent token before authorizing the request', async () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue(null)
      vi.mocked(localStorage.getItem).mockReturnValue('legacy-token')

      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const result = requestInterceptor({ headers: {} as any })

      expect(sessionStorage.setItem).toHaveBeenCalledWith('argocd_token', 'legacy-token')
      expect(localStorage.removeItem).toHaveBeenCalledWith('argocd_token')
      expect(result.headers.Authorization).toBe('Bearer legacy-token')
    })

    it('should not add Authorization header when no token exists', async () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue(null)
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const config = { headers: {} as any }
      const result = requestInterceptor(config)

      expect(result.headers.Authorization).toBeUndefined()
    })

    it('should add Content-Type for POST requests with data', async () => {
      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const config = {
        method: 'post',
        data: { name: 'test' },
        headers: {} as any
      }
      const result = requestInterceptor(config)

      expect(result.headers['Content-Type']).toBe('application/json')
    })

    it('should not add Content-Type for GET requests', async () => {
      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const config = {
        method: 'get',
        headers: {} as any
      }
      const result = requestInterceptor(config)

      expect(result.headers['Content-Type']).toBeUndefined()
    })

    it('should not add Content-Type for POST without data', async () => {
      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const config = {
        method: 'post',
        headers: {} as any
      }
      const result = requestInterceptor(config)

      expect(result.headers['Content-Type']).toBeUndefined()
    })

    it('should always add Accept header', async () => {
      const mockAxios = axios.create()
      let requestInterceptor: any
      vi.spyOn(mockAxios.interceptors.request, 'use').mockImplementation((success) => {
        requestInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const config = { headers: {} as any }
      const result = requestInterceptor(config)

      expect(result.headers.Accept).toBe('application/json')
    })
  })

  describe('Response Interceptor', () => {
    it('should register response interceptor', async () => {
      const mockAxios = axios.create()
      const useSpy = vi.spyOn(mockAxios.interceptors.response, 'use')
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      expect(useSpy).toHaveBeenCalled()
    })

    it('should pass through successful responses', async () => {
      const mockAxios = axios.create()
      let responseInterceptor: any
      vi.spyOn(mockAxios.interceptors.response, 'use').mockImplementation((success) => {
        responseInterceptor = success
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const response = { data: { id: 1 }, status: 200 }
      const result = responseInterceptor(response)

      expect(result).toBe(response)
    })

    it('should handle 401 errors by clearing token and redirecting', async () => {
      const mockAxios = axios.create()
      let errorInterceptor: any
      vi.spyOn(mockAxios.interceptors.response, 'use').mockImplementation((_, error) => {
        errorInterceptor = error
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')
      const { queryClient } = await import('./query-client')
      queryClient.setQueryData(['applications'], [{ metadata: { name: 'private-app' } }])
      let finishCancellation: (() => void) | undefined
      const cancellation = new Promise<void>((resolve) => {
        finishCancellation = resolve
      })
      vi.spyOn(queryClient, 'cancelQueries').mockReturnValue(cancellation)

      const error = {
        response: { status: 401 }
      }

      const handling = errorInterceptor(error).catch(() => undefined)

      expect(window.location.href).toBe('')
      expect(queryClient.getQueryData(['applications'])).toBeDefined()

      finishCancellation?.()
      await handling

      expect(sessionStorage.removeItem).toHaveBeenCalledWith('argocd_token')
      expect(localStorage.removeItem).toHaveBeenCalledWith('argocd_token')
      expect(queryClient.getQueryData(['applications'])).toBeUndefined()
      expect(window.location.href).toBe('/login')
    })

    it('should not redirect on non-401 errors', async () => {
      const mockAxios = axios.create()
      let errorInterceptor: any
      vi.spyOn(mockAxios.interceptors.response, 'use').mockImplementation((_, error) => {
        errorInterceptor = error
        return 0
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      await import('./api-client')

      const error = {
        response: { status: 500 }
      }

      try {
        await errorInterceptor(error)
      } catch (e) {
        // Expected to reject
      }

      expect(sessionStorage.removeItem).not.toHaveBeenCalled()
      expect(localStorage.removeItem).not.toHaveBeenCalled()
      expect(window.location.href).toBe('')
    })
  })

  describe('API Methods Export', () => {
    it('should export api object with HTTP methods', async () => {
      const module = await import('./api-client')
      const { api } = module

      expect(api).toBeDefined()
      expect(typeof api.get).toBe('function')
      expect(typeof api.post).toBe('function')
      expect(typeof api.put).toBe('function')
      expect(typeof api.patch).toBe('function')
      expect(typeof api.delete).toBe('function')
    })

    it('keeps Argo CD requests relative and forwards caller HTTP options', async () => {
      const mockAxios = axios.create()
      const getSpy = vi.spyOn(mockAxios, 'get').mockResolvedValue({
        data: { username: 'admin' },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config: {},
      })
      vi.spyOn(axios, 'create').mockReturnValue(mockAxios)

      const { api } = await import('./api-client')
      const validateStatus = (status: number) => status === 401

      await api.get('/session/userinfo', {
        params: { returnUrl: '/applications' },
        validateStatus,
      })

      expect(getSpy).toHaveBeenCalledWith('/session/userinfo', {
        params: { returnUrl: '/applications' },
        validateStatus,
      })
    })
  })
})

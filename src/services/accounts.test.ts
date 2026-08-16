import { beforeEach, describe, expect, it, vi } from 'vitest'
import api from '@/lib/api-client'
import { accountsApi } from './accounts'

vi.mock('@/lib/api-client', () => ({
  default: { get: vi.fn() },
}))

const mockGet = vi.mocked(api.get)

describe('accountsApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads an authoritative local account by its encoded name', async () => {
    const account = {
      name: 'dev/user',
      enabled: true,
      capabilities: ['login'],
      tokens: [],
    }
    mockGet.mockResolvedValue({ data: account } as never)

    await expect(accountsApi.getAccount('dev/user')).resolves.toEqual(account)
    expect(mockGet).toHaveBeenCalledWith('/account/dev%2Fuser')
  })
})

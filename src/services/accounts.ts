import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api-client'
import type { Account } from '@/types/api'

const ENDPOINTS = {
  account: (name: string) => `/account/${encodeURIComponent(name)}`,
}

export const accountKeys = {
  all: ['accounts'] as const,
  detail: (name: string) => [...accountKeys.all, 'detail', name] as const,
}

export const accountsApi = {
  getAccount: async (name: string): Promise<Account> => {
    const response = await api.get<Account>(ENDPOINTS.account(name))
    return response.data
  },
}

export function useAccount(name: string, enabled = true) {
  return useQuery({
    queryKey: accountKeys.detail(name),
    queryFn: () => accountsApi.getAccount(name),
    enabled: enabled && Boolean(name),
    staleTime: 30 * 1000,
    retry: false,
  })
}

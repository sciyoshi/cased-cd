import type { ArgoCDUserInfo } from '@/lib/auth'

interface AccountSummaryProps {
  userInfo: ArgoCDUserInfo | null
  userInfoError: string | null
}

export function AccountSummary({ userInfo, userInfoError }: AccountSummaryProps) {
  const principal = userInfo?.username || 'Authenticated user'
  const source = userInfoError
    ? 'Identity unavailable'
    : userInfo?.iss === 'argocd'
      ? 'Local Argo CD account'
      : userInfo?.iss || 'Issuer not reported'

  return (
    <div className="min-w-0 flex flex-col gap-0.5 leading-none">
      <span className="truncate text-xs font-medium" title={principal}>
        {principal}
      </span>
      <span className="truncate text-[11px] text-sidebar-foreground/70" title={source}>
        {source}
      </span>
    </div>
  )
}

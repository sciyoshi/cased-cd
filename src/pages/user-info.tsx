import { IconCircleWarning, IconKey, IconShield, IconUser } from 'obra-icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { PageHeader } from '@/components/page-header'
import { useAuth } from '@/lib/auth'
import { useAccount } from '@/services/accounts'

const LOCAL_ISSUER = 'argocd'

export function UserInfoPage() {
  const {
    isLoading,
    refreshAuthentication,
    userInfo,
    userInfoError,
  } = useAuth()
  const isLocalAccount = userInfo?.iss === LOCAL_ISSUER
  const account = useAccount(
    userInfo?.username ?? '',
    Boolean(isLocalAccount && userInfo?.username),
  )

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="User Info"
        description="Identity and claims reported by Argo CD"
      />

      <div className="flex-1 overflow-auto bg-white dark:bg-black">
        {isLoading && (
          <LoadingSpinner message="Loading identity from Argo CD..." />
        )}

        {!isLoading && (!userInfo || userInfoError) && (
          <div className="p-4 max-w-4xl">
            <div role="alert" className="rounded border border-red-500/20 bg-red-500/10 p-4">
              <div className="flex items-start gap-3">
                <IconCircleWarning size={20} className="mt-0.5 shrink-0 text-red-700 dark:text-red-400" />
                <div className="flex-1">
                  <h2 className="text-sm font-medium text-red-800 dark:text-red-300">
                    Identity unavailable
                  </h2>
                  <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                    {userInfoError ?? 'Argo CD did not report an authenticated principal.'}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    onClick={() => void refreshAuthentication()}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && userInfo && !userInfoError && (
          <div className="p-4 max-w-4xl">
            <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 mb-3">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 rounded bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-black dark:text-white">
                  <IconUser size={22} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="break-all text-lg font-semibold text-black dark:text-white">
                      {userInfo.username || 'Username not reported'}
                    </h2>
                    <Badge variant="outline" className="border-green-700 text-green-800 dark:border-green-500 dark:text-green-300">
                      Signed in
                    </Badge>
                  </div>
                  <p className="break-all text-xs text-neutral-600 dark:text-neutral-400">
                    Issuer: <span className="font-mono">{userInfo.iss || 'Not reported by Argo CD'}</span>
                  </p>
                  <div className="mt-2">
                    <Badge variant="outline">
                      {isLocalAccount ? 'Local Argo CD account' : 'External SSO identity'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <section className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
                <h3 className="font-medium text-sm text-black dark:text-white mb-3 flex items-center gap-1.5">
                  <IconShield size={14} />
                  Session claims
                </h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                      Username
                    </dt>
                    <dd className="mt-1 break-all text-xs text-neutral-800 dark:text-neutral-200 font-mono">
                      {userInfo.username || 'Not reported'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                      Issuer
                    </dt>
                    <dd className="mt-1 break-all text-xs text-neutral-800 dark:text-neutral-200 font-mono">
                      {userInfo.iss || 'Not reported'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                      Groups
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {(userInfo.groups ?? []).length > 0 ? (
                        userInfo.groups?.map((group) => (
                          <Badge key={group} variant="outline" className="break-all font-mono">
                            {group}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-600 dark:text-neutral-400">
                          No groups reported by Argo CD
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3">
                <h3 className="font-medium text-sm text-black dark:text-white mb-3 flex items-center gap-1.5">
                  <IconKey size={14} />
                  Account capabilities
                </h3>

                {!isLocalAccount && (
                  <p className="text-xs text-neutral-600 dark:text-neutral-400">
                    Argo CD reports account capabilities only for configured local accounts. Access for this SSO identity is determined from its claims and RBAC policy.
                  </p>
                )}

                {isLocalAccount && account.isLoading && (
                  <LoadingSpinner
                    message="Loading account capabilities..."
                    size="sm"
                    containerHeight="min-h-24"
                  />
                )}

                {isLocalAccount && account.isError && (
                  <div role="alert" className="text-xs text-red-700 dark:text-red-400">
                    <p>Argo CD could not load this local account&apos;s capabilities.</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => void account.refetch()}
                    >
                      Try again
                    </Button>
                  </div>
                )}

                {isLocalAccount && account.data && (
                  <dl className="space-y-3">
                    <div>
                      <dt className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                        Account state
                      </dt>
                      <dd className="mt-1 text-xs text-neutral-800 dark:text-neutral-200">
                        {account.data.enabled ? 'Enabled' : 'Disabled'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[12px] font-medium text-neutral-600 dark:text-neutral-400 uppercase tracking-wider">
                        Capabilities
                      </dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {(account.data.capabilities ?? []).length > 0 ? (
                          account.data.capabilities?.map((capability) => (
                            <Badge key={capability} variant="outline" className="font-mono">
                              {capability}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-xs text-neutral-600 dark:text-neutral-400">
                            No capabilities reported by Argo CD
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

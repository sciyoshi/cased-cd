import {
  IconShieldCheck,
  IconKey,
  IconArrowRight,
  IconServer,
  IconCircleCheck,
  IconCircleClose,
} from "obra-icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAppearance } from "@/lib/theme";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/ui/page-content";
import { useClusters } from "@/services/clusters";
import { useCertificates } from "@/services/certificates";
import { useGPGKeys } from "@/services/gpgkeys";
import type { Cluster } from "@/types/api";

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("response" in error)) {
    return undefined;
  }

  return (error as { response?: { status?: number } }).response?.status;
}

function formatCount(value: number | undefined) {
  return value === undefined ? "Unavailable" : value.toLocaleString();
}

function ClusterSummary({ cluster }: { cluster: Cluster }) {
  const status = cluster.connectionState?.status;
  const name = cluster.name?.trim() || "Name unavailable";
  const server = cluster.server?.trim() || "Endpoint unavailable";

  return (
    <Card className="border-neutral-200 bg-white shadow-none dark:border-neutral-800 dark:bg-neutral-950">
      <CardHeader className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-blue-100 dark:bg-blue-950">
            <IconServer size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold" title={name}>
              {name}
            </h3>
            <CardDescription className="mt-0.5 truncate font-mono text-xs" title={server}>
              {server}
            </CardDescription>
          </div>
          {status ? (
            <Badge variant="outline" className="h-6 shrink-0 gap-1.5">
              {status === "Successful" ? (
                <IconCircleCheck size={12} className="text-grass-11" />
              ) : (
                <IconCircleClose size={12} className="text-red-400" />
              )}
              {status}
            </Badge>
          ) : (
            <Badge variant="outline" className="h-6 shrink-0 text-neutral-500">
              Status unavailable
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <dt className="text-neutral-500 dark:text-neutral-400">Endpoint</dt>
          <dd className="break-all font-mono text-black dark:text-white">{server}</dd>
          <dt className="text-neutral-500 dark:text-neutral-400">Version</dt>
          <dd className="font-mono text-black dark:text-white">
            {cluster.info?.serverVersion || "Unavailable"}
          </dd>
          <dt className="text-neutral-500 dark:text-neutral-400">Applications</dt>
          <dd className="font-mono text-black dark:text-white">
            {formatCount(cluster.info?.applicationsCount)}
          </dd>
          <dt className="text-neutral-500 dark:text-neutral-400">Resources</dt>
          <dd className="font-mono text-black dark:text-white">
            {formatCount(cluster.info?.cacheInfo?.resourcesCount)}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { appearance, setAppearance } = useAppearance();
  const {
    data: clustersData,
    isLoading: clustersLoading,
    error: clustersError,
    refetch: refetchClusters,
  } = useClusters();
  const { data: certsData } = useCertificates();
  const { data: gpgData } = useGPGKeys();
  const clusters = clustersData?.items ?? [];
  const clusterAccessRestricted = getErrorStatus(clustersError) === 403;

  const settingsCards = [
    {
      title: "Certificates",
      description: "Manage TLS certificates",
      icon: IconShieldCheck,
      count: certsData?.items?.length || 0,
      path: "/certificates",
    },
    {
      title: "GPG Keys",
      description: "Configure GPG keys for commit verification",
      icon: IconKey,
      count: gpgData?.items?.length || 0,
      path: "/gpgkeys",
    },
  ];
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Settings"
        description="Configure repositories, clusters, projects, and access control"
      />

      {/* Content */}
      <PageContent>
        <div className="grid gap-2 md:grid-cols-2">
            {settingsCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  onClick={() => card.path && navigate({ to: card.path })}
                  className="group rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 transition-colors hover:border-neutral-300 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer"
                >
                  {/* Icon */}
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded bg-white dark:bg-black mb-2">
                    <Icon size={16} className="text-black dark:text-white" />
                  </div>

                  {/* Content */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-medium text-sm text-black dark:text-white">
                        {card.title}
                      </h3>
                      <IconArrowRight
                        size={14}
                        className="text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {card.description}
                    </p>
                  </div>

                  {/* Count Badge */}
                  <div className="inline-flex items-center rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                    {card.count} {card.count === 1 ? "item" : "items"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full-bleed Divider */}
          <Separator className="my-6 -mx-4 w-[calc(100%+2rem)]" />

          {/* Cluster Info Section */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-black dark:text-white">Clusters</h2>
                {!clustersLoading && !clustersError && (
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {clusters.length} registered {clusters.length === 1 ? "cluster" : "clusters"}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate({ to: "/clusters" })}>
                Manage clusters
              </Button>
            </div>

            {clustersLoading && <LoadingSpinner message="Loading cluster inventory..." />}

            {!clustersLoading && clustersError && clusterAccessRestricted && (
              <div role="alert" className="rounded border border-amber-500/30 bg-amber-500/10 p-4">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Cluster inventory unavailable
                </h3>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Your Argo CD account does not have permission to view registered clusters.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchClusters()}>
                  Try Again
                </Button>
              </div>
            )}

            {!clustersLoading && clustersError && !clusterAccessRestricted && (
              <ErrorAlert
                error={clustersError}
                onRetry={() => refetchClusters()}
                title="Failed to load cluster inventory"
                size="sm"
              />
            )}

            {!clustersLoading && !clustersError && clusters.length === 0 && (
              <Card className="border-dashed border-neutral-300 bg-transparent shadow-none dark:border-neutral-700">
                <CardContent className="p-6 text-center">
                  <IconServer size={24} className="mx-auto mb-2 text-neutral-400" />
                  <h3 className="text-sm font-medium text-black dark:text-white">No clusters registered</h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Argo CD returned an empty cluster inventory.
                  </p>
                </CardContent>
              </Card>
            )}

            {!clustersLoading && !clustersError && clusters.length > 0 && (
              <div className="grid gap-2 lg:grid-cols-2">
                {clusters.map((cluster, index) => (
                  <ClusterSummary
                    key={cluster.server || cluster.name || `cluster-${index}`}
                    cluster={cluster}
                  />
                ))}
              </div>
            )}
          </div>

          {/* General Settings Section */}
          <div>
            <h2 className="text-sm font-semibold text-black dark:text-white mb-3">
              General
            </h2>
            <Card className="border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-none">
              <CardHeader className="p-4">
                <CardTitle className="text-sm">Appearance</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setAppearance("light")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      appearance === "light"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    Light
                  </button>
                  <button
                    onClick={() => setAppearance("dark")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      appearance === "dark"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => setAppearance("system")}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      appearance === "system"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                  >
                    System
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

      </PageContent>
    </div>
  );
}

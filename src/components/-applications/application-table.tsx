import { formatDistanceToNow } from "date-fns";
import { Link } from "@tanstack/react-router";
import {
  IconBrandGithubFill,
  IconCircleCheck,
  IconCircleForward,
  IconCodeBranch,
} from "obra-icons-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getHealthIcon } from "@/lib/status-icons";
import { formatRepoUrl } from "@/lib/utils";
import type { Application, ApplicationSource } from "@/types/api";

interface ApplicationTableProps {
  applications: Application[];
}

function getRepository(app: Application): {
  source?: ApplicationSource;
  additionalSources: number;
} {
  if (app.spec.source) {
    return { source: app.spec.source, additionalSources: 0 };
  }

  return {
    source: app.spec.sources?.[0],
    additionalSources: Math.max((app.spec.sources?.length || 0) - 1, 0),
  };
}

function formatReconciledAt(reconciledAt?: string): string {
  if (!reconciledAt) return "Never";

  const reconciledDate = new Date(reconciledAt);
  if (Number.isNaN(reconciledDate.getTime())) return "Unknown";

  return formatDistanceToNow(reconciledDate, { addSuffix: true });
}

export function ApplicationTable({ applications }: ApplicationTableProps) {
  return (
    <div className="overflow-hidden rounded border border-border bg-card">
      <Table aria-label="Applications">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Application</TableHead>
            <TableHead>Health</TableHead>
            <TableHead>Sync status</TableHead>
            <TableHead>Repository</TableHead>
            <TableHead>Destination</TableHead>
            <TableHead className="text-right">Last reconciled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {applications.map((app) => {
            const healthStatus = app.status?.health?.status || "Unknown";
            const syncStatus = app.status?.sync?.status || "Unknown";
            const operationPhase = app.status?.operationState?.phase;
            const isSyncing =
              operationPhase === "Running" || operationPhase === "Terminating";
            const { icon: HealthIcon, color: healthColor } =
              getHealthIcon(healthStatus);
            const { source, additionalSources } = getRepository(app);
            const repository = source ? formatRepoUrl(source.repoURL) : undefined;
            const destination =
              app.spec.destination.name ||
              app.spec.destination.server ||
              "Unknown cluster";
            const reconciledAt = formatReconciledAt(app.status?.reconciledAt);

            return (
              <TableRow key={`${app.metadata.namespace || ''}/${app.metadata.name}`}>
                <TableCell>
                  <Link
                    to="/applications/$name/tree"
                    params={{ name: app.metadata.name }}
                    search={{ appNamespace: app.metadata.namespace }}
                    className="font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {app.metadata.name}
                  </Link>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Project: {app.spec.project || "default"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <HealthIcon size={14} className={healthColor} />
                    <span>{healthStatus}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    {isSyncing ? (
                      <IconCircleForward
                        size={14}
                        className="animate-spin text-blue-400"
                      />
                    ) : (
                      <IconCircleCheck
                        size={14}
                        className={
                          syncStatus === "Synced"
                            ? "text-grass-11"
                            : "text-warning"
                        }
                      />
                    )}
                    <span>{isSyncing ? "Syncing" : syncStatus}</span>
                  </div>
                </TableCell>
                <TableCell className="max-w-64">
                  {repository ? (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {repository.isGithub ? (
                        <IconBrandGithubFill size={14} />
                      ) : (
                        <IconCodeBranch size={14} />
                      )}
                      <span className="truncate" title={repository.fullUrl}>
                        {repository.displayText}
                        {additionalSources > 0 && ` +${additionalSources} more`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-64">
                  <div className="truncate" title={destination}>
                    {destination}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Namespace: {app.spec.destination.namespace || "default"}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                  {app.status?.reconciledAt ? (
                    <time dateTime={app.status.reconciledAt}>{reconciledAt}</time>
                  ) : (
                    reconciledAt
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

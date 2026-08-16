import { useParams, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/ui/page-header";
import { useProjects } from "@/services/projects";
import { useClusters } from "@/services/clusters";
import {
  useApplication,
  useUpdateApplicationSpec,
} from "@/services/applications";
import { toast } from "sonner";
import {
  buildApplicationSettingsSpec,
  getApplicationSettingsValues,
  hasChartSource,
  isMultiSourceSpec,
  usesNamedDestination,
} from "@/lib/application-settings";

// Validation schema for high-priority settings
const settingsFormSchema = z.object({
  // General
  project: z.string().min(1, "Project is required"),

  // Source
  repoURL: z.string(),
  targetRevision: z.string(),
  path: z.string(),
  sourceReadOnly: z.boolean(),

  // Destination
  destinationCluster: z.string().min(1, "Destination cluster is required"),
  destinationNamespace: z.string().min(1, "Destination namespace is required"),

  // Sync Policy
  autoSyncEnabled: z.boolean(),
  prune: z.boolean(),
  selfHeal: z.boolean(),
  allowEmpty: z.boolean(),

  // Advanced - Sync Options
  createNamespace: z.boolean(),
  pruneLast: z.boolean(),
  applyOutOfSyncOnly: z.boolean(),
  serverSideApply: z.boolean(),

  // Advanced - Retry Strategy
  retryEnabled: z.boolean(),
  retryLimit: z.number().min(1),
}).superRefine((values, context) => {
  if (values.sourceReadOnly) return;

  if (!z.string().url().safeParse(values.repoURL).success) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["repoURL"],
      message: "Must be a valid URL",
    });
  }
  if (!values.targetRevision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["targetRevision"],
      message: "Target revision is required",
    });
  }
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;

interface ApplicationSettingsPageProps {
  appNamespace?: string;
}

export function ApplicationSettingsPage({ appNamespace }: ApplicationSettingsPageProps) {
  const { name } = useParams({ strict: false }) as { name: string };
  const navigate = useNavigate();

  // Fetch application data
  const { data: application, isLoading } = useApplication(name || "", !!name, appNamespace);
  const effectiveAppNamespace = application?.metadata.namespace || appNamespace;

  // Fetch data for dropdowns
  const { data: projectsData } = useProjects();
  const { data: clustersData } = useClusters();

  // Update mutation
  const updateSpecMutation = useUpdateApplicationSpec();

  // Initialize form with current application values
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      project: "default",
      repoURL: "",
      targetRevision: "HEAD",
      path: "",
      sourceReadOnly: false,
      destinationCluster: "",
      destinationNamespace: "",
      autoSyncEnabled: false,
      prune: false,
      selfHeal: false,
      allowEmpty: false,
      createNamespace: false,
      pruneLast: false,
      applyOutOfSyncOnly: false,
      serverSideApply: false,
      retryEnabled: false,
      retryLimit: 2,
    },
  });

  // Reset form when application data loads
  useEffect(() => {
    if (application) {
      form.reset(getApplicationSettingsValues(application.spec));
    }
  }, [application, form]);

  // Watch auto-sync toggle to enable/disable prune and self-heal
  const autoSyncEnabled = form.watch("autoSyncEnabled");
  const retryEnabled = form.watch("retryEnabled");
  const sourceReadOnly = application ? isMultiSourceSpec(application.spec) : false;
  const chartSource = application ? hasChartSource(application.spec) : false;
  const namedDestination = application
    ? usesNamedDestination(application.spec.destination)
    : false;

  const onSubmit = async (values: SettingsFormValues) => {
    if (!application) return;

    try {
      await updateSpecMutation.mutateAsync({
        name: application.metadata.name,
        appNamespace: effectiveAppNamespace,
        spec: buildApplicationSettingsSpec(application.spec, values),
      });

      toast.success("Settings updated", {
        description: "Application settings have been saved successfully",
      });

      navigate({
        to: '/applications/$name/tree',
        params: { name: application.metadata.name },
        search: { appNamespace: effectiveAppNamespace },
      });
    } catch (error) {
      toast.error("Failed to update settings", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleCancel = () => {
    if (application?.metadata.name) {
      navigate({
        to: '/applications/$name/tree',
        params: { name: application.metadata.name },
        search: { appNamespace: effectiveAppNamespace },
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-neutral-500">Application not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <div className="sticky top-0 z-10">
        <PageHeader
          title="Settings"
          description={`Application settings for ${application.metadata.name}`}
        />
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-12 pb-24">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {/* General Settings */}
            <div className="space-y-4">
              <div className="pb-2">
                <h3 className="text-base font-semibold text-black dark:text-white">
                  General
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Basic application configuration
                </p>
              </div>

              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        if (value) field.onChange(value);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projectsData?.items?.map((project) => (
                          <SelectItem
                            key={project.metadata.name}
                            value={project.metadata.name}
                          >
                            {project.metadata.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The project that this application belongs to
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Source Settings */}
            <div className="space-y-4">
              <div className="pb-2">
                <h3 className="text-base font-semibold text-black dark:text-white">
                  Source
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Repository and revision configuration
                </p>
              </div>

              {sourceReadOnly && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                >
                  <p className="font-medium">Multi-source configuration is read-only here</p>
                  <p className="mt-1">
                    All {application.spec.sources?.length || 0} sources and their advanced
                    settings will be preserved when you save other changes. Edit sources
                    with Argo CD YAML or Git instead.
                  </p>
                </div>
              )}

              {chartSource && (
                <div
                  role="status"
                  className="rounded-lg border border-blue-300 bg-blue-50 p-4 text-sm text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100"
                >
                  This application uses the Helm chart <strong>{application.spec.source?.chart}</strong>.
                  Chart sources do not use a Git path, so the path is read-only and will remain unset.
                </div>
              )}

              <FormField
                control={form.control}
                name="repoURL"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Repository URL</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://github.com/example/repo.git"
                        disabled={sourceReadOnly}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The Git repository URL containing your application
                      manifests
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetRevision"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Revision</FormLabel>
                    <FormControl>
                      <Input placeholder="HEAD" disabled={sourceReadOnly} {...field} />
                    </FormControl>
                    <FormDescription>
                      Git branch, tag, or commit SHA (e.g., HEAD, main, v1.0.0)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="path"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Path</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="."
                        disabled={sourceReadOnly || chartSource}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Path within the repository where manifests are located
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Destination Settings */}
            <div className="space-y-4">
              <div className="pb-2">
                <h3 className="text-base font-semibold text-black dark:text-white">
                  Destination
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Deployment target cluster and namespace
                </p>
              </div>

              <FormField
                control={form.control}
                name="destinationCluster"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cluster</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        if (value) field.onChange(value);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a cluster" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clustersData?.items?.map((cluster) => (
                          <SelectItem
                            key={namedDestination ? cluster.name : cluster.server}
                            value={namedDestination ? cluster.name : cluster.server}
                          >
                            {cluster.name || cluster.server}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The Kubernetes cluster where the application will be
                      deployed. This application identifies it by {namedDestination ? "name" : "server URL"}.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="destinationNamespace"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Namespace</FormLabel>
                    <FormControl>
                      <Input placeholder="default" {...field} />
                    </FormControl>
                    <FormDescription>
                      The Kubernetes namespace for deployment
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Sync Policy Settings */}
            <div className="space-y-4">
              <div className="pb-2">
                <h3 className="text-base font-semibold text-black dark:text-white">
                  Sync Policy
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Automated synchronization behavior
                </p>
              </div>

              <FormField
                control={form.control}
                name="autoSyncEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Automated Sync
                      </FormLabel>
                      <FormDescription>
                        Automatically sync when Git repository changes are
                        detected
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {autoSyncEnabled && (
                <>
                  <FormField
                    control={form.control}
                    name="prune"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Prune Resources</FormLabel>
                          <FormDescription>
                            Delete resources that are no longer defined in Git
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="selfHeal"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Self Heal</FormLabel>
                          <FormDescription>
                            Automatically correct drift when cluster state
                            diverges from Git
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="allowEmpty"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Allow Empty</FormLabel>
                          <FormDescription>
                            Allow application to have zero resources
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </>
              )}
            </div>

            {/* Advanced Settings */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced" className="border-none">
                <AccordionTrigger className="py-0 hover:no-underline">
                  <div className="pb-2">
                    <h3 className="text-base font-semibold text-black dark:text-white text-left">
                      Advanced
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 text-left font-normal">
                      Additional sync options and retry strategy
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-4">
                    {/* Sync Options */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-black dark:text-white">
                        Sync Options
                      </p>
                      <p className="text-xs text-neutral-500">
                        Existing Argo CD sync options not shown here are preserved.
                      </p>

                      <FormField
                        control={form.control}
                        name="createNamespace"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal">
                                Auto-Create Namespace
                              </FormLabel>
                              <FormDescription>
                                Automatically create destination namespace if it
                                doesn't exist
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="pruneLast"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal">
                                Prune Last
                              </FormLabel>
                              <FormDescription>
                                Prune resources as final step after all other
                                resources are synced
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="applyOutOfSyncOnly"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal">
                                Apply Out-of-Sync Only
                              </FormLabel>
                              <FormDescription>
                                Only apply resources that are out-of-sync
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="serverSideApply"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal">
                                Server-Side Apply
                              </FormLabel>
                              <FormDescription>
                                Use Kubernetes server-side apply instead of
                                client-side
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Retry Strategy */}
                    <div className="space-y-3 pt-2">
                      <FormField
                        control={form.control}
                        name="retryEnabled"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">
                                Retry Strategy
                              </FormLabel>
                              <FormDescription>
                                Automatically retry failed syncs with backoff
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {retryEnabled && (
                        <FormField
                          control={form.control}
                          name="retryLimit"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Retry Limit</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(parseInt(e.target.value))
                                  }
                                />
                              </FormControl>
                              <FormDescription>
                                Maximum number of retry attempts (default: 2)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
              <Button type="submit" disabled={updateSpecMutation.isPending}>
                {updateSpecMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={updateSpecMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}

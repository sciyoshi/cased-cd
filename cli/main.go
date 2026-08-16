package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strings"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorPurple = "\033[35m"
	colorCyan   = "\033[36m"
	bold        = "\033[1m"

	appNameLabel  = "app.kubernetes.io/name"
	instanceLabel = "app.kubernetes.io/instance"
)

type options struct {
	command      string
	namespace    string
	release      string
	showPassword bool
	help         bool
}

type app struct {
	out    io.Writer
	errOut io.Writer
}

type installation struct {
	Namespace  string
	Release    string
	Deployment *appsv1.Deployment
}

func main() {
	code := run(os.Args[1:], os.Stdout, os.Stderr)
	if code != 0 {
		os.Exit(code)
	}
}

func run(args []string, out, errOut io.Writer) int {
	opts, err := parseOptions(args)
	if err != nil {
		fmt.Fprintf(errOut, "%sError:%s %v\n\n", colorRed, colorReset, err)
		printUsage(errOut)
		return 2
	}

	if opts.help {
		printUsage(out)
		return 0
	}

	application := app{out: out, errOut: errOut}
	switch opts.command {
	case "context":
		return application.handleContext()
	case "access":
		return application.handleAccess(opts)
	case "doctor":
		return application.handleDoctor(opts)
	case "version":
		return application.handleVersion(opts)
	case "local":
		return application.handleLocal(opts)
	default:
		fmt.Fprintf(errOut, "%sError:%s Unknown command %q\n\n", colorRed, colorReset, opts.command)
		printUsage(errOut)
		return 2
	}
}

func parseOptions(args []string) (options, error) {
	var opts options
	for index := 0; index < len(args); index++ {
		argument := args[index]
		switch {
		case argument == "help" || argument == "-h" || argument == "--help":
			opts.help = true
		case argument == "--show-password":
			opts.showPassword = true
		case argument == "-n" || argument == "--namespace":
			index++
			if index == len(args) || args[index] == "" {
				return options{}, fmt.Errorf("%s requires a value", argument)
			}
			opts.namespace = args[index]
		case strings.HasPrefix(argument, "--namespace="):
			opts.namespace = strings.TrimPrefix(argument, "--namespace=")
		case argument == "--release":
			index++
			if index == len(args) || args[index] == "" {
				return options{}, fmt.Errorf("--release requires a value")
			}
			opts.release = args[index]
		case strings.HasPrefix(argument, "--release="):
			opts.release = strings.TrimPrefix(argument, "--release=")
		case strings.HasPrefix(argument, "-"):
			return options{}, fmt.Errorf("unknown option %q", argument)
		case opts.command == "":
			opts.command = argument
		default:
			return options{}, fmt.Errorf("unexpected argument %q", argument)
		}
	}

	if opts.help {
		return opts, nil
	}
	if opts.command == "" {
		return options{}, fmt.Errorf("a command is required")
	}
	if opts.showPassword && opts.command != "local" {
		return options{}, fmt.Errorf("--show-password is only valid with the local command")
	}
	return opts, nil
}

func printUsage(out io.Writer) {
	fmt.Fprintf(out, `%s%scased-cd%s - Cased CD CLI

%sUSAGE:%s
  cased-cd [options] <command>

%sOPTIONS:%s
  %s-n, --namespace%s  Kubernetes namespace containing the Helm release
  %s--release%s        Helm release name; discovered from labels when omitted
  %s--show-password%s  Show the local Argo CD password (local command only)

%sCOMMANDS:%s
  %scontext%s    Show current Kubernetes context and cluster info
  %saccess%s     Show how to access Cased CD
  %sdoctor%s     Check Cased CD installation health
  %sversion%s    Show the installed Cased CD version
  %slocal%s      Check local development environment status
  %shelp%s       Show this help message

%sEXAMPLES:%s
  cased-cd doctor
  cased-cd --namespace platform --release internal-cd access
  cased-cd local --show-password

`, bold+colorCyan, bold, colorReset,
		bold, colorReset,
		bold, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		bold, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		colorGreen, colorReset,
		bold, colorReset)
}

func (a app) handleContext() int {
	fmt.Fprintf(a.out, "\n%s%sKubernetes Context%s\n\n", bold, colorCyan, colorReset)

	kubeConfig := defaultKubeConfig()
	rawConfig, err := kubeConfig.RawConfig()
	if err != nil {
		fmt.Fprintf(a.errOut, "%s✗%s Failed to load kubeconfig: %v\n", colorRed, colorReset, err)
		return 1
	}
	currentContext := rawConfig.CurrentContext
	if currentContext == "" {
		fmt.Fprintf(a.errOut, "%s✗%s No current context set\n", colorRed, colorReset)
		return 1
	}
	contextConfig, ok := rawConfig.Contexts[currentContext]
	if !ok {
		fmt.Fprintf(a.errOut, "%s✗%s Current context %q was not found\n", colorRed, colorReset, currentContext)
		return 1
	}
	cluster, ok := rawConfig.Clusters[contextConfig.Cluster]
	if !ok {
		fmt.Fprintf(a.errOut, "%s✗%s Cluster %q was not found\n", colorRed, colorReset, contextConfig.Cluster)
		return 1
	}

	namespace := contextConfig.Namespace
	if namespace == "" {
		namespace = "default"
	}
	fmt.Fprintf(a.out, "  %sContext:%s       %s\n", bold, colorReset, currentContext)
	fmt.Fprintf(a.out, "  %sCluster:%s       %s\n", bold, colorReset, contextConfig.Cluster)
	fmt.Fprintf(a.out, "  %sServer:%s        %s\n", bold, colorReset, cluster.Server)
	fmt.Fprintf(a.out, "  %sNamespace:%s     %s\n", bold, colorReset, namespace)
	fmt.Fprintf(a.out, "  %sUser:%s          %s\n", bold, colorReset, contextConfig.AuthInfo)

	config, err := kubeConfig.ClientConfig()
	if err == nil {
		if clientset, clientErr := kubernetes.NewForConfig(config); clientErr == nil {
			if serverVersion, versionErr := clientset.Discovery().ServerVersion(); versionErr == nil {
				fmt.Fprintf(a.out, "  %sKubernetes:%s    %s\n", bold, colorReset, serverVersion.GitVersion)
			}
		}
	}
	fprintln(a.out)
	return 0
}

func (a app) handleAccess(opts options) int {
	fmt.Fprintf(a.out, "\n%s%sAccess Cased CD%s\n\n", bold, colorCyan, colorReset)

	config, clientset, fallbackNamespace, err := loadKubeClient()
	if err != nil {
		fmt.Fprintf(a.errOut, "%s✗%s %v\n", colorRed, colorReset, err)
		return 1
	}
	ctx := context.Background()
	install, err := discoverInstallation(ctx, clientset, opts.namespace, opts.release, fallbackNamespace)
	if err != nil {
		a.printDiscoveryError(err, opts)
		return 1
	}
	service, err := findService(ctx, clientset, install)
	if err != nil {
		fmt.Fprintf(a.errOut, "%s✗%s Service for release %q was not found in namespace %q: %v\n", colorRed, colorReset, install.Release, install.Namespace, err)
		return 1
	}

	selector := selectorForRelease(install.Release)
	ingresses, ingressErr := clientset.NetworkingV1().Ingresses(install.Namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if ingressErr == nil {
		var addresses []string
		for _, ingress := range ingresses.Items {
			protocol := "http"
			if len(ingress.Spec.TLS) > 0 {
				protocol = "https"
			}
			for _, rule := range ingress.Spec.Rules {
				if rule.Host != "" {
					addresses = append(addresses, protocol+"://"+rule.Host)
				}
			}
		}
		if len(addresses) > 0 {
			sort.Strings(addresses)
			fmt.Fprintf(a.out, "%s✓%s Ingress configured for %s/%s:\n\n", colorGreen, colorReset, install.Namespace, install.Release)
			for _, address := range addresses {
				fmt.Fprintf(a.out, "  %s%s%s\n", bold, address, colorReset)
			}
			fprintln(a.out)
			return 0
		}
	}

	if service.Spec.Type == corev1.ServiceTypeLoadBalancer {
		fmt.Fprintf(a.out, "%s✓%s LoadBalancer service for %s/%s:\n\n", colorGreen, colorReset, install.Namespace, install.Release)
		if len(service.Status.LoadBalancer.Ingress) == 0 {
			fmt.Fprintf(a.out, "  %sPending...%s (address not yet assigned)\n\n", colorYellow, colorReset)
			return 0
		}
		for _, address := range service.Status.LoadBalancer.Ingress {
			if address.IP != "" {
				fmt.Fprintf(a.out, "  http://%s\n", address.IP)
			} else if address.Hostname != "" {
				fmt.Fprintf(a.out, "  http://%s\n", address.Hostname)
			}
		}
		fprintln(a.out)
		return 0
	}

	fmt.Fprintf(a.out, "%sℹ  No external access configured%s\n\n", colorYellow, colorReset)
	if isInCluster(config) {
		fmt.Fprintf(a.out, "  %s# From inside the cluster:%s\n", colorPurple, colorReset)
		fmt.Fprintf(a.out, "  http://%s.%s.svc.cluster.local\n\n", service.Name, install.Namespace)
	}
	fmt.Fprintf(a.out, "  %s# From your local machine:%s\n", colorPurple, colorReset)
	fmt.Fprintf(a.out, "  kubectl port-forward -n %s svc/%s 8080:80\n", install.Namespace, service.Name)
	fmt.Fprintf(a.out, "  %s# Then open:%s http://localhost:8080\n\n", colorPurple, colorReset)
	return 0
}

func (a app) handleDoctor(opts options) int {
	fmt.Fprintf(a.out, "\n%s%sCased CD Health Check%s\n\n", bold, colorCyan, colorReset)

	_, clientset, fallbackNamespace, err := loadKubeClient()
	if err != nil {
		fmt.Fprintf(a.errOut, "%s✗%s %v\n", colorRed, colorReset, err)
		return 1
	}
	ctx := context.Background()
	install, err := discoverInstallation(ctx, clientset, opts.namespace, opts.release, fallbackNamespace)
	if err != nil {
		a.printDiscoveryError(err, opts)
		a.printInstallGuidance(opts.namespace, fallbackNamespace)
		return 1
	}

	fmt.Fprintf(a.out, "%sRelease:%s %s (namespace %s)\n\n", bold, colorReset, install.Release, install.Namespace)
	allHealthy := true
	fmt.Fprintf(a.out, "%sChecking deployment...%s\n", bold, colorReset)
	deployment := install.Deployment
	if deployment.Status.Replicas > 0 && deployment.Status.ReadyReplicas == deployment.Status.Replicas {
		fmt.Fprintf(a.out, "  %s✓%s %s is healthy (%d/%d replicas ready)\n", colorGreen, colorReset, deployment.Name, deployment.Status.ReadyReplicas, deployment.Status.Replicas)
	} else {
		fmt.Fprintf(a.out, "  %s✗%s %s is unhealthy (%d/%d replicas ready)\n", colorRed, colorReset, deployment.Name, deployment.Status.ReadyReplicas, deployment.Status.Replicas)
		allHealthy = false
	}

	fmt.Fprintf(a.out, "\n%sChecking service...%s\n", bold, colorReset)
	service, serviceErr := findService(ctx, clientset, install)
	if serviceErr != nil {
		fmt.Fprintf(a.out, "  %s✗%s Service not found: %v\n", colorRed, colorReset, serviceErr)
		allHealthy = false
	} else {
		fmt.Fprintf(a.out, "  %s✓%s %s exists\n", colorGreen, colorReset, service.Name)
	}

	fprintln(a.out)
	if !allHealthy {
		fmt.Fprintf(a.out, "%s✗ Some checks failed%s\n\n", colorRed+bold, colorReset)
		return 1
	}
	fmt.Fprintf(a.out, "%s✓ All checks passed!%s\n\n", colorGreen+bold, colorReset)
	return 0
}

func (a app) handleVersion(opts options) int {
	fmt.Fprintf(a.out, "\n%s%sCased CD Version%s\n\n", bold, colorCyan, colorReset)

	_, clientset, fallbackNamespace, err := loadKubeClient()
	if err != nil {
		fmt.Fprintf(a.errOut, "%s✗%s %v\n", colorRed, colorReset, err)
		return 1
	}
	install, err := discoverInstallation(context.Background(), clientset, opts.namespace, opts.release, fallbackNamespace)
	if err != nil {
		a.printDiscoveryError(err, opts)
		return 1
	}

	image := "unknown"
	if len(install.Deployment.Spec.Template.Spec.Containers) > 0 {
		image = install.Deployment.Spec.Template.Spec.Containers[0].Image
	}
	fmt.Fprintf(a.out, "  %sRelease:%s      %s\n", bold, colorReset, install.Release)
	fmt.Fprintf(a.out, "  %sNamespace:%s    %s\n", bold, colorReset, install.Namespace)
	fmt.Fprintf(a.out, "  %sImage:%s        %s\n", bold, colorReset, image)
	if chartVersion := install.Deployment.Labels["helm.sh/chart"]; chartVersion != "" {
		fmt.Fprintf(a.out, "  %sHelm Chart:%s   %s\n", bold, colorReset, chartVersion)
	}
	fprintln(a.out)
	return 0
}

func (a app) handleLocal(opts options) int {
	fmt.Fprintf(a.out, "\n%s%sLocal Development Status%s\n\n", bold, colorCyan, colorReset)

	services := []struct {
		name string
		port string
		url  string
	}{
		{name: "Frontend (Vite)", port: "5173", url: "http://localhost:5173"},
		{name: "Argo CD proxy", port: "8090", url: "http://localhost:8090"},
	}

	fmt.Fprintf(a.out, "%sServices:%s\n", bold, colorReset)
	allRunning := true
	for _, service := range services {
		connection, err := net.DialTimeout("tcp", net.JoinHostPort("localhost", service.port), 100*time.Millisecond)
		if err != nil {
			fmt.Fprintf(a.out, "  %s✗%s %s - Not running\n", colorRed, colorReset, service.name)
			allRunning = false
			continue
		}
		_ = connection.Close()
		fmt.Fprintf(a.out, "  %s✓%s %s - %s%s%s\n", colorGreen, colorReset, service.name, colorCyan, service.url, colorReset)
	}

	fmt.Fprintf(a.out, "\n%sCredentials:%s\n", bold, colorReset)
	credentials, err := os.Open(".argocd-credentials")
	if err != nil {
		fmt.Fprintf(a.out, "  %sℹ%s  No .argocd-credentials file found\n", colorYellow, colorReset)
	} else {
		defer credentials.Close()
		if renderErr := renderCredentials(a.out, credentials, opts.showPassword); renderErr != nil {
			fmt.Fprintf(a.errOut, "%s✗%s Could not read .argocd-credentials: %v\n", colorRed, colorReset, renderErr)
			return 1
		}
	}

	if !allRunning {
		fmt.Fprintf(a.out, "\n%sTo start local development:%s\n\n", bold, colorReset)
		fmt.Fprintf(a.out, "  %s# Create a local cluster and install Argo CD (one time):%s\n", colorPurple, colorReset)
		fmt.Fprintf(a.out, "  ./scripts/setup-argocd.sh\n\n")
		fmt.Fprintf(a.out, "  %s# Start the frontend against the proxy on http://localhost:8090:%s\n", colorPurple, colorReset)
		fmt.Fprintf(a.out, "  pnpm dev:real\n\n")
	} else {
		fmt.Fprintf(a.out, "\n%s✓ All services running!%s\n\n", colorGreen+bold, colorReset)
	}
	return 0
}

func renderCredentials(out io.Writer, credentials io.Reader, showPassword bool) error {
	values := make(map[string]string)
	scanner := bufio.NewScanner(credentials)
	for scanner.Scan() {
		key, value, found := strings.Cut(scanner.Text(), "=")
		if found {
			values[strings.TrimSpace(key)] = strings.TrimSpace(value)
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}

	if username := values["ARGOCD_USERNAME"]; username != "" {
		fmt.Fprintf(out, "  Username: %s\n", username)
	} else {
		fmt.Fprintln(out, "  Username: not configured")
	}
	if password := values["ARGOCD_PASSWORD"]; password != "" {
		if showPassword {
			fmt.Fprintf(out, "  Password: %s\n", password)
		} else {
			fmt.Fprintln(out, "  Password: configured (hidden; use --show-password to display)")
		}
	} else {
		fmt.Fprintln(out, "  Password: not configured")
	}
	return nil
}

func defaultKubeConfig() clientcmd.ClientConfig {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, &clientcmd.ConfigOverrides{})
}

func loadKubeClient() (*rest.Config, kubernetes.Interface, string, error) {
	kubeConfig := defaultKubeConfig()
	fallbackNamespace, _, err := kubeConfig.Namespace()
	if err != nil || fallbackNamespace == "" {
		fallbackNamespace = "default"
	}
	config, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, nil, fallbackNamespace, fmt.Errorf("failed to load kubeconfig: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return config, nil, fallbackNamespace, fmt.Errorf("failed to create Kubernetes client: %w", err)
	}
	return config, clientset, fallbackNamespace, nil
}

func discoverInstallation(ctx context.Context, client kubernetes.Interface, requestedNamespace, requestedRelease, fallbackNamespace string) (installation, error) {
	selector := labels.Set{appNameLabel: "cased-cd"}
	if requestedRelease != "" {
		selector[instanceLabel] = requestedRelease
	}

	listNamespace := requestedNamespace
	deployments, err := client.AppsV1().Deployments(listNamespace).List(ctx, metav1.ListOptions{LabelSelector: selector.String()})
	if err != nil && requestedNamespace == "" && fallbackNamespace != "" {
		deployments, err = client.AppsV1().Deployments(fallbackNamespace).List(ctx, metav1.ListOptions{LabelSelector: selector.String()})
	}
	if err != nil {
		return installation{}, fmt.Errorf("could not discover Cased CD deployments: %w", err)
	}

	candidates := make([]installation, 0, len(deployments.Items))
	for index := range deployments.Items {
		deployment := &deployments.Items[index]
		release := deployment.Labels[instanceLabel]
		if release == "" {
			continue
		}
		candidates = append(candidates, installation{
			Namespace:  deployment.Namespace,
			Release:    release,
			Deployment: deployment.DeepCopy(),
		})
	}
	sort.Slice(candidates, func(left, right int) bool {
		if candidates[left].Namespace == candidates[right].Namespace {
			return candidates[left].Release < candidates[right].Release
		}
		return candidates[left].Namespace < candidates[right].Namespace
	})

	if len(candidates) == 0 {
		target := "the cluster"
		if requestedNamespace != "" {
			target = fmt.Sprintf("namespace %q", requestedNamespace)
		}
		if requestedRelease != "" {
			return installation{}, fmt.Errorf("release %q was not found in %s", requestedRelease, target)
		}
		return installation{}, fmt.Errorf("no Cased CD Helm release was found in %s", target)
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}

	if requestedNamespace == "" && fallbackNamespace != "" {
		var local []installation
		for _, candidate := range candidates {
			if candidate.Namespace == fallbackNamespace {
				local = append(local, candidate)
			}
		}
		if len(local) == 1 {
			return local[0], nil
		}
	}

	names := make([]string, len(candidates))
	for index, candidate := range candidates {
		names[index] = candidate.Namespace + "/" + candidate.Release
	}
	return installation{}, fmt.Errorf("multiple Cased CD releases matched (%s); select one with --namespace and --release", strings.Join(names, ", "))
}

func findService(ctx context.Context, client kubernetes.Interface, install installation) (*corev1.Service, error) {
	services, err := client.CoreV1().Services(install.Namespace).List(ctx, metav1.ListOptions{LabelSelector: selectorForRelease(install.Release)})
	if err != nil {
		return nil, err
	}
	if len(services.Items) == 0 {
		return nil, fmt.Errorf("no matching service")
	}
	if len(services.Items) > 1 {
		return nil, fmt.Errorf("multiple matching services")
	}
	return services.Items[0].DeepCopy(), nil
}

func selectorForRelease(release string) string {
	return labels.Set{appNameLabel: "cased-cd", instanceLabel: release}.String()
}

func (a app) printDiscoveryError(err error, opts options) {
	fmt.Fprintf(a.errOut, "%s✗%s %v\n", colorRed, colorReset, err)
	if opts.namespace == "" || opts.release == "" {
		fmt.Fprintf(a.errOut, "Specify an installation with --namespace and --release if automatic discovery is ambiguous.\n")
	}
}

func (a app) printInstallGuidance(requestedNamespace, fallbackNamespace string) {
	namespace := requestedNamespace
	if namespace == "" {
		namespace = fallbackNamespace
	}
	if namespace == "" {
		namespace = "argocd"
	}
	fmt.Fprintf(a.out, "\n%sCased CD is not installed%s\n\n", colorCyan, colorReset)
	fmt.Fprintf(a.out, "  helm repo add cased https://raw.githubusercontent.com/sciyoshi/cased-cd/gh-pages\n")
	fmt.Fprintf(a.out, "  helm repo update\n")
	fmt.Fprintf(a.out, "  helm install cased-cd cased/cased-cd --namespace %s --create-namespace\n\n", namespace)
	fmt.Fprintf(a.out, "Documentation: https://github.com/sciyoshi/cased-cd\n\n")
}

func isInCluster(config *rest.Config) bool {
	if _, err := os.Stat("/var/run/secrets/kubernetes.io/serviceaccount/token"); err == nil {
		return true
	}
	return config != nil && strings.HasPrefix(config.Host, "https://kubernetes.default")
}

func fprintln(out io.Writer) {
	fmt.Fprintln(out)
}

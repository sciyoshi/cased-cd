package main

import (
	"bytes"
	"context"
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestDiscoverInstallationFindsNondefaultReleaseAndNamespace(t *testing.T) {
	client := fake.NewSimpleClientset(
		deployment("other-release", "platform", "other-release-cased-cd"),
	)

	install, err := discoverInstallation(context.Background(), client, "", "", "default")
	if err != nil {
		t.Fatalf("discoverInstallation returned an error: %v", err)
	}
	if install.Release != "other-release" {
		t.Fatalf("release = %q, want %q", install.Release, "other-release")
	}
	if install.Namespace != "platform" {
		t.Fatalf("namespace = %q, want %q", install.Namespace, "platform")
	}
	if install.Deployment.Name != "other-release-cased-cd" {
		t.Fatalf("deployment = %q, want %q", install.Deployment.Name, "other-release-cased-cd")
	}
}

func TestDiscoverInstallationHonorsReleaseAndNamespace(t *testing.T) {
	client := fake.NewSimpleClientset(
		deployment("first", "platform", "first-cased-cd"),
		deployment("second", "platform", "second-cased-cd"),
		deployment("second", "other", "second-other-cased-cd"),
	)

	install, err := discoverInstallation(context.Background(), client, "platform", "second", "default")
	if err != nil {
		t.Fatalf("discoverInstallation returned an error: %v", err)
	}
	if install.Release != "second" || install.Namespace != "platform" {
		t.Fatalf("installation = %s/%s, want platform/second", install.Namespace, install.Release)
	}
}

func TestDiscoverInstallationPrefersCurrentNamespace(t *testing.T) {
	client := fake.NewSimpleClientset(
		deployment("platform-cd", "platform", "platform-cd-cased-cd"),
		deployment("team-cd", "team", "team-cd-cased-cd"),
	)

	install, err := discoverInstallation(context.Background(), client, "", "", "team")
	if err != nil {
		t.Fatalf("discoverInstallation returned an error: %v", err)
	}
	if install.Release != "team-cd" || install.Namespace != "team" {
		t.Fatalf("installation = %s/%s, want team/team-cd", install.Namespace, install.Release)
	}
}

func TestDiscoverInstallationRequiresSelectionWhenAmbiguous(t *testing.T) {
	client := fake.NewSimpleClientset(
		deployment("first", "platform", "first-cased-cd"),
		deployment("second", "platform", "second-cased-cd"),
	)

	_, err := discoverInstallation(context.Background(), client, "", "", "platform")
	if err == nil {
		t.Fatal("discoverInstallation returned nil error for an ambiguous installation")
	}
	if !strings.Contains(err.Error(), "--namespace and --release") {
		t.Fatalf("error = %q, want selection guidance", err)
	}
}

func TestRenderCredentialsHidesPasswordByDefault(t *testing.T) {
	const secret = "correct-horse-battery-staple"
	credentials := strings.NewReader("ARGOCD_USERNAME=admin\nARGOCD_PASSWORD=" + secret + "\n")
	var output bytes.Buffer

	if err := renderCredentials(&output, credentials, false); err != nil {
		t.Fatalf("renderCredentials returned an error: %v", err)
	}
	if strings.Contains(output.String(), secret) {
		t.Fatalf("default output exposed the password: %q", output.String())
	}
	if !strings.Contains(output.String(), "configured (hidden") {
		t.Fatalf("output = %q, want hidden-password status", output.String())
	}
}

func TestRenderCredentialsCanShowPasswordExplicitly(t *testing.T) {
	const secret = "correct-horse-battery-staple"
	credentials := strings.NewReader("ARGOCD_USERNAME=admin\nARGOCD_PASSWORD=" + secret + "\n")
	var output bytes.Buffer

	if err := renderCredentials(&output, credentials, true); err != nil {
		t.Fatalf("renderCredentials returned an error: %v", err)
	}
	if !strings.Contains(output.String(), "Password: "+secret) {
		t.Fatalf("output = %q, want explicitly requested password", output.String())
	}
}

func TestParseOptionsAcceptsInstallationFlagsBeforeOrAfterCommand(t *testing.T) {
	testCases := [][]string{
		{"--namespace", "platform", "--release", "internal", "doctor"},
		{"doctor", "--namespace=platform", "--release=internal"},
	}
	for _, arguments := range testCases {
		opts, err := parseOptions(arguments)
		if err != nil {
			t.Fatalf("parseOptions(%q) returned an error: %v", arguments, err)
		}
		if opts.command != "doctor" || opts.namespace != "platform" || opts.release != "internal" {
			t.Fatalf("parseOptions(%q) = %#v", arguments, opts)
		}
	}
}

func deployment(release, namespace, name string) *appsv1.Deployment {
	return &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{
		Name:      name,
		Namespace: namespace,
		Labels: map[string]string{
			appNameLabel:  "cased-cd",
			instanceLabel: release,
		},
	}}
}

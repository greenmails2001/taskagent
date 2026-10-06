package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLoadCodexRuntimeConfigSelectsActiveProviderAndDefaults(t *testing.T) {
	home := t.TempDir()
	config := `model = "cx/gpt-6.1-sol"
model_provider = "9router"
model_reasoning_effort = "low"

[model_providers.9router]
name = "9Route"
base_url = "https://route.proj.vn/v1"
wire_api = "responses"
requires_openai_auth = true
`
	if err := os.WriteFile(filepath.Join(home, "config.toml"), []byte(config), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := loadCodexRuntimeConfig(home)
	if err != nil {
		t.Fatalf("loadCodexRuntimeConfig: %v", err)
	}
	if got.ProviderID != "9router" || got.ProviderName != "9Route" {
		t.Fatalf("provider = %#v, want active 9router profile", got)
	}
	if got.BaseURL != "https://route.proj.vn/v1" || got.WireAPI != "responses" {
		t.Fatalf("provider transport = %#v", got)
	}
	if got.DefaultModel != "cx/gpt-6.1-sol" || got.DefaultEffort != "low" {
		t.Fatalf("defaults = %#v", got)
	}
}

func TestLoadCodexRuntimeCredentialUsesConfiguredEnvBeforeAuthFile(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, "auth.json"), []byte(`{"OPENAI_API_KEY":"file-secret"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("N9_TEST_PROVIDER_KEY", "env-secret")

	got, err := loadCodexRuntimeCredential(home, codexRuntimeConfig{EnvKey: "N9_TEST_PROVIDER_KEY", RequiresOpenAIAuth: true})
	if err != nil {
		t.Fatalf("loadCodexRuntimeCredential: %v", err)
	}
	if got != "env-secret" {
		t.Fatalf("credential source = %q, want configured environment variable", got)
	}
}

func TestFetchProviderModelIDsSendsBearerAndProductUserAgent(t *testing.T) {
	var gotAuth, gotUA string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotUA = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"cx/gpt-6.1-sol"},{"id":"cx/future-model"}]}`))
	}))
	defer server.Close()

	got, err := fetchProviderModelIDs(context.Background(), server.Client(), server.URL+"/v1", "secret")
	if err != nil {
		t.Fatalf("fetchProviderModelIDs: %v", err)
	}
	if !reflect.DeepEqual(got, []string{"cx/gpt-6.1-sol", "cx/future-model"}) {
		t.Fatalf("model IDs = %v", got)
	}
	if gotAuth != "Bearer secret" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotUA == "" {
		t.Fatal("User-Agent must be set because Cloudflare rejects the default Go client fingerprint")
	}
}

func TestMergeProviderModelsPreservesUnknownIDsAndMapsBundledMetadata(t *testing.T) {
	bundled := []Model{{
		ID:       "gpt-6.1-sol",
		Label:    "GPT-6.1 Sol",
		Provider: "openai",
		Thinking: &ModelThinking{DefaultLevel: "medium", SupportedLevels: []ThinkingLevel{{Value: "low", Label: "Low"}}},
	}}

	got := mergeProviderModels(
		[]string{"cx/gpt-6.1-sol", "cx/future-model"},
		bundled,
		"cx/gpt-6.1-sol",
		"9Route",
	)
	if len(got) != 2 {
		t.Fatalf("models = %+v", got)
	}
	if got[0].ID != "cx/gpt-6.1-sol" || !got[0].Default || got[0].Thinking == nil {
		t.Fatalf("known provider model did not inherit bundled metadata: %+v", got[0])
	}
	if got[1].ID != "cx/future-model" || got[1].Label != "cx/future-model" {
		t.Fatalf("unknown provider model must remain selectable verbatim: %+v", got[1])
	}
	if got[1].Provider != "9Route" {
		t.Fatalf("provider label = %q", got[1].Provider)
	}
}

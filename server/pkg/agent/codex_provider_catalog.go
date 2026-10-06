package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pelletier/go-toml/v2"
)

const (
	providerCatalogTimeout   = 12 * time.Second
	providerCatalogMaxBytes  = 4 << 20
	providerCatalogUserAgent = "multica-runtime-model-discovery/1.0 codex-cli-compatible"
)

type codexRuntimeConfig struct {
	ProviderID         string
	ProviderName       string
	BaseURL            string
	WireAPI            string
	EnvKey             string
	RequiresOpenAIAuth bool
	DefaultModel       string
	DefaultEffort      string
}

type codexConfigFile struct {
	Model                string                         `toml:"model"`
	ModelProvider        string                         `toml:"model_provider"`
	ModelReasoningEffort string                         `toml:"model_reasoning_effort"`
	ModelProviders       map[string]codexProviderConfig `toml:"model_providers"`
}

type codexProviderConfig struct {
	Name               string `toml:"name"`
	BaseURL            string `toml:"base_url"`
	WireAPI            string `toml:"wire_api"`
	EnvKey             string `toml:"env_key"`
	RequiresOpenAIAuth bool   `toml:"requires_openai_auth"`
}

func effectiveCodexHome() (string, error) {
	if home := strings.TrimSpace(os.Getenv("CODEX_HOME")); home != "" {
		return home, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".codex"), nil
}

func loadCodexRuntimeConfig(codexHome string) (codexRuntimeConfig, error) {
	raw, err := os.ReadFile(filepath.Join(codexHome, "config.toml"))
	if err != nil {
		return codexRuntimeConfig{}, err
	}
	var config codexConfigFile
	if err := toml.Unmarshal(raw, &config); err != nil {
		return codexRuntimeConfig{}, fmt.Errorf("parse Codex config: %w", err)
	}
	providerID := strings.TrimSpace(config.ModelProvider)
	provider, ok := config.ModelProviders[providerID]
	if providerID == "" || !ok {
		return codexRuntimeConfig{}, errors.New("Codex config has no active model provider profile")
	}
	return codexRuntimeConfig{
		ProviderID:         providerID,
		ProviderName:       strings.TrimSpace(provider.Name),
		BaseURL:            strings.TrimRight(strings.TrimSpace(provider.BaseURL), "/"),
		WireAPI:            strings.TrimSpace(provider.WireAPI),
		EnvKey:             strings.TrimSpace(provider.EnvKey),
		RequiresOpenAIAuth: provider.RequiresOpenAIAuth,
		DefaultModel:       strings.TrimSpace(config.Model),
		DefaultEffort:      strings.TrimSpace(config.ModelReasoningEffort),
	}, nil
}

func loadCodexRuntimeCredential(codexHome string, config codexRuntimeConfig) (string, error) {
	if config.EnvKey != "" {
		if value := strings.TrimSpace(os.Getenv(config.EnvKey)); value != "" {
			return value, nil
		}
	}
	if value := strings.TrimSpace(os.Getenv("OPENAI_API_KEY")); value != "" {
		return value, nil
	}
	raw, err := os.ReadFile(filepath.Join(codexHome, "auth.json"))
	if err != nil {
		return "", err
	}
	var auth struct {
		APIKey string `json:"OPENAI_API_KEY"`
		Tokens struct {
			AccessToken string `json:"access_token"`
		} `json:"tokens"`
	}
	if err := json.Unmarshal(raw, &auth); err != nil {
		return "", fmt.Errorf("parse Codex auth: %w", err)
	}
	if value := strings.TrimSpace(auth.APIKey); value != "" {
		return value, nil
	}
	if value := strings.TrimSpace(auth.Tokens.AccessToken); value != "" {
		return value, nil
	}
	return "", errors.New("Codex credential is unavailable")
}

func validateProviderCatalogBaseURL(baseURL string) error {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return fmt.Errorf("invalid provider base URL: %w", err)
	}
	if parsed.Scheme != "https" || parsed.Host == "" {
		return errors.New("provider model discovery requires an HTTPS base URL")
	}
	return nil
}

func fetchProviderModelIDs(ctx context.Context, client *http.Client, baseURL, credential string) ([]string, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+"/models", nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", providerCatalogUserAgent)
	if credential != "" {
		request.Header.Set("Authorization", "Bearer "+credential)
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
		return nil, fmt.Errorf("provider model catalog returned HTTP %d", response.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, providerCatalogMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > providerCatalogMaxBytes {
		return nil, errors.New("provider model catalog exceeds the response limit")
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("parse provider model catalog: %w", err)
	}
	seen := make(map[string]struct{}, len(payload.Data))
	models := make([]string, 0, len(payload.Data))
	for _, entry := range payload.Data {
		id := strings.TrimSpace(entry.ID)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		models = append(models, id)
	}
	if len(models) == 0 {
		return nil, errors.New("provider model catalog is empty")
	}
	return models, nil
}

func mergeProviderModels(ids []string, bundled []Model, defaultModel, providerName string) []Model {
	bundledByID := make(map[string]Model, len(bundled))
	for _, model := range bundled {
		bundledByID[model.ID] = model
	}
	models := make([]Model, 0, len(ids))
	for _, id := range ids {
		lookupID := id
		if slash := strings.IndexByte(id, '/'); slash >= 0 && slash+1 < len(id) {
			lookupID = id[slash+1:]
		}
		model, ok := bundledByID[lookupID]
		if !ok {
			model = Model{Label: id}
		}
		model.ID = id
		model.Default = id == defaultModel
		model.Provider = providerName
		if model.Provider == "" {
			model.Provider = "codex"
		}
		models = append(models, model)
	}
	return models
}

func discoverCodexProviderCatalog(ctx context.Context, bundled []Model) (Catalog, bool) {
	home, err := effectiveCodexHome()
	if err != nil {
		return Catalog{}, false
	}
	config, err := loadCodexRuntimeConfig(home)
	if err != nil || config.BaseURL == "" {
		return Catalog{}, false
	}
	if err := validateProviderCatalogBaseURL(config.BaseURL); err != nil {
		return Catalog{}, false
	}
	credential, err := loadCodexRuntimeCredential(home, config)
	if err != nil && config.RequiresOpenAIAuth {
		return Catalog{}, false
	}
	requestCtx, cancel := context.WithTimeout(ctx, providerCatalogTimeout)
	defer cancel()
	ids, err := fetchProviderModelIDs(requestCtx, http.DefaultClient, config.BaseURL, credential)
	if err != nil {
		return Catalog{}, false
	}
	return Catalog{
		Models:                 mergeProviderModels(ids, bundled, config.DefaultModel, config.ProviderName),
		UpstreamProvider:       config.ProviderID,
		UpstreamProviderName:   config.ProviderName,
		CatalogSource:          "provider_api",
		EffectiveDefaultModel:  config.DefaultModel,
		EffectiveDefaultEffort: config.DefaultEffort,
	}, true
}

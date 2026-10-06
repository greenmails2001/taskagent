package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type updateAgentAIConfigurationRequest struct {
	AIProviderID      string  `json:"ai_provider_id"`
	ProviderModelID   string  `json:"provider_model_id"`
	ProviderAccountID *string `json:"provider_account_id"`
	EffortKey         *string `json:"effort_key"`
}

type agentAIConfigurationResponse struct {
	AgentID           string  `json:"agent_id"`
	RuntimeID         string  `json:"runtime_id"`
	AIProviderID      string  `json:"ai_provider_id"`
	AIProviderKey     string  `json:"ai_provider_key"`
	CredentialMode    string  `json:"credential_mode"`
	ProviderAccountID *string `json:"provider_account_id"`
	ProviderModelID   string  `json:"provider_model_id"`
	Model             string  `json:"model"`
	EffortKey         *string `json:"effort_key"`
}

type agentAIConfigurationProfileResponse struct {
	AIProviderID      string  `json:"ai_provider_id"`
	ProviderAccountID *string `json:"provider_account_id"`
	ProviderModelID   string  `json:"provider_model_id"`
	EffortKey         *string `json:"effort_key"`
}

func listAgentAIConfigurationProfiles(ctx context.Context, dbtx interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, agentID pgtype.UUID) ([]agentAIConfigurationProfileResponse, error) {
	rows, err := dbtx.Query(ctx, `
		SELECT ai_provider_id, provider_account_id, provider_model_id, effort_key
		FROM agent_ai_configuration_profile
		WHERE agent_id = $1
		ORDER BY created_at, id
	`, agentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	profiles := make([]agentAIConfigurationProfileResponse, 0)
	for rows.Next() {
		var providerID, accountID, modelID pgtype.UUID
		var effortKey pgtype.Text
		if err := rows.Scan(&providerID, &accountID, &modelID, &effortKey); err != nil {
			return nil, err
		}
		profile := agentAIConfigurationProfileResponse{
			AIProviderID:    util.UUIDToString(providerID),
			ProviderModelID: util.UUIDToString(modelID),
		}
		if accountID.Valid {
			value := util.UUIDToString(accountID)
			profile.ProviderAccountID = &value
		}
		if effortKey.Valid {
			profile.EffortKey = &effortKey.String
		}
		profiles = append(profiles, profile)
	}
	return profiles, rows.Err()
}

// ListCompatibleAIProviders returns model API providers compatible with the
// selected executable runtime. A provider is not a runtime and is never
// returned from the runtime endpoints.
func (h *Handler) ListCompatibleAIProviders(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimSpace(chi.URLParam(r, "id"))
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}
	runtimeProvider := strings.TrimSpace(chi.URLParam(r, "runtimeProvider"))
	if runtimeProvider == "" {
		writeError(w, http.StatusBadRequest, "runtime provider is required")
		return
	}

	providers, err := h.Queries.ListCompatibleAIProviders(r.Context(), runtimeProvider)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list compatible AI providers")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ai_providers": providers})
}

// ListAIProviderAccounts returns no accounts for runtime-managed providers.
// Their runtime CLI owns credentials and endpoint configuration. Future
// control-plane-managed providers expose metadata only; plaintext secrets are
// never stored in or returned by this endpoint.
func (h *Handler) ListAIProviderAccounts(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimSpace(chi.URLParam(r, "id"))
	member, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found")
	if !ok {
		return
	}
	workspaceUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}
	providerUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "providerId"), "provider id")
	if !ok {
		return
	}

	credentialMode, err := h.Queries.GetAIProviderCredentialMode(r.Context(), providerUUID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "AI provider not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load AI provider")
		return
	}
	if credentialMode == "runtime_managed" {
		writeJSON(w, http.StatusOK, map[string]any{
			"credential_mode":      credentialMode,
			"ai_provider_accounts": []any{},
		})
		return
	}

	accounts, err := h.Queries.ListAIProviderAccounts(r.Context(), db.ListAIProviderAccountsParams{
		WorkspaceID:  workspaceUUID,
		AiProviderID: providerUUID,
		OwnerUserID:  member.UserID,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list AI provider accounts")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"credential_mode":      credentialMode,
		"ai_provider_accounts": accounts,
	})
}

func (h *Handler) ListAIProviderModels(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimSpace(chi.URLParam(r, "id"))
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}
	providerUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "providerId"), "provider id")
	if !ok {
		return
	}
	models, err := h.Queries.ListProviderModels(r.Context(), providerUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list provider models")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider_models": models})
}

func (h *Handler) ListAIProviderModelEfforts(w http.ResponseWriter, r *http.Request) {
	workspaceID := strings.TrimSpace(chi.URLParam(r, "id"))
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}
	modelUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "modelId"), "provider model id")
	if !ok {
		return
	}
	efforts, err := h.Queries.ListProviderModelEfforts(r.Context(), modelUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list provider model efforts")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider_model_efforts": efforts})
}

func (h *Handler) GetAgentAIConfiguration(w http.ResponseWriter, r *http.Request) {
	agentID := strings.TrimSpace(chi.URLParam(r, "id"))
	existing, ok := h.loadAgentForUser(w, r, agentID)
	if !ok {
		return
	}
	row := h.DB.QueryRow(r.Context(), `
		SELECT c.runtime_id, c.ai_provider_id, p.provider_key, c.credential_mode,
		       c.provider_account_id, c.provider_model_id, m.model_key, c.effort_key
		FROM agent_ai_configuration c
		JOIN ai_provider p ON p.id = c.ai_provider_id
		JOIN provider_model m ON m.id = c.provider_model_id
		WHERE c.agent_id = $1
	`, existing.ID)
	var resp agentAIConfigurationResponse
	resp.AgentID = agentID
	var runtimeID, providerID, accountID, modelID pgtype.UUID
	var effortKey pgtype.Text
	if err := row.Scan(&runtimeID, &providerID, &resp.AIProviderKey,
		&resp.CredentialMode, &accountID, &modelID, &resp.Model, &effortKey); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusOK, map[string]any{
				"ai_configuration":          nil,
				"ai_configuration_profiles": []agentAIConfigurationProfileResponse{},
			})
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load agent AI configuration")
		return
	}
	resp.RuntimeID = util.UUIDToString(runtimeID)
	resp.AIProviderID = util.UUIDToString(providerID)
	resp.ProviderModelID = util.UUIDToString(modelID)
	if accountID.Valid {
		value := util.UUIDToString(accountID)
		resp.ProviderAccountID = &value
	}
	if effortKey.Valid {
		resp.EffortKey = &effortKey.String
	}
	profiles, err := listAgentAIConfigurationProfiles(r.Context(), h.DB, existing.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load agent AI configuration profiles")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ai_configuration":          resp,
		"ai_configuration_profiles": profiles,
	})
}

func (h *Handler) UpdateAgentAIConfiguration(w http.ResponseWriter, r *http.Request) {
	agentID := strings.TrimSpace(chi.URLParam(r, "id"))
	existing, ok := h.loadAgentForUser(w, r, agentID)
	if !ok {
		return
	}
	if !h.canManageAgent(w, r, existing) {
		return
	}
	var req updateAgentAIConfigurationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	providerID, ok := parseUUIDOrBadRequest(w, req.AIProviderID, "AI provider id")
	if !ok {
		return
	}
	modelID, ok := parseUUIDOrBadRequest(w, req.ProviderModelID, "provider model id")
	if !ok {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to begin AI configuration update")
		return
	}
	defer tx.Rollback(r.Context())

	var runtimeID, workspaceID pgtype.UUID
	var runtimeProvider string
	if err := tx.QueryRow(r.Context(), `
		SELECT a.runtime_id, a.workspace_id, r.provider
		FROM agent a
		JOIN agent_runtime r ON r.id = a.runtime_id AND r.workspace_id = a.workspace_id
		WHERE a.id = $1
		FOR UPDATE OF a
	`, existing.ID).Scan(&runtimeID, &workspaceID, &runtimeProvider); err != nil {
		writeError(w, http.StatusBadRequest, "agent must be bound to a runtime")
		return
	}

	var providerKey, credentialMode, modelKey string
	var compatible bool
	if err := tx.QueryRow(r.Context(), `
		SELECT p.provider_key, p.credential_mode, m.model_key,
		       EXISTS (
		           SELECT 1 FROM runtime_provider_compatibility c
		           WHERE c.runtime_provider = $3 AND c.ai_provider_id = p.id AND c.enabled
		       )
		FROM ai_provider p
		JOIN provider_model m ON m.ai_provider_id = p.id
		WHERE p.id = $1 AND m.id = $2 AND p.enabled AND m.enabled
	`, providerID, modelID, runtimeProvider).Scan(&providerKey, &credentialMode, &modelKey, &compatible); err != nil {
		writeError(w, http.StatusBadRequest, "selected model does not belong to the selected AI provider")
		return
	}
	if !compatible {
		writeError(w, http.StatusBadRequest, "selected AI provider is not compatible with this runtime")
		return
	}

	var accountID pgtype.UUID
	if credentialMode == "runtime_managed" {
		if req.ProviderAccountID != nil && strings.TrimSpace(*req.ProviderAccountID) != "" {
			writeError(w, http.StatusBadRequest, "runtime-managed providers cannot use a control-plane account")
			return
		}
	} else {
		if req.ProviderAccountID == nil || strings.TrimSpace(*req.ProviderAccountID) == "" {
			writeError(w, http.StatusBadRequest, "provider account is required")
			return
		}
		parsedAccountID, valid := parseUUIDOrBadRequest(w, *req.ProviderAccountID, "provider account id")
		if !valid {
			return
		}
		if err := tx.QueryRow(r.Context(), `
			SELECT id
			FROM ai_provider_account
			WHERE id = $1 AND workspace_id = $2 AND ai_provider_id = $3
		`, parsedAccountID, workspaceID, providerID).Scan(&accountID); err != nil {
			writeError(w, http.StatusBadRequest, "selected account does not belong to the selected AI provider and workspace")
			return
		}
	}

	var effortValue any
	if req.EffortKey != nil && strings.TrimSpace(*req.EffortKey) != "" {
		effort := strings.TrimSpace(*req.EffortKey)
		var exists bool
		if err := tx.QueryRow(r.Context(), `
			SELECT EXISTS (
				SELECT 1 FROM provider_model_effort
				WHERE provider_model_id = $1 AND effort_key = $2 AND enabled
			)
		`, modelID, effort).Scan(&exists); err != nil || !exists {
			writeError(w, http.StatusBadRequest, "selected effort does not belong to the selected provider model")
			return
		}
		effortValue = effort
	}

	if _, err := tx.Exec(r.Context(), `
		INSERT INTO agent_ai_configuration_profile (
			agent_id, workspace_id, ai_provider_id, credential_mode,
			provider_account_id, provider_model_id, effort_key
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (agent_id, ai_provider_id, provider_account_id)
		DO UPDATE SET
			credential_mode = EXCLUDED.credential_mode,
			provider_model_id = EXCLUDED.provider_model_id,
			effort_key = EXCLUDED.effort_key,
			updated_at = now()
	`, existing.ID, workspaceID, providerID, credentialMode, accountID, modelID, effortValue); err != nil {
		writeError(w, http.StatusBadRequest, "AI provider profile must use an account, model, and effort from the same provider")
		return
	}

	if _, err := tx.Exec(r.Context(), `
		INSERT INTO agent_ai_configuration (
			agent_id, workspace_id, runtime_id, ai_provider_id, credential_mode,
			provider_account_id, provider_model_id, effort_key
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (agent_id) DO UPDATE SET
			runtime_id = EXCLUDED.runtime_id,
			ai_provider_id = EXCLUDED.ai_provider_id,
			credential_mode = EXCLUDED.credential_mode,
			provider_account_id = EXCLUDED.provider_account_id,
			provider_model_id = EXCLUDED.provider_model_id,
			effort_key = EXCLUDED.effort_key,
			updated_at = now()
	`, existing.ID, workspaceID, runtimeID, providerID, credentialMode, accountID, modelID, effortValue); err != nil {
		writeError(w, http.StatusBadRequest, "AI provider, account, model, and effort must belong to the same configuration")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit AI configuration")
		return
	}
	profiles, err := listAgentAIConfigurationProfiles(r.Context(), h.DB, existing.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload agent AI configuration profiles")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ai_configuration": agentAIConfigurationResponse{
		AgentID: agentID, RuntimeID: util.UUIDToString(runtimeID), AIProviderID: req.AIProviderID,
		AIProviderKey: providerKey, CredentialMode: credentialMode,
		ProviderAccountID: req.ProviderAccountID, ProviderModelID: req.ProviderModelID,
		Model: modelKey, EffortKey: req.EffortKey,
	}, "ai_configuration_profiles": profiles})
}

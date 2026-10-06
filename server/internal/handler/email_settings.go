package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/multica-ai/multica/server/internal/service"
	"github.com/multica-ai/multica/server/internal/util"
	"github.com/multica-ai/multica/server/internal/util/secretbox"
)

type InstanceEmailSettingsResponse struct {
	Source             string `json:"source"`
	Enabled            bool   `json:"enabled"`
	SMTPHost           string `json:"smtp_host"`
	SMTPPort           int    `json:"smtp_port"`
	SMTPTLS            string `json:"smtp_tls"`
	SMTPUsername       string `json:"smtp_username"`
	SMTPFromEmail      string `json:"smtp_from_email"`
	SMTPEHLOName       string `json:"smtp_ehlo_name"`
	PasswordConfigured bool   `json:"password_configured"`
}

type UpdateInstanceEmailSettingsRequest struct {
	Enabled       bool   `json:"enabled"`
	SMTPHost      string `json:"smtp_host"`
	SMTPPort      int    `json:"smtp_port"`
	SMTPTLS       string `json:"smtp_tls"`
	SMTPUsername  string `json:"smtp_username"`
	SMTPPassword  string `json:"smtp_password"`
	SMTPFromEmail string `json:"smtp_from_email"`
	SMTPEHLOName  string `json:"smtp_ehlo_name"`
}

type TestInstanceEmailSettingsRequest struct {
	Email string `json:"email"`
}

func ParseInstanceAdminEmails(raw string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, value := range strings.Split(raw, ",") {
		if email := strings.ToLower(strings.TrimSpace(value)); email != "" {
			out[email] = struct{}{}
		}
	}
	return out
}

func (h *Handler) requireInstanceAdmin(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return "", false
	}
	userUUID, err := util.ParseUUID(userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not authenticated")
		return "", false
	}
	user, err := h.Queries.GetUser(r.Context(), userUUID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "user not authenticated")
		return "", false
	}
	if _, allowed := h.InstanceAdminEmails[strings.ToLower(strings.TrimSpace(user.Email))]; !allowed {
		writeError(w, http.StatusForbidden, "instance administrator permission required")
		return "", false
	}
	return userID, true
}

func validateInstanceEmailSettings(req UpdateInstanceEmailSettingsRequest) error {
	if strings.TrimSpace(req.SMTPHost) == "" {
		return errors.New("smtp_host is required")
	}
	if req.SMTPPort < 1 || req.SMTPPort > 65535 {
		return errors.New("smtp_port must be between 1 and 65535")
	}
	if req.SMTPTLS != "starttls" && req.SMTPTLS != "implicit" {
		return errors.New("smtp_tls must be starttls or implicit")
	}
	if strings.TrimSpace(req.SMTPFromEmail) == "" {
		return errors.New("smtp_from_email is required")
	}
	return nil
}

func (h *Handler) emailSettingsRow(ctx context.Context) (InstanceEmailSettingsResponse, []byte, error) {
	var response InstanceEmailSettingsResponse
	var ciphertext []byte
	err := h.DB.QueryRow(ctx, `
		SELECT enabled, smtp_host, smtp_port, smtp_tls, smtp_username,
		       smtp_from_email, smtp_ehlo_name, smtp_password_ciphertext
		FROM instance_email_settings WHERE singleton = TRUE
	`).Scan(&response.Enabled, &response.SMTPHost, &response.SMTPPort, &response.SMTPTLS,
		&response.SMTPUsername, &response.SMTPFromEmail, &response.SMTPEHLOName, &ciphertext)
	if err != nil {
		return response, nil, err
	}
	response.Source = "database"
	response.PasswordConfigured = len(ciphertext) > 0
	return response, ciphertext, nil
}

func (h *Handler) GetInstanceEmailSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireInstanceAdmin(w, r); !ok {
		return
	}
	response, _, err := h.emailSettingsRow(r.Context())
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, InstanceEmailSettingsResponse{Source: "environment"})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load email settings")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) UpdateInstanceEmailSettings(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.requireInstanceAdmin(w, r)
	if !ok {
		return
	}
	if h.EmailSettingsBox == nil {
		writeError(w, http.StatusServiceUnavailable, "encrypted email settings storage is not configured")
		return
	}
	var req UpdateInstanceEmailSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateInstanceEmailSettings(req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var ciphertext []byte
	var password string
	if req.SMTPPassword != "" {
		var err error
		ciphertext, err = h.EmailSettingsBox.Seal([]byte(req.SMTPPassword))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to encrypt smtp password")
			return
		}
		password = req.SMTPPassword
	} else {
		_, existingCiphertext, err := h.emailSettingsRow(r.Context())
		if err != nil {
			writeError(w, http.StatusBadRequest, "smtp_password is required for initial setup")
			return
		}
		ciphertext = existingCiphertext
		opened, err := h.EmailSettingsBox.Open(ciphertext)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to decrypt smtp password")
			return
		}
		password = string(opened)
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to begin email settings update")
		return
	}
	defer tx.Rollback(r.Context())
	actorUUID, _ := util.ParseUUID(actorID)
	var existed bool
	_ = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM instance_email_settings WHERE singleton = TRUE)`).Scan(&existed)
	_, err = tx.Exec(r.Context(), `
		INSERT INTO instance_email_settings (
			singleton, transport, smtp_host, smtp_port, smtp_tls, smtp_username,
			smtp_password_ciphertext, smtp_from_email, smtp_ehlo_name, enabled, updated_by
		) VALUES (TRUE, 'smtp', $1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (singleton) DO UPDATE SET
			smtp_host = EXCLUDED.smtp_host, smtp_port = EXCLUDED.smtp_port,
			smtp_tls = EXCLUDED.smtp_tls, smtp_username = EXCLUDED.smtp_username,
			smtp_password_ciphertext = EXCLUDED.smtp_password_ciphertext,
			smtp_from_email = EXCLUDED.smtp_from_email,
			smtp_ehlo_name = EXCLUDED.smtp_ehlo_name, enabled = EXCLUDED.enabled,
			updated_by = EXCLUDED.updated_by, updated_at = now()
	`, strings.TrimSpace(req.SMTPHost), req.SMTPPort, req.SMTPTLS,
		strings.TrimSpace(req.SMTPUsername), ciphertext, strings.TrimSpace(req.SMTPFromEmail),
		strings.TrimSpace(req.SMTPEHLOName), req.Enabled, actorUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save email settings")
		return
	}
	snapshot, _ := json.Marshal(map[string]any{
		"enabled": req.Enabled, "smtp_host": req.SMTPHost, "smtp_port": req.SMTPPort,
		"smtp_tls": req.SMTPTLS, "smtp_username": req.SMTPUsername,
		"smtp_from_email": req.SMTPFromEmail, "smtp_ehlo_name": req.SMTPEHLOName,
		"password_changed": req.SMTPPassword != "",
	})
	action := "update"
	if !existed {
		action = "create"
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO instance_email_settings_audit (actor_user_id, action, settings_snapshot) VALUES ($1, $2, $3)`, actorUUID, action, snapshot); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to audit email settings")
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit email settings")
		return
	}
	h.EmailService.ApplyConfig(service.EmailConfig{
		FromEmail: req.SMTPFromEmail, SMTPHost: req.SMTPHost,
		SMTPPort: strconv.Itoa(req.SMTPPort), SMTPUsername: req.SMTPUsername,
		SMTPPassword: password, SMTPTLSImplicit: req.SMTPTLS == "implicit",
		SMTPEHLOName: req.SMTPEHLOName,
	})
	response, _, _ := h.emailSettingsRow(r.Context())
	writeJSON(w, http.StatusOK, response)
}

func (h *Handler) TestInstanceEmailSettings(w http.ResponseWriter, r *http.Request) {
	actorID, ok := h.requireInstanceAdmin(w, r)
	if !ok {
		return
	}
	var req TestInstanceEmailSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if err := h.EmailService.SendTestEmail(strings.TrimSpace(req.Email)); err != nil {
		writeError(w, http.StatusBadGateway, fmt.Sprintf("smtp test failed: %v", err))
		return
	}
	actorUUID, _ := util.ParseUUID(actorID)
	_, _ = h.DB.Exec(r.Context(), `INSERT INTO instance_email_settings_audit (actor_user_id, action, settings_snapshot) VALUES ($1, 'test', $2)`, actorUUID, []byte(`{"delivery":"accepted"}`))
	writeJSON(w, http.StatusOK, map[string]string{"message": "test email accepted by smtp server"})
}

func (h *Handler) LoadInstanceEmailSettings(ctx context.Context) error {
	if h.EmailSettingsBox == nil || h.DB == nil {
		return nil
	}
	response, ciphertext, err := h.emailSettingsRow(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if !response.Enabled {
		return nil
	}
	password, err := h.EmailSettingsBox.Open(ciphertext)
	if err != nil {
		return err
	}
	h.EmailService.ApplyConfig(service.EmailConfig{
		FromEmail: response.SMTPFromEmail, SMTPHost: response.SMTPHost,
		SMTPPort: strconv.Itoa(response.SMTPPort), SMTPUsername: response.SMTPUsername,
		SMTPPassword: string(password), SMTPTLSImplicit: response.SMTPTLS == "implicit",
		SMTPEHLOName: response.SMTPEHLOName,
	})
	return nil
}

func NewEmailSettingsBoxFromEnv() (*secretbox.Box, error) {
	key, err := secretbox.LoadKey("EMAIL_SETTINGS_MASTER_KEY")
	if err != nil {
		return nil, err
	}
	return secretbox.New(key)
}

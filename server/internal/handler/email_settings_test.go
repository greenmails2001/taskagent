package handler

import "testing"

func TestParseInstanceAdminEmails(t *testing.T) {
	admins := ParseInstanceAdminEmails(" GreenMails2001@gmail.com, admin@example.com, ")
	if _, ok := admins["greenmails2001@gmail.com"]; !ok {
		t.Fatal("expected normalized administrator email")
	}
	if _, ok := admins["admin@example.com"]; !ok {
		t.Fatal("expected second administrator email")
	}
}

func TestValidateInstanceEmailSettings(t *testing.T) {
	valid := UpdateInstanceEmailSettingsRequest{
		SMTPHost: "mail.example.com", SMTPPort: 587, SMTPTLS: "starttls",
		SMTPFromEmail: "mailer@example.com",
	}
	if err := validateInstanceEmailSettings(valid); err != nil {
		t.Fatalf("valid settings rejected: %v", err)
	}

	for name, mutate := range map[string]func(*UpdateInstanceEmailSettingsRequest){
		"host": func(req *UpdateInstanceEmailSettingsRequest) { req.SMTPHost = "" },
		"port": func(req *UpdateInstanceEmailSettingsRequest) { req.SMTPPort = 0 },
		"tls":  func(req *UpdateInstanceEmailSettingsRequest) { req.SMTPTLS = "none" },
		"from": func(req *UpdateInstanceEmailSettingsRequest) { req.SMTPFromEmail = "" },
	} {
		t.Run(name, func(t *testing.T) {
			req := valid
			mutate(&req)
			if err := validateInstanceEmailSettings(req); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

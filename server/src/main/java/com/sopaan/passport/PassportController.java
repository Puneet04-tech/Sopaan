package com.sopaan.passport;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class PassportController {
    private final CredentialService credentials;
    private final RegistryService registry;

    public PassportController(CredentialService credentials, RegistryService registry) {
        this.credentials = credentials;
        this.registry = registry;
    }

    public record IssueRequest(
            @NotBlank String subject_id,
            @NotBlank String skill,
            @Min(1) @Max(5) int level,
            @NotBlank String evidence_label,
            String issuer_kid) {
    }

    public record RevokeRequest(String reason) {
    }

    @PostMapping("/v1/credentials")
    public Map<String, Object> issue(HttpServletRequest request, @Valid @RequestBody IssueRequest body) {
        Auth.require(request, "FACILITATOR", "ADMIN", "HUB");
        String actor = Auth.subject(request) == null ? "facilitator" : Auth.subject(request);
        return credentials.issue(body.subject_id(), body.skill(), body.level(), body.evidence_label(), body.issuer_kid());
    }

    @GetMapping("/v1/credentials/{credId}")
    public JsonNode envelope(@PathVariable String credId) {
        return credentials.envelope(credId);
    }

    @PostMapping("/v1/credentials/{credId}:revoke")
    public Map<String, Object> revoke(HttpServletRequest request, @PathVariable String credId, @RequestBody(required = false) RevokeRequest body) {
        Auth.require(request, "FACILITATOR", "ADMIN");
        String reason = body == null || body.reason() == null ? "revoked by facilitator" : body.reason();
        credentials.revoke(credId, reason, Auth.subject(request));
        return Map.of("cred_id", credId, "status", "REVOKED");
    }

    @GetMapping("/v1/registry/snapshot")
    public Map<String, Object> snapshot() {
        return registry.signedSnapshot();
    }

    @GetMapping("/v1/registry/issuers")
    public Map<String, Object> issuers() {
        return Map.of("epoch", registry.epoch(), "issuers", registry.issuers());
    }
}

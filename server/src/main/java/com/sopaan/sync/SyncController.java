package com.sopaan.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class SyncController {
    private final SyncService sync;

    public SyncController(SyncService sync) {
        this.sync = sync;
    }

    public record EnrollRequest(
            @NotBlank String device_id,
            @NotBlank String student_id,
            @NotBlank String pubkey,
            String role) {
    }

    @PostMapping("/v1/devices:enroll")
    public Map<String, Object> enroll(@Valid @RequestBody EnrollRequest body) {
        return sync.enroll(body.device_id(), body.student_id(), body.pubkey(), body.role());
    }

    @PostMapping("/v1/sync/push")
    public Map<String, Object> push(HttpServletRequest request, @RequestBody JsonNode body) {
        Auth.require(request, "DEVICE", "FACILITATOR", "HUB", "ADMIN");
        return sync.push(Auth.subject(request), body.path("events"));
    }

    @GetMapping("/v1/sync/pull")
    public Map<String, Object> pull(HttpServletRequest request) {
        Auth.require(request, "DEVICE", "FACILITATOR", "HUB", "ADMIN");
        return sync.pull(Auth.subject(request));
    }
}

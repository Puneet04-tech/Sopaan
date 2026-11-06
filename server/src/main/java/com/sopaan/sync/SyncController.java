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
            String student_id,
            @NotBlank String pubkey,
            String role) {
    }

    /**
     * Public so a brand-new phone can enrol before it has any token. When the request also
     * carries a signed-in account's bearer token the device is bound to that account, which
     * is what later lets its events be accepted without trusting a body-supplied student id.
     */
    @PostMapping("/v1/devices:enroll")
    public Map<String, Object> enroll(HttpServletRequest request, @Valid @RequestBody EnrollRequest body) {
        String userId = "STUDENT".equals(Auth.role(request)) ? Auth.subject(request) : null;
        return sync.enroll(body.device_id(), body.student_id(), body.pubkey(), body.role(), userId);
    }

    @PostMapping("/v1/sync/push")
    public Map<String, Object> push(HttpServletRequest request, @RequestBody JsonNode body) {
        Auth.require(request, "STUDENT", "DEVICE", "FACILITATOR", "HUB", "ADMIN");
        return sync.push(Auth.subject(request), Auth.role(request), body.path("events"));
    }

    @GetMapping("/v1/sync/pull")
    public Map<String, Object> pull(HttpServletRequest request) {
        Auth.require(request, "STUDENT", "DEVICE", "FACILITATOR", "HUB", "ADMIN");
        return sync.pull(Auth.subject(request), Auth.role(request));
    }
}

package com.sopaan.cohort;

import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class CohortController {
    private final CohortService cohorts;

    public CohortController(CohortService cohorts) {
        this.cohorts = cohorts;
    }

    public record CreateRequest(@NotBlank String name, String district) {
    }

    public record MemberRequest(@NotBlank String student_id) {
    }

    @PostMapping("/v1/cohorts")
    public Map<String, Object> create(HttpServletRequest request, @Valid @RequestBody CreateRequest body) {
        Auth.require(request, "FACILITATOR", "ADMIN");
        return cohorts.create(Auth.subject(request), body.name(), body.district());
    }

    @PostMapping("/v1/cohorts/{cohortId}/members")
    public Map<String, Object> addMember(HttpServletRequest request, @PathVariable String cohortId, @Valid @RequestBody MemberRequest body) {
        Auth.require(request, "FACILITATOR", "ADMIN");
        return cohorts.addMember(Auth.subject(request), cohortId, body.student_id());
    }

    @GetMapping("/v1/cohorts/{cohortId}/dashboard")
    public Map<String, Object> dashboard(HttpServletRequest request, @PathVariable String cohortId) {
        Auth.require(request, "FACILITATOR", "ADMIN");
        return cohorts.dashboard(Auth.subject(request), cohortId, "ADMIN".equals(Auth.role(request)));
    }
}

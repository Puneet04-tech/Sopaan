package com.sopaan.audit;

import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class AuditController {
    private final AuditService audit;

    public AuditController(AuditService audit) {
        this.audit = audit;
    }

    @GetMapping("/v1/audit")
    public Map<String, Object> recent(HttpServletRequest request, @RequestParam(defaultValue = "50") int limit) {
        Auth.require(request, "ADMIN");
        return Map.of("entries", audit.recent(limit), "count", audit.count());
    }
}

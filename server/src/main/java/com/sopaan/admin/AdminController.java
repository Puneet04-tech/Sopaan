package com.sopaan.admin;

import com.sopaan.audit.AuditService;
import com.sopaan.security.Auth;
import com.sopaan.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Role administration. Only an ADMIN may hand out a role, and every grant is audited. */
@RestController
public class AdminController {
    private static final Set<String> ROLES =
            Set.of("STUDENT", "FACILITATOR", "REVIEWER", "SPONSOR", "ADMIN");

    private final JdbcTemplate jdbc;
    private final AuditService audit;

    public AdminController(JdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    public record GrantRequest(@NotBlank String role) {
    }

    @GetMapping("/v1/admin/users")
    public Map<String, Object> users(HttpServletRequest request) {
        Auth.require(request, "ADMIN");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT user_id, username, display_name, role, enabled, student_id, created_at, last_login_at "
                        + "FROM app_user ORDER BY created_at");
        return Map.of("users", rows);
    }

    @PostMapping("/v1/admin/users/{username}:grant-role")
    public Map<String, Object> grant(HttpServletRequest request, @PathVariable String username,
                                     @Valid @RequestBody GrantRequest body) {
        Auth.require(request, "ADMIN");
        String role = body.role().trim().toUpperCase();
        if (!ROLES.contains(role)) throw new ApiException(400, "unknown_role");

        List<String> ids = jdbc.queryForList(
                "SELECT user_id FROM app_user WHERE LOWER(username) = LOWER(?)", String.class, username);
        if (ids.isEmpty()) throw new ApiException(404, "user_not_found");
        String userId = ids.get(0);

        Integer admins = jdbc.queryForObject(
                "SELECT COUNT(*) FROM app_user WHERE role = 'ADMIN' AND enabled = TRUE", Integer.class);
        String current = jdbc.queryForObject("SELECT role FROM app_user WHERE user_id = ?", String.class, userId);
        if ("ADMIN".equals(current) && !"ADMIN".equals(role) && admins != null && admins <= 1) {
            throw new ApiException(409, "last_admin_cannot_be_demoted");
        }

        jdbc.update("UPDATE app_user SET role = ? WHERE user_id = ?", role, userId);
        audit.append(Auth.subject(request), "admin.grant", username.toLowerCase() + ":" + role);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("username", username);
        result.put("user_id", userId);
        result.put("role", role);
        return result;
    }
}

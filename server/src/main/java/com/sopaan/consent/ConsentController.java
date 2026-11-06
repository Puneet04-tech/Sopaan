package com.sopaan.consent;

import com.sopaan.audit.AuditService;
import com.sopaan.common.ApiException;
import com.sopaan.security.Auth;
import com.sopaan.security.StudentScope;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Consent is cloud-authoritative (design table 3.3): the device may go offline, but a consent
 * grant or withdrawal is written here and never merged blindly from a device. Nothing else in
 * the app will treat a field as shareable until the server has the record.
 */
@RestController
public class ConsentController {
    private final JdbcTemplate jdbc;
    private final StudentScope scope;
    private final AuditService audit;

    public ConsentController(JdbcTemplate jdbc, StudentScope scope, AuditService audit) {
        this.jdbc = jdbc;
        this.scope = scope;
        this.audit = audit;
    }

    public record ConsentRequest(
            @NotBlank String version,
            Boolean granted,
            String guardian_ref) {
    }

    @GetMapping("/v1/consent")
    public Map<String, Object> read(HttpServletRequest request) {
        String studentId = scope.forActor(Auth.subject(request), Auth.role(request));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT version, guardian_ref, granted_at, revoked_at FROM consent WHERE student_id = ? ORDER BY version",
                studentId);
        boolean active = rows.stream().anyMatch(row -> row.get("revoked_at") == null);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("student_id", studentId);
        body.put("active", active);
        body.put("records", rows);
        body.put("precedence", "server");
        return body;
    }

    @PostMapping("/v1/consent")
    public Map<String, Object> write(HttpServletRequest request, @Valid @RequestBody ConsentRequest body) {
        String studentId = scope.forActor(Auth.subject(request), Auth.role(request));
        boolean granted = body.granted() == null || body.granted();
        Timestamp now = Timestamp.from(Instant.now());
        Integer exists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM consent WHERE student_id = ? AND version = ?",
                Integer.class, studentId, body.version());
        if (exists != null && exists > 0) {
            if (granted) {
                jdbc.update("UPDATE consent SET guardian_ref = ?, revoked_at = NULL WHERE student_id = ? AND version = ?",
                        body.guardian_ref(), studentId, body.version());
            } else {
                jdbc.update("UPDATE consent SET revoked_at = ? WHERE student_id = ? AND version = ?",
                        now, studentId, body.version());
            }
        } else {
            if (!granted) throw new ApiException(409, "nothing_to_revoke");
            jdbc.update(
                    "INSERT INTO consent (student_id, version, guardian_ref, granted_at) VALUES (?,?,?,?)",
                    studentId, body.version(), body.guardian_ref(), now);
        }
        audit.append(Auth.subject(request), granted ? "consent.grant" : "consent.revoke", body.version());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("student_id", studentId);
        result.put("version", body.version());
        result.put("revoked", !granted);
        result.put("at", now.toInstant().toString());
        return result;
    }
}

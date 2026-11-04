package com.sopaan.cohort;

import com.sopaan.audit.AuditService;
import com.sopaan.common.ApiException;
import com.sopaan.common.Ids;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Facilitator cohort. The dashboard shows progress and gaps, never raw learner records;
 * identifiers stay pseudonymous.
 */
@Service
public class CohortService {
    private final JdbcTemplate jdbc;
    private final AuditService audit;

    @Value("${sopaan.demo-mode:false}")
    private boolean demoMode;

    public CohortService(JdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public Map<String, Object> create(String facilitatorId, String name, String district) {
        String cohortId = Ids.uuidv7();
        jdbc.update(
                "INSERT INTO cohort (cohort_id, facilitator_id, name, district) VALUES (?,?,?,?)",
                cohortId, facilitatorId, name, district);
        audit.append(facilitatorId, "cohort.create", cohortId);
        return Map.of("cohort_id", cohortId, "name", name, "district", district == null ? "" : district);
    }

    @Transactional
    public Map<String, Object> addMember(String facilitatorId, String cohortId, String studentId) {
        Map<String, Object> cohort = cohort(cohortId);
        if (cohort == null) throw new ApiException(404, "cohort_not_found");
        if (!demoMode && !facilitatorId.equals(cohort.get("facilitator_id"))) throw new ApiException(403, "not_cohort_owner");
        jdbc.update("MERGE INTO cohort_member (cohort_id, student_id) KEY(cohort_id, student_id) VALUES (?,?)", cohortId, studentId);
        audit.append(facilitatorId, "cohort.member", studentId);
        return Map.of("cohort_id", cohortId, "student_id", studentId, "status", "ADDED");
    }

    public Map<String, Object> dashboard(String actor, String cohortId, boolean admin) {
        Map<String, Object> cohort = cohort(cohortId);
        if (cohort == null) throw new ApiException(404, "cohort_not_found");
        if (!admin && !demoMode && !actor.equals(cohort.get("facilitator_id"))) throw new ApiException(403, "not_cohort_owner");

        List<Map<String, Object>> members = jdbc.query(
                """
                SELECT cm.student_id,
                       s.display_alias,
                       s.consent_version,
                       (SELECT COUNT(*) FROM credential c WHERE c.subject_id = cm.student_id AND c.status = 'VALID') AS credentials,
                       (SELECT MAX(d.last_seen) FROM device d WHERE d.student_id = cm.student_id) AS last_seen,
                       (SELECT COUNT(*) FROM profile_field pf WHERE pf.student_id = cm.student_id AND pf.is_conflict = TRUE) AS conflicts
                FROM cohort_member cm
                JOIN student s ON s.student_id = cm.student_id
                WHERE cm.cohort_id = ?
                ORDER BY s.display_alias
                """,
                (rs, row) -> {
                    Map<String, Object> member = new LinkedHashMap<>();
                    member.put("student_id", rs.getString("student_id"));
                    member.put("alias", rs.getString("display_alias") == null ? "Learner" : rs.getString("display_alias"));
                    member.put("consent", rs.getString("consent_version") == null ? "PENDING" : rs.getString("consent_version"));
                    member.put("credentials", rs.getInt("credentials"));
                    member.put("conflicts", rs.getInt("conflicts"));
                    member.put("last_seen", rs.getTimestamp("last_seen") == null ? null : rs.getTimestamp("last_seen").toInstant().toString());
                    return member;
                },
                cohortId);

        long withCredentials = members.stream().filter(m -> ((Number) m.get("credentials")).intValue() > 0).count();
        long consented = members.stream().filter(m -> !"PENDING".equals(m.get("consent"))).count();
        return Map.of(
                "cohort", cohort,
                "members", members,
                "totals", Map.of(
                        "learners", members.size(),
                        "consented", consented,
                        "with_credential", withCredentials,
                        "conflicts", members.stream().mapToInt(m -> ((Number) m.get("conflicts")).intValue()).sum()));
    }

    private Map<String, Object> cohort(String cohortId) {
        List<Map<String, Object>> rows = jdbc.query(
                "SELECT cohort_id, facilitator_id, name, district FROM cohort WHERE cohort_id = ?",
                (rs, row) -> Map.of(
                        "cohort_id", rs.getString(1),
                        "facilitator_id", rs.getString(2),
                        "name", rs.getString(3),
                        "district", rs.getString(4) == null ? "" : rs.getString(4)),
                cohortId);
        return rows.isEmpty() ? null : rows.get(0);
    }
}

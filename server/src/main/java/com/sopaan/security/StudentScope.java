package com.sopaan.security;

import com.sopaan.common.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resolves the learner a caller is allowed to act for.
 *
 * <p>A signed-in account (role STUDENT) is scoped by its own {@code app_user.student_id}.
 * An enrolled device (role DEVICE and friends) is scoped by the student the device was
 * enrolled against. Nothing is ever taken from the request body: that is what keeps two
 * accounts on the same server from reading each other's rows.
 */
@Component
public class StudentScope {
    private final JdbcTemplate jdbc;

    public StudentScope(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String forActor(String subject, String role) {
        if (subject == null || subject.isBlank()) throw new ApiException(401, "authentication_required");
        // Any account role resolves to that account's own student; only a device or hub actor
        // falls through to the device table.
        if (!"DEVICE".equals(role) && !"HUB".equals(role)) {
            List<String> rows = jdbc.queryForList(
                    "SELECT student_id FROM app_user WHERE user_id = ?", String.class, subject);
            if (rows.isEmpty() || rows.get(0) == null || rows.get(0).isBlank()) {
                throw new ApiException(403, "no_student_profile");
            }
            return rows.get(0);
        }
        List<String> rows = jdbc.queryForList(
                "SELECT student_id FROM device WHERE device_id = ?", String.class, subject);
        if (rows.isEmpty()) throw new ApiException(403, "device_not_enrolled");
        return rows.get(0);
    }

    /** The account behind a user id, or null when the id is not an app_user. */
    public String studentForUser(String userId) {
        if (userId == null || userId.isBlank()) return null;
        List<String> rows = jdbc.queryForList(
                "SELECT student_id FROM app_user WHERE user_id = ?", String.class, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }
}

package com.sopaan.auth;

import com.sopaan.common.ApiException;
import com.sopaan.common.Ids;
import com.sopaan.security.JwtService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;

@Service
public class AuthUserService {
    private final JdbcTemplate jdbc;
    private final JwtService jwt;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthUserService(JdbcTemplate jdbc, JwtService jwt) {
        this.jdbc = jdbc;
        this.jwt = jwt;
    }

    @Transactional
    public Map<String, Object> register(String username, String email, String password, String displayName) {
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new ApiException(400, "username_password_required");
        }
        if (password.length() < 6) {
            throw new ApiException(400, "password_too_short");
        }
        String userId = Ids.uuidv7();
        String studentId = Ids.uuidv7();
        String hash = encoder.encode(password);
        
        try {
            jdbc.update("INSERT INTO student (student_id, display_alias, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    studentId, displayName != null ? displayName : username);
            jdbc.update("INSERT INTO app_user (user_id, username, email, password_hash, display_name, role, enabled, student_id, created_at) VALUES (?,?,?,?,?,'STUDENT',TRUE,?,CURRENT_TIMESTAMP)",
                    userId, username.toLowerCase(), email, hash, displayName, studentId);
        } catch (DuplicateKeyException e) {
            throw new ApiException(409, "username_or_email_exists");
        }
        
        String token = jwt.issue(userId, "STUDENT", "");
        return Map.of(
                "token", token,
                "user_id", userId,
                "student_id", studentId,
                "username", username.toLowerCase(),
                "role", "STUDENT",
                "expires_at", Instant.now().plus(jwt.ttlSeconds(), ChronoUnit.SECONDS).toString()
        );
    }

    public Map<String, Object> login(String username, String password) {
        if (username == null || password == null) {
            throw new ApiException(400, "username_password_required");
        }
        var rows = jdbc.query("SELECT user_id, password_hash, role, enabled, student_id FROM app_user WHERE username = ?",
                (rs, rowNum) -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("user_id", rs.getString("user_id"));
                    map.put("password_hash", rs.getString("password_hash"));
                    map.put("role", rs.getString("role"));
                    map.put("enabled", rs.getBoolean("enabled"));
                    map.put("student_id", rs.getString("student_id"));
                    return map;
                }, username.toLowerCase());
        
        if (rows.isEmpty()) {
            throw new ApiException(401, "invalid_credentials");
        }
        var user = rows.get(0);
        if (!Boolean.TRUE.equals(user.get("enabled"))) {
            throw new ApiException(403, "account_disabled");
        }
        String hash = (String) user.get("password_hash");
        if (!encoder.matches(password, hash)) {
            throw new ApiException(401, "invalid_credentials");
        }
        jdbc.update("UPDATE app_user SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = ?", user.get("user_id"));
        String token = jwt.issue((String) user.get("user_id"), (String) user.get("role"), "");
        return Map.of(
                "token", token,
                "user_id", user.get("user_id"),
                "student_id", user.get("student_id"),
                "username", username.toLowerCase(),
                "role", user.get("role"),
                "expires_at", Instant.now().plus(jwt.ttlSeconds(), ChronoUnit.SECONDS).toString()
        );
    }

    public Map<String, Object> me(String userId) {
        var rows = jdbc.query("SELECT user_id, username, email, display_name, role, student_id, created_at FROM app_user WHERE user_id = ?",
                (rs, rowNum) -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("user_id", rs.getString("user_id"));
                    map.put("username", rs.getString("username"));
                    map.put("email", rs.getString("email"));
                    map.put("display_name", rs.getString("display_name"));
                    map.put("role", rs.getString("role"));
                    map.put("student_id", rs.getString("student_id"));
                    if (rs.getTimestamp("created_at") != null) {
                        map.put("created_at", rs.getTimestamp("created_at").toString());
                    }
                    return map;
                }, userId);
        if (rows.isEmpty()) {
            throw new ApiException(404, "user_not_found");
        }
        return rows.get(0);
    }
}

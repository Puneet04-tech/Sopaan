package com.sopaan.security;

import com.sopaan.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Arrays;

public final class Auth {
    private Auth() {
    }

    public static String subject(HttpServletRequest request) {
        Object value = request.getAttribute("auth.sub");
        return value == null ? null : value.toString();
    }

    public static String role(HttpServletRequest request) {
        Object value = request.getAttribute("auth.role");
        return value == null ? null : value.toString();
    }

    public static String kid(HttpServletRequest request) {
        Object value = request.getAttribute("auth.kid");
        return value == null ? null : value.toString();
    }

    public static void require(HttpServletRequest request, String... roles) {
        String role = role(request);
        if (role == null) throw new ApiException(401, "authentication_required");
        boolean allowed = Arrays.stream(roles).anyMatch(candidate -> candidate.equals(role));
        if (!allowed) throw new ApiException(403, "forbidden_role");
    }
}

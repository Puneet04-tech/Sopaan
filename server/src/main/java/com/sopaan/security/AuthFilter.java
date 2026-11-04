package com.sopaan.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

/**
 * JWT filter for the API. Public endpoints are limited to health, enrolment and the
 * signed artifacts anyone may mirror. Role checks stay in the controllers.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class AuthFilter extends OncePerRequestFilter {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final JwtService jwt;

    public AuthFilter(JwtService jwt) {
        this.jwt = jwt;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        String path = request.getRequestURI();
        String header = request.getHeader("authorization");
        if (header != null && header.startsWith("Bearer ")) {
            JwtService.Claims claims = jwt.verify(header.substring(7));
            if (claims != null) {
                request.setAttribute("auth.sub", claims.sub());
                request.setAttribute("auth.role", claims.role());
                request.setAttribute("auth.kid", claims.kid());
            }
        }
        if (isPublic(path, request.getMethod()) || request.getAttribute("auth.role") != null) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(401);
        response.setContentType("application/json");
        response.getWriter().write(MAPPER.writeValueAsString(Map.of("error", "authentication_required", "path", path)));
    }

    private boolean isPublic(String path, String method) {
        return path.equals("/v1/devices:enroll")
                || path.startsWith("/v1/packs/")
                || path.equals("/v1/packs")
                || path.equals("/v1/registry/snapshot")
                || path.equals("/v1/meta")
                || ("GET".equalsIgnoreCase(method) && path.startsWith("/v1/credentials/"))
                || path.startsWith("/actuator/")
                || path.equals("/")
                || path.equals("/error");
    }
}

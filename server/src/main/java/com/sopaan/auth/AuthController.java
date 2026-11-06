package com.sopaan.auth;

import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/auth")
public class AuthController {
    private final AuthUserService auth;

    public AuthController(AuthUserService auth) {
        this.auth = auth;
    }

    public record RegisterRequest(
            @NotBlank String username,
            String email,
            @NotBlank String password,
            String display_name
    ) {}

    public record LoginRequest(
            @NotBlank String username,
            @NotBlank String password
    ) {}

    @PostMapping("/register")
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest req) {
        return auth.register(req.username(), req.email(), req.password(), req.display_name());
    }

    @PostMapping("/login")
    public Map<String, Object> login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req.username(), req.password());
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpServletRequest request) {
        Auth.require(request, "STUDENT", "FACILITATOR", "REVIEWER", "SPONSOR", "ADMIN", "HUB");
        return auth.me(Auth.subject(request));
    }
}

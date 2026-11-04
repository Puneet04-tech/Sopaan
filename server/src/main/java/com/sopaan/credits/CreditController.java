package com.sopaan.credits;

import com.fasterxml.jackson.databind.JsonNode;
import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class CreditController {
    private final CreditService credits;

    public CreditController(CreditService credits) {
        this.credits = credits;
    }

    public record PoolRequest(
            @NotBlank String pool_id,
            @NotBlank String sponsor,
            @Min(1) int total_inr,
            @NotBlank String milestone) {
    }

    @PostMapping("/v1/credits/pools")
    public Map<String, Object> pool(HttpServletRequest request, @Valid @RequestBody PoolRequest body) {
        Auth.require(request, "SPONSOR", "ADMIN");
        return credits.registerPool(body.pool_id(), body.sponsor(), body.total_inr(), body.milestone());
    }

    @PostMapping("/v1/credits/allowances")
    public Map<String, Object> allowance(HttpServletRequest request, @RequestBody JsonNode body) {
        Auth.require(request, "SPONSOR", "DEVICE", "HUB", "ADMIN");
        return credits.registerAllowance(body);
    }

    @PostMapping("/v1/credits/settle")
    public Map<String, Object> settle(HttpServletRequest request, @RequestBody JsonNode body) {
        Auth.require(request, "DEVICE", "FACILITATOR", "SPONSOR", "HUB", "ADMIN");
        String actor = Auth.subject(request) == null ? "device" : Auth.subject(request);
        return credits.settle(actor, body);
    }

    @GetMapping("/v1/credits/pools")
    public Map<String, Object> pools(HttpServletRequest request) {
        Auth.require(request, "SPONSOR", "FACILITATOR", "ADMIN");
        return Map.of("pools", credits.pools(), "summary", credits.summary());
    }
}

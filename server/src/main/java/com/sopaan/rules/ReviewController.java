package com.sopaan.rules;

import com.sopaan.security.Auth;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class ReviewController {
    private final ReviewService reviews;

    public ReviewController(ReviewService reviews) {
        this.reviews = reviews;
    }

    public record ApproveRequest(String reviewer_kid) {
    }

    @PostMapping("/v1/admin/rules/{packId}:approve")
    public Map<String, Object> approve(HttpServletRequest request, @PathVariable String packId, @RequestBody(required = false) ApproveRequest body) {
        Auth.require(request, "REVIEWER", "ADMIN");
        String reviewer = body == null || body.reviewer_kid() == null ? "reviewer-1" : body.reviewer_kid();
        return reviews.approve(packId, reviewer, Auth.subject(request));
    }

    @GetMapping("/v1/admin/rules/{packId}/golden")
    public Map<String, Object> golden(HttpServletRequest request, @PathVariable String packId) {
        Auth.require(request, "REVIEWER", "ADMIN", "FACILITATOR");
        List<Map<String, Object>> cases = reviews.golden(packId);
        boolean pass = cases.stream().allMatch(row -> Boolean.TRUE.equals(row.get("pass")));
        return Map.of("pack_id", packId, "pass", pass, "cases", cases);
    }

    @GetMapping("/v1/admin/rules")
    public Map<String, Object> list(HttpServletRequest request) {
        Auth.require(request, "REVIEWER", "ADMIN");
        return Map.of("packs", reviews.list());
    }
}

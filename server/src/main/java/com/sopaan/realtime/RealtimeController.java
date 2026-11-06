package com.sopaan.realtime;

import com.sopaan.security.Auth;
import com.sopaan.security.StudentScope;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

@RestController
public class RealtimeController {
    private final RealtimeHub hub;
    private final StudentScope scope;

    public RealtimeController(RealtimeHub hub, StudentScope scope) {
        this.hub = hub;
        this.scope = scope;
    }

    /**
     * Server-sent events for the signed-in learner. The stream is keyed by the student id
     * resolved from the bearer token, so the client never names a topic.
     */
    @GetMapping("/v1/realtime/stream")
    public SseEmitter stream(HttpServletRequest request) {
        Auth.require(request, "STUDENT", "DEVICE", "FACILITATOR", "HUB", "ADMIN");
        String studentId = scope.forActor(Auth.subject(request), Auth.role(request));
        return hub.subscribe(studentId);
    }

    @GetMapping("/v1/realtime/status")
    public Map<String, Object> status(HttpServletRequest request) {
        Auth.require(request, "STUDENT", "DEVICE", "FACILITATOR", "HUB", "ADMIN");
        String studentId = scope.forActor(Auth.subject(request), Auth.role(request));
        return Map.of("student_id", studentId, "subscribers", hub.subscribers(studentId));
    }
}

package com.sopaan.realtime;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * One fan-out point for live updates. Every learner-facing publish goes to the
 * authenticated SSE hub first (scoped by the server-resolved student id), then to the
 * internal STOMP topic used by hub-to-cloud tooling.
 */
@Service
public class RealtimeService {
    private final SimpMessagingTemplate messagingTemplate;
    private final RealtimeHub hub;

    public RealtimeService(SimpMessagingTemplate messagingTemplate, RealtimeHub hub) {
        this.messagingTemplate = messagingTemplate;
        this.hub = hub;
    }

    public void broadcastToStudent(String studentId, String eventType, Object payload) {
        Map<String, Object> frame = Map.of(
                "type", eventType,
                "payload", payload,
                "timestamp", System.currentTimeMillis());
        hub.publish(studentId, eventType, frame);
        messagingTemplate.convertAndSend("/topic/student/" + studentId, frame);
    }

    public void broadcastGlobal(String eventType, Object payload) {
        messagingTemplate.convertAndSend("/topic/global", Map.of(
                "type", eventType,
                "payload", payload,
                "timestamp", System.currentTimeMillis()
        ));
    }

    public void sendToUser(String userId, String eventType, Object payload) {
        messagingTemplate.convertAndSendToUser(userId, "/queue/notifications", Map.of(
                "type", eventType,
                "payload", payload,
                "timestamp", System.currentTimeMillis()
        ));
    }
}

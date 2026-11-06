package com.sopaan.realtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Live delivery to signed-in clients.
 *
 * <p>Every subscriber is filed under the student id resolved from their own JWT, so a
 * browser can only ever receive frames for the account it signed in with. The topic is
 * chosen by the server, never by the client.
 */
@Service
public class RealtimeHub {
    private static final Logger log = LoggerFactory.getLogger(RealtimeHub.class);

    private final Map<String, Set<SseEmitter>> byStudent = new ConcurrentHashMap<>();

    public SseEmitter subscribe(String studentId) {
        SseEmitter emitter = new SseEmitter(0L);
        byStudent.computeIfAbsent(studentId, key -> ConcurrentHashMap.newKeySet()).add(emitter);
        Runnable remove = () -> detach(studentId, emitter);
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(error -> remove.run());
        try {
            emitter.send(SseEmitter.event().name("ready").data(Map.of("student_id", studentId)));
        } catch (IOException error) {
            detach(studentId, emitter);
        }
        return emitter;
    }

    public int subscribers(String studentId) {
        Set<SseEmitter> set = byStudent.get(studentId);
        return set == null ? 0 : set.size();
    }

    public void publish(String studentId, String type, Object payload) {
        Set<SseEmitter> set = byStudent.get(studentId);
        if (set == null || set.isEmpty()) return;
        for (SseEmitter emitter : set) {
            try {
                emitter.send(SseEmitter.event().name(type).data(payload));
            } catch (Exception error) {
                detach(studentId, emitter);
            }
        }
    }

    private void detach(String studentId, SseEmitter emitter) {
        Set<SseEmitter> set = byStudent.get(studentId);
        if (set == null) return;
        set.remove(emitter);
        if (set.isEmpty()) byStudent.remove(studentId);
        log.debug("realtime detach student={} remaining={}", studentId, set.size());
    }
}

package com.sopaan.common;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException exception) {
        return ResponseEntity.status(exception.status()).body(body(exception.code()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validation(MethodArgumentNotValidException exception) {
        String field = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + ":" + error.getDefaultMessage())
                .orElse("invalid_request");
        return ResponseEntity.badRequest().body(body(field));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> illegal(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(body(exception.getMessage() == null ? "bad_request" : exception.getMessage()));
    }

    private Map<String, Object> body(String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("error", code);
        body.put("at", Instant.now().toString());
        return body;
    }
}

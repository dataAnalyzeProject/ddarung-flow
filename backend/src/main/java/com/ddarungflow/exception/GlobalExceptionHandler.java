package com.ddarungflow.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.OffsetDateTime;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(QnaException.class)
    public ResponseEntity<Map<String, Object>> handleQnaException(QnaException ex) {
        return ResponseEntity.status(ex.getStatus()).body(Map.of(
                "code", ex.getErrorCode(),
                "message", ex.getMessage(),
                "timestamp", OffsetDateTime.now().toString()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidationException(MethodArgumentNotValidException ex) {
        String defaultMsg = ex.getBindingResult().getAllErrors().isEmpty()
                ? "잘못된 요청입니다."
                : ex.getBindingResult().getAllErrors().get(0).getDefaultMessage();

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
                "code", "INVALID_INPUT_VALUE",
                "message", defaultMsg,
                "timestamp", OffsetDateTime.now().toString()
        ));
    }
}

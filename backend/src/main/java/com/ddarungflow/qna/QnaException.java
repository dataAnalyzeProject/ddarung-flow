package com.ddarungflow.qna;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class QnaException extends RuntimeException {
    private final HttpStatus status;
    private final String errorCode;

    public QnaException(HttpStatus status, String errorCode, String message) {
        super(message);
        this.status = status;
        this.errorCode = errorCode;
    }
}

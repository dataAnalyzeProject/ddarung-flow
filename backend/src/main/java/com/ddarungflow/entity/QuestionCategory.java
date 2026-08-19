package com.ddarungflow.entity;

import lombok.Getter;

@Getter
public enum QuestionCategory {
    SERVICE("서비스 이용", false),
    PREDICTION("예측 결과", false),
    ACCOUNT("계정", true),
    LOCATION("위치 정보", true);

    private final String label;
    private final boolean forcePrivate;

    QuestionCategory(String label, boolean forcePrivate) {
        this.label = label;
        this.forcePrivate = forcePrivate;
    }
}

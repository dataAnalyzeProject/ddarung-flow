package com.ddarungflow.qna;

public enum QnaCategory {
    SERVICE,
    PREDICTION,
    ACCOUNT,
    LOCATION;

    public boolean isForcePrivate() {
        return this == ACCOUNT || this == LOCATION;
    }
}

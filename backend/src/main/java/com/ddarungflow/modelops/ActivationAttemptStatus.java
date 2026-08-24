package com.ddarungflow.modelops;

public enum ActivationAttemptStatus {
    STARTED,
    SUCCEEDED,
    FAILED_COMPENSATED,
    COMPENSATION_FAILED;

    public boolean isTerminal() {
        return this != STARTED;
    }
}

package com.ddarungflow.export;

public enum ExportStatus {
    PENDING,
    GENERATING,
    COMPLETED,
    FAILED,
    EXPIRED;

    public boolean canTransitionTo(ExportStatus next) {
        if (next == null) {
            return false;
        }
        return switch (this) {
            case PENDING -> next == GENERATING;
            case GENERATING -> next == COMPLETED || next == FAILED;
            case COMPLETED -> next == EXPIRED;
            case FAILED, EXPIRED -> false;
        };
    }
}

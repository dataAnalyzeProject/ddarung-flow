package com.ddarungflow.entity;

public enum UserRole {
    USER,
    /** Legacy persisted role. It is interpreted as SUPER_ADMIN during the approved transition. */
    ADMIN,
    ADMIN_READER,
    ADMIN_OPERATOR,
    MODEL_APPROVER,
    SUPER_ADMIN;

    public UserRole effectiveRole() {
        return this == ADMIN ? SUPER_ADMIN : this;
    }
}

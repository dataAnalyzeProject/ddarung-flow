-- PostgreSQL only. Apply once per database until a managed migration runner is introduced.
-- Safe to rerun when all existing users.role values are in the allowed set.
BEGIN;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
    ADD CONSTRAINT users_role_check
    CHECK (role IN (
        'USER',
        'ADMIN',
        'ADMIN_READER',
        'ADMIN_OPERATOR',
        'MODEL_APPROVER',
        'SUPER_ADMIN'
    ));

COMMIT;

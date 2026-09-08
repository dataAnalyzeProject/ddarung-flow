ALTER TABLE admin_roles DROP CONSTRAINT admin_roles_default_console_check;
ALTER TABLE admin_roles ADD CONSTRAINT admin_roles_default_console_check
    CHECK (default_console IN ('OPS', 'DATA', 'MODEL', 'SYSTEM'));

UPDATE admin_roles SET default_console = 'DATA' WHERE code = 'DATA_ANALYST';

ALTER TABLE export_requests ADD COLUMN requested_row_count bigint;
ALTER TABLE export_requests ADD CONSTRAINT export_requests_requested_row_count_check
    CHECK (requested_row_count IS NULL OR requested_row_count >= 0);

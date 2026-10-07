-- Data backfill is intentionally irreversible. Rows may be edited by users
-- after migration, so a down migration must not guess which configurations
-- are still safe to delete.
SELECT 1;

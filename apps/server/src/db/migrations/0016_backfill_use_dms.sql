INSERT INTO role_permissions (role_id, permission, created_at)
SELECT role_id, 'USE_DMS', CAST(strftime('%s','now') AS INTEGER) * 1000
FROM role_permissions
WHERE permission = 'SEND_MESSAGES'
ON CONFLICT(role_id, permission) DO NOTHING;

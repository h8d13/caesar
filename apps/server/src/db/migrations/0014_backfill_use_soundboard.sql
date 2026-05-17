INSERT INTO role_permissions (role_id, permission, created_at)
SELECT role_id, 'USE_SOUNDBOARD', CAST(strftime('%s','now') AS INTEGER) * 1000
FROM role_permissions
WHERE permission = 'JOIN_VOICE_CHANNELS'
ON CONFLICT(role_id, permission) DO NOTHING;

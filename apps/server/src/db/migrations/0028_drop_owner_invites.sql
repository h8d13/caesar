-- 1 = OWNER_ROLE_ID: invites never grant owner (add-invite, registerUser)
DELETE FROM `invites` WHERE `role_id` = 1;

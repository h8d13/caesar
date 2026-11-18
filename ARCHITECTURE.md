# Caesar

- Text Channels vs Voice Channels

Voice channels **never hold text or attachments**. (Do not need a rotate token).

Can have 3 types: standard (public or private), DM(1-to-1, with E2EE) or TEMP(One to many un-authed)

This separation is intentional, I do not see a sane reason a voice channel should have text. Just like
"threads" are redundant to actual text channels replies. Or groups in DMs being the same as using VCs.

So they are all kept separate, on purpose.

- ACLs

Owner role's permissions are read-only for all routes (after initial claim) and it always has all access without modifications.
Any other role can be modified freely (here downgrading is safe.) An "admin" role may never grant
more global permissions than it currently holds itself. 

Each new feature that is worthy of access control gets its own `MANAGE_SOMETHING` or `VERB_SOMETHING` permission.

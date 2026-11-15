# Caesar

- Text Channels vs Voice Channels

Voice channels **never hold text or attachements**. (Do not need a rotate token)
Can have 3 types: standard (or private), DM(1-to-1, with E2EE) or TMP(One to many un-authed)

- ACLs

Owner role is read-only for all routes and always has all access without modifications.
Any role bellow it can be modified freely (here downgrading is safe.)

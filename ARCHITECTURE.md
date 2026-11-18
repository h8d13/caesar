# Caesar

[![Docker Pulls](https://ghcr-badge.elias.eu.org/shield/h8d13/caesar/caesar)](https://github.com/h8d13/caesar/pkgs/container/caesar)
[![Image size](https://ghcr-badge.egpl.dev/h8d13/caesar/size?tag=edge)](https://github.com/h8d13/caesar/pkgs/container/caesar)
[![License](https://img.shields.io/github/license/h8d13/caesar)](LICENSE)

- Text Channels vs Voice Channels

Voice channels **never hold text or attachements**. (Do not need a rotate token)
Can have 3 types: standard (or private), DM(1-to-1, with E2EE) or TMP(One to many un-authed)

- ACLs

Owner role is read-only for all routes and always has all access without modifications.
Any role bellow it can be modified freely (here downgrading is safe.)

# Remote image fixtures

`cataas-cat.png` is a 96×96 PNG response captured from
`https://cataas.com/cat?width=96&height=96` on 2026-07-24.

- SHA-256: `a71610eff4fc54b3a7a45bc3db16d1e02533bbd58bbb6c562937417f5f7d73c2`
- Size: 28,470 bytes
- Detected format: PNG

Automated tests consume the checked-in bytes and never depend on the live
service. A separate implementation verification may exercise the same HTTPS
endpoint through the production acquisition service.

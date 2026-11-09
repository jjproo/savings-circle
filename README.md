# Savings Circle

A private group savings ledger. The accountant records monthly contributions in UGX. Members with site access can view monthly totals and progress toward the UGX 50,000 target per member.

## Build and check

Run the following commands with Node.js 22.13 or newer.

```sh
npm run build
node ledger-check.mjs
```

The build produces a Worker module at `dist/server/index.js`. The hosted app uses a D1 database bound as DB. Its schema is in drizzle/. Configure ACCOUNTANT_ACCESS_CODE and MEMBER_ACCESS_CODE as runtime secrets. Use distinct codes generated from 24 cryptographically random bytes encoded as base64url. Rotating a code ends sessions for that role. The sign-in page is reachable with the site link and the ledger requires a valid session.

[Open the private app](https://savings-circle-mw91dwcb.cometloach18.chatgpt.site)


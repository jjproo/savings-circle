# Savings Circle

A private group savings ledger. The accountant records monthly contributions in UGX. Members with site access can view monthly totals and progress toward the UGX 50,000 target per member.

## Build and check

Run the following commands with Node.js 22.13 or newer.

```sh
npm run build
node ledger-check.mjs
```

The build produces a Worker module at `dist/server/index.js`. The hosted app uses a D1 database bound as `DB`. Apply the migrations in `drizzle/`. Set `ACCOUNTANT_ACCESS_CODE` and `MEMBER_ACCESS_CODE` as distinct runtime secrets, and generate `SESSION_SIGNING_KEY` from at least 32 cryptographically random bytes. Rotating a code ends sessions for that role. The sign-in page is reachable with the site link and the ledger requires a valid session.

[Open the private app](https://savings-circle-mw91dwcb.cometloach18.chatgpt.site)


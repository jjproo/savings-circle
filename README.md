# Savings Circle

A private group savings ledger. The accountant records monthly contributions in UGX. Members with site access can view monthly totals and progress toward the UGX 50,000 target per member.

## Build and check

Run the following commands with Node.js 22.13 or newer.

```sh
npm run build
node ledger-check.mjs
```

The build produces a Worker module at `dist/server/index.js`. The hosted app uses Sites sign-in and a D1 database bound as `DB`. Its schema is in `drizzle/`. Configure `ACCOUNTANT_EMAIL` as a runtime secret on the private site. The repository contains source code and sample figures only.

[Open the private app](https://savings-circle-mw91dwcb.cometloach18.chatgpt.site)

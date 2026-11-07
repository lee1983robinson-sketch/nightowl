# Night Owl

Dating for people who work while the world sleeps. It's in private testing.

No npm packages are needed: Node 22. Start it with `node server.js`.

## Settings (Render → Environment)

| Name | What it's for |
|---|---|
| `SITE_PASSWORD` | Locks the whole site behind a browser password box while it's being built. Remove it to launch. |
| `ADMIN_KEY` | Unlocks `/#/admin`. Make one up, at least 8 characters. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Permanent storage. This can be the same database as StatsPack and ALAW, because Night Owl keeps its data under `owl:`. |

Never put keys in this repo.

## Before a public launch

- A proper privacy policy and terms.
- Registering with the ICO.
- Age assurance in line with Ofcom's guidance.
- Photo checks (verification).
- Moderation cover.
- Paid hosting for photos.

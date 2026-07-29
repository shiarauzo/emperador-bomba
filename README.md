# portal-project

Next.js app with a realtime chat surface powered by [Portal](https://useportal.co).

## Portal resources

| Thing | Value |
| --- | --- |
| Project | `my-app` (`proj_aa1167f69b0d4bd69b501cc44b2ba351`) |
| Production env | `env_877382abd9da45e0a2646a8aaca49886` |
| Development env | `env_a7c3921c8c664afea7ac9b228a17ac4c` |

Keys live in `.env.local` (gitignored):

- `NEXT_PUBLIC_PORTAL_KEY` — publishable `pk_`, safe in the browser bundle.
- `PORTAL_SECRET` — `sk_`, server-side only. Never import it into a client component.

Both were shown once at creation. If lost, mint new ones:

```bash
portal keys create --env env_877382abd9da45e0a2646a8aaca49886 --type public
portal keys create --env env_877382abd9da45e0a2646a8aaca49886 --type secret
```

## Run it

```bash
npm run dev
```

## Deploying beyond localhost

Browsers on unregistered origins are blocked. Before the first non-localhost
deploy, register the domain:

```bash
portal origins add https://your-domain.com --env env_877382abd9da45e0a2646a8aaca49886
```

## How it is wired

- `app/providers.tsx` — creates the `Portal` client once at module scope with the
  publishable key and publishes it via `PortalProvider`. Anonymous mode: no token,
  no `/api/portal-token` endpoint. The SDK mints and keeps a stable anonymous
  identity across refreshes.
- `app/chat-room.tsx` — one `useChannel<ChatMessage>()` call drives messages,
  sending, history backfill, presence roster, typing indicators, and connection
  status.
- `app/page.tsx` / `app/layout.tsx` — mount points.

### Known API limitation

`setMetadata()` (mid-session presence metadata) emits a standalone `meta` frame
that the API currently rejects with `upstream frame 'meta' not accepted`. Initial
metadata on the connect frame works fine, so the display name is chosen **before**
joining and passed as `useChannel({ metadata })`. Revisit if the server starts
accepting `meta`.

## Verifying realtime from the terminal

```bash
# terminal 1
portal listen hello-world --key $NEXT_PUBLIC_PORTAL_KEY

# terminal 2
curl -X POST https://api.useportal.co/v1/channels/hello-world/messages \
  -H "Authorization: Bearer $PORTAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"senderId":"setup-agent","content":{"text":"hello"}}'
```

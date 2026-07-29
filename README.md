# Las locuras del emperador — bomba

Juego de voz por turnos para dos personas, sobre [Portal](https://useportal.co).
Citás frases de la película en tu turno; una frase correcta puntúa y le pasa la bomba
al otro. A quien le explota pierde una vida.

Ver [`docs/frame.md`](./docs/frame.md), [`docs/shaping.md`](./docs/shaping.md) y
[`docs/slices.md`](./docs/slices.md).

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
- `app/page.tsx` / `app/layout.tsx` — mount points.

Note that `PortalProvider` only puts the client on React context. Nothing connects
until something calls `useChannel` — the transport opens on first subscription,
not on mount.

### Known API limitation

`setMetadata()` (mid-session presence metadata) emits a standalone `meta` frame
that the API currently rejects with `upstream frame 'meta' not accepted`. Initial
metadata on the connect frame works fine, so anything that has to travel with a
session — a display name, a chosen movie — must be passed as
`useChannel({ metadata })` at subscribe time. Revisit if the server starts
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

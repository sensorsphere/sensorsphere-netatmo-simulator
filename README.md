# SensorSphere Netatmo Simulator

Standalone offline Netatmo Energy simulator (development prototype). It does **not** contact real Netatmo services or control a physical boiler. The API response shapes are illustrative pending official contract verification.

## UI testing

Open `http://127.0.0.1:8090/` on the Docker host. For a remote workstation use an SSH tunnel: `ssh -L 8090:127.0.0.1:8090 ubuntu@na-01` (or your configured SSH hostname), then open `http://localhost:8090/`. The Compose service binds to loopback and to the host Tailscale IP (`100.64.0.8` by default). Override `WEB_BIND_ADDRESS` if the node IP changes. Access from your tailnet at `http://100.64.0.8:8090/`. Do not expose this unauthenticated development simulator to the public Internet.

The UI can advance simulated time, change thermostat modes, apply manual overrides, inject boiler/relay failures, adjust battery/outdoor temperature, display temperature history and reset the simulation. The virtual clock advances only when requested; there is no real-time scheduler yet. State and history are in memory and reset when the container restarts.

## Run

Node.js 22+: `npm start`. Tests: `npm test`.

Docker: `docker compose up --build -d` (bound to `127.0.0.1:8090` by default).

## Configuration

- `PORT`: HTTP port (default 3000)
- `SIM_CLIENT_ID`: OAuth client ID (default `sim-client`)
- `SIM_CLIENT_SECRET`: OAuth client secret (default `sim-secret`, development only)
- `SIM_ADMIN_TOKEN`: optional admin token; **set it before exposing the simulator to any untrusted network**

OAuth `GET /oauth2/authorize` with `response_type=code`, `client_id`, `redirect_uri`, `scope` and optional `state`; `POST /oauth2/token` supports `authorization_code` and `refresh_token` grants. Access tokens last one hour. The simulator does not present a login/consent UI and must never be used as a real identity provider.

Energy mock endpoints (Bearer access token):

- `GET /api/homesdata` — requires `read_thermostat`
- `GET /api/homestatus?home_id=sim-home-01` — requires `read_thermostat`
- `POST /api/setroomthermpoint` with `home_id`, `room_id`, `mode=manual`, `temp`, `duration` (seconds) — requires `write_thermostat`
- `POST /api/setthermmode` with `home_id`, `mode` (`schedule`, `away`, `hg`) — requires `write_thermostat`

Simulator administration (`X-Sim-Token` header when configured):

- `GET /health`
- `GET /sim/state`, `GET /sim/history`
- `POST /sim/step` with `{"minutes":5}` (1–1440)
- `POST /sim/config` with any of `outside`, `setpoint`, `relayOnline`, `boilerFault`, `mode`, `battery`
- `POST /sim/reset` restores initial state
- `POST /sim/mode` with `{ "mode": "manual", "setpoint": 22, "duration": 3600 }` or schedule/away/hg

## Roadmap

SIM-1 foundation: OAuth mock, initial endpoints, read/write scope separation and automated smoke tests. Remaining: official API contract fixtures, validation of query/form parameter conventions, richer OAuth failure injection.

SIM-2: detailed thermal physics, schedules, asynchronous commands, fault scenarios, history retrieval.

SIM-3: web dashboard and scenario editor.

SIM-4: release pipeline, installation script, GHCR publishing, contract/CI coverage.

**Safety:** Do not expose the development OAuth or admin endpoints publicly. No real heating controls are connected.

## Thermal simulation and schedules (v0.3.0)

- `/sim/schedule` GET/POST: seven daily arrays of ordered `{minute,temp}` periods, beginning at minute 0. Monday is simulated day 1. Default weekday/weekend schedules currently identical.
- `/sim/clock` GET/POST: `{speed:0|1|10|60|1440}`; speed is virtual minutes per real second, 0 pauses. A timer runs only while the process is alive.
- `/sim/config`: `insulation` (0.1–5), `heatingPower` (0.1–5), and `windowOpen` (boolean) alter thermal dynamics. The engine remains illustrative, not calibrated to a physical home.
- UI includes weekly schedule editor, accelerated clock, insulation, heating power and open-window controls.
- All state is in memory and is reset by container restart. The UI requires a page refresh after redeployment.

## Scenarios and API faults (v0.4.0)

- `GET /sim/scenarios`, `POST /sim/scenario` with `{name}`: normal, cold_snap, open_window, boiler_failure, relay_offline, low_battery, api_unavailable, api_rate_limit. Loading a scenario resets the clock, state and history; events remain available.
- `GET /sim/api-fault`, `POST /sim/api-fault` with `{mode}`: none, unavailable (503), rate_limit (429 + Retry-After: 60), unauthorized (401). Only `/api/*` calls are affected, not simulator controls or OAuth.
- `GET /sim/events` lists up to 500 server-side simulation events (configuration, clock, schedule, boiler cycles, API commands). Temperature history remains separate at `/sim/history`.
- The browser includes scenario presets, API fault controls and a server-side event viewer. All data remains in memory.

## SIM-4 packaging (v0.5.0)

- `./scripts/install.sh install|update|status|logs|stop` runs Docker Compose v2 on the local checkout.
- `.github/workflows/ci.yml` verifies Node 22 tests, syntax, Compose and Docker build on pushes/PRs.
- A pushed `v*` Git tag triggers a multi-platform GHCR image publication when a GitHub remote and Actions permissions are configured. The local checkout does not publish automatically.
- See `docs/NETATMO-API-CONTRACT.md` for current coverage and compatibility gaps.

## Multiple independent simulator instances

`SIM_INSTANCE_ID` (default `01`) controls the Netatmo identifiers returned by `/api/homesdata` and `/api/homestatus`: `sim-home-<id>`, `sim-room-<id>`, `sim-thermostat-<id>`, and `sim-relay-<id>`. Only letters, numbers, `_`, `-` (1–32 characters) are accepted. `SIM_CLIENT_ID` and `SIM_CLIENT_SECRET` are also passed through Compose. Each simulator needs a separate Compose project name, web port, and optional OAuth credentials; never reuse identifiers between instances.

For example, after the image is built, start a second instance with `COMPOSE_PROJECT_NAME=netatmo-sim-02 SIM_INSTANCE_ID=02 WEB_PORT=8092 SIM_CLIENT_ID=sim-client-02 SIM_CLIENT_SECRET=<unique-secret> ./scripts/install.sh install`. The Tailscale bind address stays the same, but the port differs. This creates an independent in-memory simulation; restarting an instance resets its OAuth codes/tokens and thermal state. The favicon is available at `/favicon.svg`.

## Configuration and versioning (v0.5.1)

The container listens on TCP port **3000**. Docker Compose publishes host port
`WEB_PORT` (default **8090**) on `127.0.0.1` and `WEB_BIND_ADDRESS`
(default **100.64.0.8**). The image tag defaults to `latest` and can be
overridden with `SIM_VERSION`. `SIM_INSTANCE_ID` (default `01`) determines
the Home/Room/Thermostat/Relay identifiers and the browser tab title.

For existing deployments, rename `TAILSCALE_BIND_ADDRESS` to
`WEB_BIND_ADDRESS` in the instance-specific environment file before updating.
Keep `WEB_PORT=8091` or `WEB_PORT=8092` as appropriate to preserve existing
host URLs. Compose project names must remain distinct. Updating/recreating
a simulator resets its in-memory state and OAuth tokens.

Starting with v0.5.1, increment the package version for every change:
PATCH for compatible fixes/configuration, MINOR for backwards-compatible
features, MAJOR for breaking changes. Update the UI version alongside
`package.json`, test, then commit the change.

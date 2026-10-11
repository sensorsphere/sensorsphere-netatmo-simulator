# SensorSphere Netatmo Simulator

Standalone offline Netatmo Energy simulator (development prototype). It does **not** contact real Netatmo services or control a physical boiler. The API response shapes are illustrative pending official contract verification.

## UI testing

Open `http://127.0.0.1:8091/` on the Docker host. For a remote workstation use an SSH tunnel: `ssh -L 8091:127.0.0.1:8091 ubuntu@na-01` (or your configured SSH hostname), then open `http://localhost:8091/`. The Compose service binds to loopback and to the host Tailscale IP (`100.64.0.8` by default). Override `TAILSCALE_BIND_ADDRESS` if the node IP changes. Access from your tailnet at `http://100.64.0.8:8091/`. Do not expose this unauthenticated development simulator to the public Internet.

The UI can advance simulated time, change thermostat modes, apply manual overrides, inject boiler/relay failures, adjust battery/outdoor temperature, display temperature history and reset the simulation. The virtual clock advances only when requested; there is no real-time scheduler yet. State and history are in memory and reset when the container restarts.

## Run

Node.js 22+: `npm start`. Tests: `npm test`.

Docker: `docker compose up --build -d` (bound to `127.0.0.1:8091` by default).

## Configuration

- `PORT`: HTTP port (default 8091)
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

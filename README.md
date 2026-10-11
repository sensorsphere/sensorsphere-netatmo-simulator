# SensorSphere Netatmo Simulator

Standalone offline Netatmo Energy simulator (development prototype). It does **not** contact real Netatmo services or control a physical boiler. The API response shapes are illustrative pending official contract verification.

## UI testing

Open `http://127.0.0.1:8091/` on the Docker host. For a remote workstation use an SSH tunnel: `ssh -L 8091:127.0.0.1:8091 ubuntu@na-01` (or your configured SSH hostname), then open `http://localhost:8091/`. The Compose service is intentionally bound to loopback and has no real Netatmo connection.

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

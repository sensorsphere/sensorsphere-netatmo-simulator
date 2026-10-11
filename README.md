# SensorSphere Netatmo Simulator (SIM-1 foundation)

Independent offline mock for a classic Netatmo thermostat, relay and boiler. No real Netatmo access.

## Start
`docker compose up --build -d` or `npm start` (Node.js 22+).

## Routes
- `GET /health`, `GET /api/state`, `GET /api/history`
- `GET /api/homesdata`, `GET /api/homestatus` — illustrative response shapes, **not yet contract-certified**.
- `POST /sim/step` with `{"minutes":5}` advances simulated time.
- `POST /sim/config` with `{"setpoint":21,"outside":8,"relayOnline":true,"boilerFault":false,"mode":"schedule"}`.

Set `SIM_ADMIN_TOKEN` and pass `X-Sim-Token` for write endpoints when exposed beyond localhost.

## Roadmap
SIM-1: OAuth simulator, endpoint contracts and tests. SIM-2: thermal model, schedule and command lifecycle. SIM-3: web UI and scenarios. SIM-4: CI, release packaging and contract validation. Current implementation is an initial SIM-1 scaffold, **not** a full Netatmo API emulator.

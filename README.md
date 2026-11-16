# COPPERLINE // Relay Siege

[![make.fun project](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/c/threejs-fps-02)
[![make.fun rank](https://make.fun/badge/threejs-fps-02/Pritahi/threejs-fps/rank.svg)](https://make.fun/c/threejs-fps-02)
[![make.fun reward](https://make.fun/badge/threejs-fps-02/Pritahi/threejs-fps/reward.svg)](https://make.fun/c/threejs-fps-02)

An original browser-based tactical FPS set at a dusk-lit industrial relay station. Serve the relay, outmaneuver the opposing squad, and be the first team to win four rounds.

## Run

Serve this repository over HTTP and open `game/index.html` in a modern browser with WebGL support. The game uses its bundled Three.js module and has no external asset or network requirements.

## Controls

- **W A S D** move relative to your view; **mouse** aim
- **Left mouse** fire; **right mouse** aim down sights
- **R** reload; **Ctrl** crouch; **Shift** sprint
- **E** hold to plant at a relay site or defuse a planted relay
- **G** frag grenade; **H** smoke grenade
- **B** open the market during buy phase; **1 / 2 / 3** buy a sidearm, rifle, or precision rifle
- **Enter** deploy immediately; **Esc** pause or resume

Buy weapons, armor, and grenades during the 15-second buy phase. Attackers can plant at either northern site; defenders can defuse before the relay fuse expires. Elimination and the round timer also resolve a round.

## Changelog

- Corrected buy-phase skip input, consecutive plant/defuse holds, and planted-relay elimination outcomes.
- Preserved loadouts only for survivors, and made smoke obscure line of sight and minimap enemy markers.
- Improved crouch/sprint firing accuracy rules while keeping simulation updates deterministic and fixed-step.
- Bots investigate recent hostile gunfire, use cover-oriented movement and tactical grenades, split site roles, and hold plant/defuse interactions until complete.
- Bot squads split relay-site roles, investigate recent nearby gunfire, pause and crouch to fire, assign one smoke and one frag carrier, and hold objectives while planting or defusing.

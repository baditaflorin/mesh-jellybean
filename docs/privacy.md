## Privacy threat model — mesh-jellybean

## What other peers in the same room can see

**During the `collect` phase:**

- The SHA-256 hash of each peer's committed guess (no plaintext, no salt).
- The fact that a peer has committed (their entry exists in `Y.Map("commits")`).
- The current prompt and unit.
- Yjs awareness `clientID` — a session-only random integer.

**During the `reveal` phase:**

- All revealed plaintext guesses + their salts.
- For each guess, the `peerId` (Yjs `clientID`) that submitted it.

A peer's plaintext guess is **only** on the wire after the reveal-phase transition. Until then, the `commit` hash is computationally infeasible to invert given a 16-byte salt.

## What stays local

- The plaintext guess and its salt, between "Lock in" and "Move to reveal," live only in React state on the local device.
- The `roomId` lives in `localStorage` under `mesh-jellybean:room`.

## What the signaling server sees

`signaling-server` (source at https://github.com/baditaflorin/signaling-server) sees:

- The room name (`mesh-jellybean:<roomId>`).
- Encrypted SDP offer/answer blobs being relayed between peers.
- The IP address of the WebSocket connection.

It does **not** see commitments, reveals, or any application-level traffic.

## What the TURN server sees

`coturn-hetzner` relays encrypted WebRTC bytes when peers can't connect directly. It sees relayed peer IPs; it cannot decrypt the payload.

## Permissions asked

None. No camera, mic, motion, or notification permissions.

## What's NOT in the threat model

- **Anonymity within the reveal.** Once reveal happens, your `peerId` is on the wire next to your numeric guess. Other peers in the room could correlate `peerId` with IP via traffic analysis. The tool does not aim to defeat this — rooms are assumed to be among people who know each other.
- **Refusal to reveal.** A peer can commit and then disappear (or refuse to reveal). The aggregate proceeds without them. There is no penalty mechanism, and `peerId` is session-only so a refuser cannot be persistently flagged.
- **Late joiners during reveal.** A peer joining after reveal can read all plaintext guesses. The tool treats the room as semi-trusted and does not encrypt the reveal step.

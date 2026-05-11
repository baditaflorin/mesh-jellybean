# mesh-jellybean

[![Live](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh--jellybean-B07CD8?style=flat-square)](https://baditaflorin.github.io/mesh-jellybean/)
[![Version](https://img.shields.io/github/package-json/v/baditaflorin/mesh-jellybean?style=flat-square&color=B07CD8)](https://github.com/baditaflorin/mesh-jellybean/blob/main/package.json)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![No backend](https://img.shields.io/badge/backend-none-0c0a14?style=flat-square)](docs/adr/0001-deployment-mode.md)

> Wisdom-of-crowds estimator. Everyone guesses a number privately; reveal shows the full distribution + mean, median, trimmed mean.

**Live:** https://baditaflorin.github.io/mesh-jellybean/

Open the link on every phone. Set a prompt ("how many beans?", "how many users will sign up Q3?"). Each phone enters a private guess. The plaintext never goes on the wire — only a SHA-256 commitment. Once enough phones have locked in, anyone presses **Move to reveal** and the room synchronously reveals all guesses, draws a histogram, and shows mean / median / trimmed mean.

The commit-reveal flow is what makes the aggregate honest — late guessers cannot anchor on early ones to inflate their accuracy, because nobody can see plaintext until everyone has hashed.

## How it works

- Each phone joins a shared **Yjs** room over **y-webrtc** with self-hosted signaling and TURN.
- `Y.Map("round")` holds the current prompt, unit, and phase.
- `Y.Map("commits")` holds `peerId → { commitment: SHA-256(value + ":" + salt) }`.
- `Y.Map("reveals")` holds `peerId → { value, salt }`, only populated after the room moves to reveal.
- Every phone independently recomputes the SHA-256 for each reveal and discards any that don't verify before aggregating.
- The commit-reveal pattern is adapted from [mesh-mafia](https://github.com/baditaflorin/mesh-mafia)'s `crypto.ts`. ([ADR 0002](docs/adr/0002-commit-reveal.md))

## Statistics

On reveal you see all three: mean (biased by outliers), median (robust), trimmed mean (drop top/bottom 10%, then average). Histogram bin count is `clamp(ceil(sqrt(N)), 2, 20)`. ([ADR 0003](docs/adr/0003-stats-shown.md))

## Privacy threat model

See [docs/privacy.md](docs/privacy.md). The short version: during collect, only a SHA-256 hash is on the wire. During reveal, plaintext is visible alongside a session-only `peerId`.

## Architecture

- **Mode A** — pure GitHub Pages, zero backend at runtime.
- **WebRTC** — Yjs + y-webrtc with self-hosted signaling and TURN, overridable from the Settings drawer.

## Run it locally

```bash
git clone https://github.com/baditaflorin/mesh-jellybean.git
cd mesh-jellybean
npm install
npm run dev
```

## Self-hosted infrastructure

| Repo                                                                   | Endpoint                               | Role                      |
| ---------------------------------------------------------------------- | -------------------------------------- | ------------------------- |
| [signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol fan-out |
| [turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC TURN creds           |
| [coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479`           | TURN relay                |

## Settings (in-app)

- **Room ID** — phones must share one to see each other.
- **Signaling URL** / **TURN credentials URL** — override the defaults.

## ADRs

- [0001 — Deployment mode](docs/adr/0001-deployment-mode.md)
- [0002 — Commit-reveal for sealed-bid estimates](docs/adr/0002-commit-reveal.md)
- [0003 — Statistics shown on reveal + histogram bin count](docs/adr/0003-stats-shown.md)
- [0010 — GitHub Pages publishing](docs/adr/0010-pages-publishing.md)

## License

[MIT](LICENSE) © 2026 Florin Badita

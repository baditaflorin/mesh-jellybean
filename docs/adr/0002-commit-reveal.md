---
status: accepted
date: 2026-05-12
---

# 0002 — Commit-reveal for sealed-bid estimates

## Context

The wisdom-of-crowds effect depends on **independent** guesses. If guesses are visible as they come in, late guessers anchor on early ones — they round toward the running average, the spread collapses, and the aggregate becomes meaningless. Galton's ox was weighed by people who couldn't see each other's tickets; we need the same property over Yjs.

Naively, "everyone writes a number to a `Y.Map`" is the bad shape: every other peer sees the value the moment it lands. Even hiding the value in the UI would not be enough — a moderately determined peer can read the Yjs doc directly from devtools.

## Decision

Use a **commit-reveal** flow:

1. **Phase = `collect`.** Each peer generates a random 16-byte salt locally. They compute `commitment = SHA-256(value + ":" + salt)` and publish only the commitment to `Y.Map<peerId, { commitment }>("commits")`. The plaintext `value` and `salt` stay in React state on the peer's own device.
2. **Phase moves to `reveal`** (anyone presses "Move to reveal" once ≥3 peers have committed). Each peer that has committed publishes `{ value, salt }` to `Y.Map<peerId, { value, salt }>("reveals")`.
3. **Verification.** Every phone, on reveal, recomputes `SHA-256(value + ":" + salt)` for each peer's reveal and discards any that do not match the commitment recorded earlier. The aggregate is computed only over verified reveals.

This adapts the same crypto helpers used in `mesh-mafia/src/features/mafia/crypto.ts` (which uses commit-reveal for shuffle entropy). The implementation is in `src/features/jellybean/crypto.ts`.

## Consequences

- **Pros.** A peer cannot wait, look at others' values, and adjust their own — by the time anyone has plaintext, their hash is already published and any change makes verification fail. SHA-256 with a 128-bit salt is far beyond reasonable to invert for a small-domain numeric guess (an attacker who knows the range could otherwise brute-force a hash without a salt).
- **Cons.** A peer can refuse to reveal after committing. This stalls the reveal phase for that peer's slot, but the rest of the room can still see the aggregate of those who did reveal. A peer can also reload the page after committing and lose their salt — same outcome as refusal.
- **No host trust.** The room moves to `reveal` permissively (any peer can trigger it). The 3-peer minimum is a guardrail against accidental clicks in an empty room.

## Alternatives considered

- **Plaintext guesses with UI hiding.** Rejected — Yjs is transparent on the wire, and devtools defeats the hiding trivially.
- **Encrypt to a host's public key, host decrypts on "reveal."** Rejected — adds a trusted host role, and one peer can selectively decrypt and not share results.
- **Threshold encryption (Shamir or distributed-keygen).** Rejected — overkill for a casual estimation tool; brings cryptographic complexity that the design budget cannot afford.

## How a peer would verify locally

Open devtools, read `mesh.commits.get(myPeerId)`, recompute `SHA-256(myValue + ":" + mySalt)`, and confirm the two strings are identical. The verification code path runs this for every peer's reveal automatically.

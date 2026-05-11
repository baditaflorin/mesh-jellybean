// Commit-reveal for sealed-bid numeric guesses. Each peer locks in by
// publishing SHA-256(value + ":" + salt). Once the room moves to "reveal",
// each peer publishes value + salt; every other phone verifies the digest
// matches the committed hash before counting that guess.
//
// Adapted from mesh-mafia/src/features/mafia/crypto.ts.

export function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function commitGuess(value: number, saltHex: string): Promise<string> {
  const enc = new TextEncoder().encode(`${value}:${saltHex}`);
  const digest = await crypto.subtle.digest("SHA-256", enc.buffer as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyCommit(
  value: number,
  saltHex: string,
  commitmentHex: string,
): Promise<boolean> {
  return (await commitGuess(value, saltHex)) === commitmentHex;
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const v of b) s += v.toString(16).padStart(2, "0");
  return s;
}

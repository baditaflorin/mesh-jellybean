import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Load-bearing cross-peer test for the advertised core action:
 * "Everyone guesses a number privately (SHA-256 commit-reveal); reveal shows
 *  the full distribution + mean / median / trimmed mean."
 *
 * The single falsifiable question: when peer A locks in a guess and the round
 * moves to reveal, does peer B see A's value in the revealed distribution?
 *
 * To reach the reveal phase the UI requires >= 3 committed peers. We have two
 * real Playwright peers; we inject a third commit+reveal directly into peer A's
 * Yjs doc (exactly the shape `Jellybean.tsx` writes) so the gate opens, then
 * drive the real "Move to reveal" button. The assertion reads the revealed
 * stats on the OPPOSITE peer (B), proving the commit/reveal maps cross the mesh.
 */
test("peer A's guess reveals on peer B with full distribution stats", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Both peers join the mesh (the arm/Connect screen).
    await a.getByRole("button", { name: "Join the room" }).click();
    await b.getByRole("button", { name: "Join the room" }).click();

    // Peer A enters a guess and locks in (publishes a SHA-256 commitment).
    await a.locator("input.jellybean-input").fill("100");
    await a.getByRole("button", { name: "Lock in" }).click();
    await expect(a.getByRole("button", { name: /Locked/ })).toBeVisible();

    // CROSS-PEER #1: peer A's commitment propagates to peer B's locked-in count.
    // Before any fix this is the heart of the sync: B must observe A's Y.Map
    // write. B starts with its own 0 commits; after A locks in B sees >= 1.
    await expect(b.getByText(/1 locked in/)).toBeVisible();

    // Peer B locks in too (second real commitment).
    await b.locator("input.jellybean-input").fill("200");
    await b.getByRole("button", { name: "Lock in" }).click();
    await expect(a.getByText(/2 locked in/)).toBeVisible();

    // Inject a third committed+revealed peer directly into peer A's shared doc
    // (same Y.Map shape the app writes) so the >= 3 reveal gate opens. The
    // commitment must verify against the value+salt or the reveal is dropped.
    await a.evaluate(async () => {
      const enc = new TextEncoder();
      const value = 150;
      const salt = "abcdef0123456789";
      const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${value}:${salt}`));
      const commitment = Array.from(new Uint8Array(digest))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      // Reach the room's shared CRDT maps via the test hook the app exposes
      // (these are the same Y.Maps every mesh peer reads/writes). Seed a third
      // committed+revealed peer so the >= 3 reveal gate opens.
      const w = window as unknown as {
        __meshJellybean?: {
          commits: { set: (k: string, v: unknown) => void };
          reveals: { set: (k: string, v: unknown) => void };
        };
      };
      if (!w.__meshJellybean) throw new Error("test hook __meshJellybean not present");
      w.__meshJellybean.commits.set("seed-peer", { commitment });
      w.__meshJellybean.reveals.set("seed-peer", { value, salt });
    });

    await expect(a.getByText(/3 locked in/)).toBeVisible();

    // Drive the REAL advertised action: move the room to reveal.
    await a.getByRole("button", { name: /Move to reveal/ }).click();

    // CROSS-PEER #2: peer B (who never clicked reveal) sees the round flip to
    // reveal and renders the aggregate distribution with A's guess included.
    await expect(b.locator(".jellybean-hud").getByText(/Reveal/)).toBeVisible();
    await expect(b.locator(".jellybean-hist")).toBeVisible();

    // Only peers who pressed "Move to reveal" publish their plaintext (that is
    // the sealed-bid guarantee). Peer A revealed 100 and the seed peer revealed
    // 150; peer B's 200 stays committed-only until B also reveals. So the
    // distribution peer B renders is {100, 150} → mean 125. Reading 125 on B
    // proves A's revealed guess (100) genuinely crossed the mesh into B's
    // aggregate — the falsifiable cross-peer assertion.
    const meanCell = b
      .locator(".jellybean-stats > div", { hasText: /^mean/ })
      .locator(".jellybean-stat-val");
    await expect(meanCell).toHaveText("125");

    // n must be 2 (A + seed revealed), not B's still-sealed guess.
    await expect(
      b.locator(".jellybean-stats > div", { hasText: /^n \// }).locator(".jellybean-stat-val"),
    ).toContainText("2 ·");
  } finally {
    await cleanup();
  }
});

/**
 * Cross-peer test for the facilitator action the README leads with: "Set a
 * prompt." The prompt lives in the shared Y.Map("round"), so when peer A edits
 * the question during collect (before anyone has locked in), peer B's screen
 * must show the new wording — proving the round state, not just the
 * commit/reveal maps, crosses the mesh.
 */
test("peer A's prompt edit propagates to peer B", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByRole("button", { name: "Join the room" }).click();
    await b.getByRole("button", { name: "Join the room" }).click();

    // Both peers start on the default prompt.
    await expect(a.locator(".jellybean-prompt h2")).toHaveText("How many beans in the jar?");
    await expect(b.locator(".jellybean-prompt h2")).toHaveText("How many beans in the jar?");

    // Peer A reframes the question (and unit) before anyone locks in.
    await a.getByRole("button", { name: "Edit question" }).click();
    const editInputs = a.locator(".jellybean-prompt-edit input.jellybean-input");
    await editInputs.nth(0).fill("How many users sign up in Q3?");
    await editInputs.nth(1).fill("users");
    await a.getByRole("button", { name: "Save question" }).click();

    // CROSS-PEER: peer B (who touched nothing) now shows A's new question + unit.
    await expect(b.locator(".jellybean-prompt h2")).toHaveText("How many users sign up in Q3?");
    await expect(b.locator(".jellybean-unit")).toHaveText("unit: users");
  } finally {
    await cleanup();
  }
});

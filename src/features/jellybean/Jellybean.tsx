import { useEffect, useMemo, useState } from "react";
import { createRoomSync } from "../sync/yjsRoom";
import { maybeFetchTurnCredentials } from "../sync/iceConfig";
import { commitGuess, randomSaltHex, verifyCommit } from "./crypto";
import { computeStats, histogramBins, suggestBinCount } from "./stats";

type Phase = "collect" | "reveal" | "done";
type RoundState = { prompt: string; unit: string; phase: Phase };
type Commit = { commitment: string };
type Reveal = { value: number; salt: string };

type Props = { roomId: string };

const DEFAULT_ROUND: RoundState = {
  prompt: "How many beans in the jar?",
  unit: "beans",
  phase: "collect",
};

export function Jellybean({ roomId }: Props) {
  const [armed, setArmed] = useState(false);
  const [tick, setTick] = useState(0);
  const [myGuess, setMyGuess] = useState<string>("");
  const [mySalt, setMySalt] = useState<string | null>(null);
  const [verifiedReveals, setVerifiedReveals] = useState<number[]>([]);
  const [editPrompt, setEditPrompt] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editingPrompt, setEditingPrompt] = useState(false);

  const mesh = useMemo(() => {
    if (!armed) return null;
    const room = createRoomSync(roomId);
    const round = room.doc.getMap<RoundState>("round");
    const commits = room.doc.getMap<Commit>("commits");
    const reveals = room.doc.getMap<Reveal>("reveals");
    return { room, round, commits, reveals };
  }, [armed, roomId]);

  useEffect(() => {
    if (!armed) return undefined;
    void maybeFetchTurnCredentials();
    return undefined;
  }, [armed]);

  useEffect(() => {
    return () => {
      mesh?.room.provider?.destroy();
    };
  }, [mesh]);

  useEffect(() => {
    if (!mesh) return undefined;
    // initialize round on first arrival if missing
    if (!mesh.round.get("current")) {
      mesh.round.set("current", DEFAULT_ROUND);
    }
    // Test hook: expose the room's shared CRDT maps so e2e can seed extra peers
    // (the reveal phase gates on >= 3 commits). These maps are already fully
    // readable/writable by every peer over the mesh, so this leaks nothing the
    // protocol doesn't already share — it just gives the test a stable handle.
    (window as unknown as { __meshJellybean?: typeof mesh }).__meshJellybean = mesh;
    const onChange = () => setTick((t) => t + 1);
    mesh.round.observe(onChange);
    mesh.commits.observe(onChange);
    mesh.reveals.observe(onChange);
    return () => {
      mesh.round.unobserve(onChange);
      mesh.commits.unobserve(onChange);
      mesh.reveals.unobserve(onChange);
    };
  }, [mesh]);

  // Verify reveals as they arrive (async).
  useEffect(() => {
    if (!mesh) return;
    let cancelled = false;
    (async () => {
      const verified: number[] = [];
      const entries: Array<[string, Reveal]> = [];
      mesh.reveals.forEach((r, k) => entries.push([k, r]));
      for (const [peerId, r] of entries) {
        const c = mesh.commits.get(peerId);
        if (!c) continue;
        if (await verifyCommit(r.value, r.salt, c.commitment)) {
          verified.push(r.value);
        }
      }
      if (!cancelled) setVerifiedReveals(verified);
    })();
    return () => {
      cancelled = true;
    };
  }, [mesh, tick]);

  void tick;

  if (!armed || !mesh) {
    return (
      <div className="jellybean-arm">
        <h1>mesh-jellybean</h1>
        <p>
          Wisdom-of-crowds estimator. Set a prompt, everyone guesses a number privately, then reveal
          the full distribution. Sealed-bid via SHA-256 commit-reveal — nobody can wait for others
          and anchor.
        </p>
        <button type="button" className="jellybean-arm-button" onClick={() => setArmed(true)}>
          Join the room
        </button>
        <p className="jellybean-hint">
          Room <code>{roomId}</code>
        </p>
      </div>
    );
  }

  const round = mesh.round.get("current") ?? DEFAULT_ROUND;
  const myKey = mesh.room.peerId;
  const myCommit = mesh.commits.get(myKey);
  const myReveal = mesh.reveals.get(myKey);
  const lockedCount = mesh.commits.size;
  const revealedCount = mesh.reveals.size;

  const lockIn = async () => {
    const n = Number(myGuess);
    if (!Number.isFinite(n)) return;
    const salt = randomSaltHex();
    const commitment = await commitGuess(n, salt);
    setMySalt(salt);
    mesh.commits.set(myKey, { commitment });
  };

  const moveToReveal = () => {
    if (mySalt && myGuess !== "") {
      const n = Number(myGuess);
      if (Number.isFinite(n)) {
        mesh.reveals.set(myKey, { value: n, salt: mySalt });
      }
    }
    mesh.round.set("current", { ...round, phase: "reveal" });
  };

  // Edit the room-wide prompt/unit during collect (before anyone locks in, so
  // a facilitator can frame the question without forcing a throwaway round).
  // The prompt lives in the shared Y.Map("round"), so the new wording shows up
  // on every phone — same channel "New round" already uses.
  const savePrompt = () => {
    const nextPrompt = editPrompt.trim() || round.prompt;
    const nextUnit = editUnit.trim() || round.unit;
    mesh.round.set("current", { ...round, prompt: nextPrompt, unit: nextUnit });
    setEditPrompt("");
    setEditUnit("");
    setEditingPrompt(false);
  };

  const newRound = () => {
    mesh.room.doc.transact(() => {
      mesh.commits.clear();
      mesh.reveals.clear();
      mesh.round.set("current", {
        prompt: editPrompt || round.prompt,
        unit: editUnit || round.unit,
        phase: "collect",
      });
    });
    setMyGuess("");
    setMySalt(null);
    setEditPrompt("");
    setEditUnit("");
    setVerifiedReveals([]);
  };

  // collect phase
  if (round.phase === "collect") {
    return (
      <div className="jellybean-stage">
        <div className="jellybean-hud">
          <span>Collecting</span>
          <span>·</span>
          <span>{lockedCount} locked in</span>
        </div>

        <div className="jellybean-prompt">
          <h2>{round.prompt}</h2>
          <p className="jellybean-unit">unit: {round.unit}</p>
          {lockedCount === 0 &&
            !myCommit &&
            (editingPrompt ? (
              <div className="jellybean-newround jellybean-prompt-edit">
                <input
                  className="jellybean-input"
                  placeholder="Question (e.g. how many beans?)"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  autoFocus
                />
                <input
                  className="jellybean-input"
                  placeholder={`Unit (e.g. ${round.unit})`}
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                />
                <button type="button" className="jellybean-btn-primary" onClick={savePrompt}>
                  Save question
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="jellybean-link-btn"
                onClick={() => {
                  setEditPrompt(round.prompt);
                  setEditUnit(round.unit);
                  setEditingPrompt(true);
                }}
              >
                Edit question
              </button>
            ))}
        </div>

        <div className="jellybean-input-row">
          <input
            type="number"
            inputMode="decimal"
            className="jellybean-input"
            placeholder="Your guess"
            value={myGuess}
            onChange={(e) => setMyGuess(e.target.value)}
            disabled={!!myCommit}
          />
          <button
            type="button"
            className="jellybean-btn-primary"
            onClick={lockIn}
            disabled={!!myCommit || myGuess === "" || !Number.isFinite(Number(myGuess))}
          >
            {myCommit ? "Locked ✓" : "Lock in"}
          </button>
        </div>

        <button
          type="button"
          className="jellybean-btn-secondary"
          onClick={moveToReveal}
          disabled={lockedCount < 3}
          title={lockedCount < 3 ? "At least 3 peers must lock in first" : "Reveal all guesses"}
        >
          Move to reveal {lockedCount < 3 ? `(${lockedCount}/3)` : ""}
        </button>

        <p className="jellybean-foot">
          Guesses are hashed (SHA-256) before being published. The plaintext only goes on the wire
          once everyone moves to reveal — no late guesser can anchor on early ones.
        </p>
      </div>
    );
  }

  // reveal phase
  const stats = computeStats(verifiedReveals);
  const binCount = suggestBinCount(verifiedReveals.length);
  const bins = histogramBins(verifiedReveals, binCount);

  return (
    <div className="jellybean-stage">
      <div className="jellybean-hud">
        <span>Reveal</span>
        <span>·</span>
        <span>
          {revealedCount} revealed / {lockedCount} committed
        </span>
      </div>

      <div className="jellybean-prompt">
        <h2>{round.prompt}</h2>
        <p className="jellybean-unit">unit: {round.unit}</p>
      </div>

      {myReveal && (
        <p className="jellybean-self">
          Your guess: <strong>{myReveal.value}</strong>
        </p>
      )}

      {stats ? (
        <>
          <Histogram bins={bins} mean={stats.mean} median={stats.median} />
          <div className="jellybean-stats">
            <div>
              <span className="jellybean-stat-label">mean</span>
              <span className="jellybean-stat-val">{format(stats.mean)}</span>
            </div>
            <div>
              <span className="jellybean-stat-label">median</span>
              <span className="jellybean-stat-val">{format(stats.median)}</span>
            </div>
            <div>
              <span className="jellybean-stat-label">trimmed mean</span>
              <span className="jellybean-stat-val">{format(stats.trimmedMean)}</span>
            </div>
            <div>
              <span className="jellybean-stat-label">n / range</span>
              <span className="jellybean-stat-val">
                {stats.count} · {format(stats.min)}–{format(stats.max)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <p className="jellybean-waiting">Waiting for reveals…</p>
      )}

      <div className="jellybean-newround">
        <input
          className="jellybean-input"
          placeholder={`New prompt (was "${round.prompt}")`}
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
        />
        <input
          className="jellybean-input"
          placeholder={`Unit (was "${round.unit}")`}
          value={editUnit}
          onChange={(e) => setEditUnit(e.target.value)}
        />
        <button type="button" className="jellybean-btn-primary" onClick={newRound}>
          New round
        </button>
      </div>
    </div>
  );
}

function format(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1000) return n.toFixed(0);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function Histogram({
  bins,
  mean,
  median,
}: {
  bins: { lo: number; hi: number; count: number }[];
  mean: number;
  median: number;
}) {
  const w = 320;
  const h = 140;
  const pad = 6;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  if (bins.length === 0) return null;
  const lo = bins[0]?.lo ?? 0;
  const hi = bins[bins.length - 1]?.hi ?? 1;
  const maxC = Math.max(1, ...bins.map((b) => b.count));
  const xOf = (v: number) => pad + ((v - lo) / (hi - lo)) * innerW;
  const xMean = xOf(mean);
  const xMedian = xOf(median);
  return (
    <svg
      className="jellybean-hist"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-label="histogram of guesses"
    >
      {bins.map((b, i) => {
        const bx = xOf(b.lo);
        const bw = Math.max(2, xOf(b.hi) - bx - 1);
        const bh = (b.count / maxC) * innerH;
        return (
          <rect
            key={i}
            x={bx}
            y={h - pad - bh}
            width={bw}
            height={bh}
            className="jellybean-hist-bar"
          />
        );
      })}
      <line
        x1={xMean}
        x2={xMean}
        y1={pad}
        y2={h - pad}
        className="jellybean-hist-mean"
        strokeDasharray="3 3"
      />
      <line x1={xMedian} x2={xMedian} y1={pad} y2={h - pad} className="jellybean-hist-median" />
    </svg>
  );
}

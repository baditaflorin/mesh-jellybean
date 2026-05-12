---
status: accepted
date: 2026-05-12
---

# 0003 — Which statistics to show on reveal, and how many histogram bins

## Context

After reveal, the screen has room for two or three summary numbers and a histogram. The team-management use case ("how many users will sign up?", "how many bugs are left?") routinely sees one or two wild outliers, so the choice of summary matters a lot.

## Decision

Show all three: **mean**, **median**, **trimmed mean** (10% trim from each end). And a **histogram** with `bins = clamp(ceil(sqrt(N)), 2, 20)`.

Visual encoding:

- Histogram bars in `--accent` (purple).
- Mean as a dotted red vertical line over the histogram.
- Median as a solid blue vertical line.
- Trimmed mean appears as a stat tile but not as a third line on the histogram (would crowd the visual).

## Consequences

- **Pros.** Users see immediately when mean ≫ median (skewed by one big guess) and can reach for trimmed-mean as the robust answer. Teaching this is part of the value of the tool.
- **Pros.** `sqrt(N)`-bin choice is a standard heuristic and degrades gracefully: at N=3 you get 2 bins, at N=25 you get 5 bins, at N=400 you get the cap of 20.
- **Cons.** When all guesses are identical the histogram collapses to a single bar over an arbitrary width; the code handles this with a degenerate case (`lo === hi → one bin of width 1`).
- **Cons.** Trimming below N=5 is a no-op (trim count rounds to zero); trimmed mean is then identical to plain mean. Accepted — the label is honest and users learn the difference at the boundary.

## Alternatives considered

- **Mean only.** Rejected — the failure mode (one outlier dominates) is exactly the case where the tool would be most embarrassing.
- **Median only.** Rejected — hides skew that's sometimes the interesting signal.
- **Boxplot.** Considered, rejected on phone-screen real estate; a vertical boxplot is fiddly to render small, and the histogram + two stat lines convey roughly the same info more directly.
- **Freedman–Diaconis bin width** instead of √N. Rejected — needs IQR calculation, complexity not warranted given the cap of 20.

## Threshold to move from collect to reveal

The "Move to reveal" button enables at **≥3 commitments**. Two-peer rooms can stall the round with a single non-revealing partner, and one-peer rooms have no aggregate to show. Three is the minimum where the tool's spirit (a _crowd_) is even slightly honoured.

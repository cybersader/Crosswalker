---
title: Research deliverables
description: "Fresh-agent research deliverables that fed into Crosswalker's Foundation decisions. Each is preserved verbatim as background context for the corresponding decision log and any follow-on research challenge."
tags: [research, deliverable, archive]
sidebar:
  label: "Research deliverables"
  order: 100
---

## What's here

Long-form research deliverables produced by fresh-agent research sessions ("deep research" Claude sessions) and cited in the [decision logs](/crosswalker/agent-context/zz-log/). Each deliverable is preserved **verbatim** so the original recommendation, citations, and tradeoff analysis stay intact for future reference.

These are **not** Crosswalker decisions. They are *inputs* to decisions — the same way [research challenges](/crosswalker/agent-context/zz-challenges/) are *briefs for* research, these pages are the *outputs of* that research.

## How to use these

- **Citing a deliverable from a log**: link to the deliverable URL; the content is stable
- **Spinning up a follow-on research session**: hand the brief URL plus the deliverable URL to a fresh agent; it has the predecessor context without needing the full chat history
- **Re-running a challenge with different assumptions**: the original deliverable + the corresponding challenge brief lets a fresh agent re-attack the question with a clear delta

## The deliverables

| Deliverable | Date | Recommendation | Decision log it fed | Follow-on |
|---|---|---|---|---|
| [Ch 06 — Pairwise vs synthetic spine](/crosswalker/agent-context/zz-research/2026-05-01-challenge-06-pairwise-spine/) | 2026-05-01 | Hybrid: pairwise-first + optional inheritable pivot (SCF default) | [05-01 §2.1](/crosswalker/agent-context/zz-log/2026-05-01-foundation-commitments-and-followon-research/#21-pairwise--optional-inheritable-pivot-challenge-06-resolution) | None — direction committed |
| [Ch 08 — Git history audit-trail tenability](/crosswalker/agent-context/zz-research/2026-05-02-challenge-08-git-audit-trail/) | 2026-05-02 | Augment, not replace: TSA + WORM + cert-export at Tier 1 | [05-02 §2.1](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#21-challenge-08--git-history-as-a-compliance-audit-trail-verdict-augment-not-replace) | [Ch 13 — modern attestation primitives](/crosswalker/agent-context/zz-challenges/13-modern-attestation-primitives/) |
| [Ch 09 — UUID/CWUUID identifier strategy](/crosswalker/agent-context/zz-research/2026-05-02-challenge-09-uuid-cwuuid/) | 2026-05-02 | UUIDv7 + sha256 CIDs + CURIEs (ORCID for SSSOM authors); CWUUID is display-only | [05-02 §2.2](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#22-challenge-09--uuid--cwuuid-cross-cutting-identifier-strategy) | None — substantively complete |
| [Ch 10 — Graph→tabular bridging engine](/crosswalker/agent-context/zz-research/2026-05-02-challenge-10-graph-tabular/) | 2026-05-02 | Hybrid 3-tier: materialized folders + DuckDB-WASM + Apache AGE | [05-02 §2.3](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#23-challenge-10--graphtabular-bridging-engine-for-the-web-of-webs) | [Ch 11 — engine deep survey](/crosswalker/agent-context/zz-challenges/11-tier-2-3-engine-deep-survey/), [Ch 12 — Datalog vs SQL](/crosswalker/agent-context/zz-challenges/12-datalog-vs-sql-sssom-chain-rules/) |

## Convention notes

- **Filename**: `YYYY-MM-DD-challenge-NN-<slug>.md`. Date is the day the deliverable landed; challenge number matches the brief
- **Format**: plain markdown (`.md` not `.mdx`) — these are dense long-form documents and we don't want to deal with MDX parsing edge cases for tables, code blocks, em-dashes, or special characters in tables
- **Preservation**: deliverables are not edited after publication except for typo/formatting fixes that don't change content. Any commentary or critical assessment lives in the corresponding [decision log](/crosswalker/agent-context/zz-log/)
- **Pre-publication drafts** still live in the gitignored `.workspace/` per the convention in `CLAUDE.md`; deliverables are moved here only after they're accepted as input to a decision

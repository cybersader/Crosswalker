---
title: "Ch 08 deliverable: Is git history a tenable compliance audit trail?"
description: "Fresh-agent research deliverable for Challenge 08. Recommends augmenting bare git with three Tier 1 hardening layers: RFC 3161 trusted timestamps, S3 Object Lock WORM mirror, FRE 902(13) qualified-person certification export. Reaffirm git substrate; do not replace."
tags: [research, deliverable, audit, evidence-mapping-links, compliance, attestation]
date: 2026-05-02
sidebar:
  label: "Ch 08: Git audit-trail"
  order: -20260502.1
---

:::tip[Origin and lifecycle]
This is a fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 08: Git history audit-trail tenability](/crosswalker/agent-context/zz-challenges/08-git-history-audit-trail-tenability/). It was summarized in [05-02 §2.1](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#21-challenge-08--git-history-as-a-compliance-audit-trail-verdict-augment-not-replace) and the Tier 1 audit-trail commitment is **deferred** pending the [Challenge 13](/crosswalker/agent-context/zz-challenges/13-modern-attestation-primitives/) follow-on (modern attestation primitives — Sigstore, in-toto, SLSA, OpenTimestamps, VCs). Preserved verbatim; not edited after publication.
:::

# Crosswalker Challenge 08: Is Git History a Tenable Compliance Audit Trail?

## Executive Summary

**Short answer: Git history alone is *not* a tenable system-of-record for evidence-link state changes in a GRC tool, even with signed commits and branch protection. It is, however, a defensible *substrate* for audit-trail data if augmented with three small but non-negotiable controls: (1) RFC 3161 trusted timestamps on commits affecting evidence state, (2) periodic external WORM snapshots (e.g., S3 Object Lock in Compliance mode), and (3) an explicit "qualified person" certification process that lets the trail be authenticated under FRE 902(13)/(14).**

The committed caution from the project owner is well-founded. Bare git satisfies the *integrity* leg of audit-evidence requirements (Merkle-DAG, SHA-1/SHA-256 content addressing) but fails the *trusted-time*, *non-repudiation*, and *susceptibility-to-management-bias* legs that frameworks like SAS 142, PCAOB AS 1105, ISO 27001 A.8.15, and SOX §802 require. The fixes are cheap; the omission is fatal. The recommendation below is to **augment, not replace** — but augmentation should ship in Tier 1, not be deferred to Tier 3.

---

## 1. Standards Mapping — Where Signed-Commit + Branch-Protection Git Falls Short

### 1.1 AICPA SAS 142 (Audit Evidence) — The Four Attributes

SAS 142 (effective for periods ending on or after Dec. 15, 2022) supersedes AU-C 500 and requires the auditor to evaluate information used as audit evidence against four reliability attributes: **accuracy, completeness, authenticity, and susceptibility to management bias**. Per the AICPA fact sheet and the standard text, the auditor is "not an authenticator of information," but must perform additional procedures whenever conditions suggest a document may not be authentic.

| Attribute | Bare git + signed commits + branch protection | Verdict |
|---|---|---|
| **Accuracy** | Content-addressed Merkle DAG; any byte change invalidates hash chain. Strong. | ✅ Satisfies |
| **Completeness** | Git is append-only on protected branches, but local clones can be incomplete; reflog GCs after 90 days by default; no enforcement that *all* state changes touch the protected branch. | ⚠️ Partial |
| **Authenticity** | Signed commits bind authorship via GPG/SSH/S/MIME, but `git commit --date=` and the `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` env vars accept arbitrary values — i.e., the *time* component of the record is self-asserted by the author. | ❌ Fails on time |
| **Susceptibility to management bias** | This is the killer. Per SAS 142 ¶A22, "reliability of audit evidence increases when it is obtained from external parties because the information is less susceptible to management bias." A repository written, signed, *and* timestamped by the entity itself is maximally management-biased. | ❌ Fails |

**Minimum delta to close the gap:** A third-party RFC 3161 timestamp authority (TSA) on every commit that mutates evidence state introduces an external party — a notary that signs `(commit_hash, current_time)` with its own key. This is precisely the SAS 142 ¶A22 "obtained from external parties" pattern. Combined with periodic export to immutable storage held by a different party, the management-bias attribute moves from "high" to "moderate."

### 1.2 PCAOB AS 1105 / AICPA AU-C 500 — Information Produced by the Entity (IPE)

PCAOB AS 1105.10 requires that "when using information produced by the company as audit evidence, the auditor should evaluate whether the information is sufficient and appropriate by performing procedures to: test the accuracy and completeness of the information, *or* test the controls over the accuracy and completeness of that information; and evaluate whether the information is sufficiently precise and detailed."

Crosswalker's git-as-system-of-record is the textbook definition of IPE. To be IPE-grade, the git workflow needs:

1. **A documented, repeatable system that "produces an accurate result"** (FRE 902(13) language, which mirrors IPE thinking) — this means tooling, not human discipline, must enforce the linkage between an evidence-link state change and a commit.
2. **Controls over completeness** — a guarantee that no state change can occur *outside* the recorded chain. Bare git cannot enforce this; nothing prevents a user from editing an underlying YAML/Markdown file, never committing, and producing a divergent local state.
3. **Controls over accuracy of the timestamp** — see §1.1 above.
4. **Sufficient precision and detail** — commit messages and diffs technically capture this, but auditors typically want a structured, queryable IPE artifact, not a `git log` output that requires expert interpretation.

**Minimum delta:** A deterministic transform (e.g., `git log` → structured JSON evidence ledger) that the application *re-derives at audit time* from the protected branch. The transform plus the protected branch plus the TSA receipts together form testable IPE.

### 1.3 SOC 2 Trust Services Criteria

The TSCs most directly engaged by an evidence-link audit trail are CC7 (System Operations), CC8 (Change Management), and CC9 (Risk Mitigation). CC8.1 in particular requires that changes to "infrastructure, data, software, and procedures" be "authorized, tested, approved, and documented in an auditable manner."

- **CC7.2/CC7.3 (anomaly detection / monitoring):** Git does not natively detect anomalous events — e.g., a revoked signing key still appears "Verified" on past commits if the platform stored the verification at push time (GitHub's documented behavior). External monitoring required.
- **CC8.1 (change management):** Branch protection + required PR review + signed commits + required reviewers covers the *control* side of CC8.1 well. This is the part git does best. Reviewer attribution and approval chains map cleanly to PR/MR records.
- **CC9 (risk mitigation):** Requires demonstration that residual risks (e.g., compromised keys, force-push from a privileged user) are identified and mitigated. This pushes toward a sidecar.

**Where git fits:** authorization, attribution, sequencing of changes, peer review.
**Where git does not fit:** tamper-evident *time*, monitoring/alerting, and demonstrating that the protected branch is in fact the entity's only system of record.

**Minimum delta:** TSA-stamped commits + a documented (and tested) CC4-style monitoring control that periodically verifies the integrity of the signed-commit chain against an externally-held snapshot.

### 1.4 ISO 27001:2022 — Annex A 5.33 (Records Protection) and 8.15 (Logging)

Annex A 8.15 requires organizations to "produce, store, protect, and analyze logs" and explicitly demands that "logging facilities and log information must be protected against tampering and unauthorized access." A.5.33 requires records to be protected from loss, destruction, falsification, and unauthorized access/release.

The auditor's classic 8.15 question — "How do you ensure your IT Manager cannot delete the audit log of their own actions?" — is exactly where git's distributed model both helps and hurts:

- **Helps:** Every clone is a full replica; collusion required to erase history globally. Distributed cryptographic chain.
- **Hurts:** A user with admin/bypass rights on the central remote can force-push, delete branches, or rewrite history (`filter-branch`/BFG). On GitHub, even with branch protection, repository administrators can be granted bypass. Reflog-only "deleted" objects are GC'd after `gc.reflogExpire` (default 90 days). `git filter-repo` and BFG Repo-Cleaner can expunge content entirely.

ISO 27001:2022 control A.8.15 is *compatible* with git, but compliance hinges on ancillary controls: synchronized clocks (which git does not enforce), tamper protection beyond the cryptographic chain (because the chain protects content, not order-in-time), and explicit retention policies (git's gc settings must be hardened).

**Minimum delta:** (a) `gc.reflogExpire = never` and `gc.reflogExpireUnreachable = never` on the canonical mirror; (b) push mirroring to a write-protected, append-only secondary (S3 Object Lock Compliance mode satisfies "WORM, hashing, immutability" guidance commonly cited for A.8.15); (c) periodic `git fsck --full` integrity verification; (d) admin bypass disabled or alarmed.

### 1.5 HIPAA §164.312(b) — Audit Controls

The HIPAA Security Rule's audit-controls standard requires "hardware, software, and/or procedural mechanisms that record and examine activity in information systems that contain or use ePHI." It is risk-based and addressable; HHS deliberately did not prescribe a technology.

Crosswalker is unlikely to ever directly hold ePHI (it maps controls, not patient data), but customers using it for HIPAA crosswalks will treat the evidence-link history as part of their compliance records. The HIPAA bar here is *low* — an audit log is acceptable in many forms — but HIPAA requires the log to record "who did what, when," and §164.312(c) (Integrity) requires a mechanism to authenticate ePHI hasn't been improperly altered.

**Verdict:** Signed commits + branch protection meet 164.312(b) for the audit-control standard *provided* the commit-time problem is addressed. HIPAA is the most permissive of the five standards reviewed; if you satisfy SOC 2 CC8.1 and ISO A.8.15, HIPAA falls out.

### 1.6 Sarbanes-Oxley §802 / §404 (Bonus)

SOX §802 requires audit-related records to be retained for **seven years** and, per SEC Rule 17a-4 and standard interpretive guidance, in a "non-rewritable, non-erasable" (WORM) format or in systems with "a complete audit trail permitting recreation of original records" (the 2022 Rule 17a-4 amendment). Section 802 also criminalizes intentional alteration, destruction, or falsification of records, with penalties up to 20 years imprisonment.

Bare git is *not* WORM. Force-push, `filter-repo`, and admin override all destroy the WORM property. The 2022 17a-4 alternative — "complete audit trail permitting recreation" — is plausibly satisfied by a TSA-stamped, externally-mirrored signed-commit chain, but only if the mirror itself is non-modifiable.

**Minimum delta for any customer in SOX scope:** Periodic export to S3 Object Lock Compliance mode (or Azure Blob immutable tier, or Glacier Vault Lock — all assessed by Cohasset Associates as meeting SEC 17a-4(f)/FINRA 4511/CFTC 1.31 WORM requirements) for the full 7-year window.

### 1.7 U.S. Federal Rules of Evidence 901 / 902(13) / 902(14)

FRE 901 establishes the general authentication threshold — evidence is what its proponent claims. FRE 902(13) (added Dec. 2017) makes self-authenticating "a record generated by an electronic process or system that produces an accurate result," and 902(14) does the same for "data copied from an electronic device, storage medium, or file" via "a process of digital identification" — the Advisory Committee Note explicitly contemplates SHA-256 hash comparison.

This is where git looks *good*. SHA-256-signed commits are a textbook 902(14)-type identification process, and a signed-commit chain is plausibly a 902(13)-type system "that produces an accurate result." But both rules require:

1. **A "qualified person"** (someone who would qualify as a foundation witness at trial) who can certify the system and process.
2. **Reasonable pretrial notice** to the opponent.
3. A certification "containing information that would be sufficient to establish authenticity were that information provided by a witness at trial."

The certification must be *non-conclusory* and describe the process. Git's commit hash and signature satisfy the digital identification element; the gap is procedural — most organizations have not pre-built the qualified-person certification template, and most engineers do not qualify as a "qualified person" simply by having committed code.

**Minimum delta:** Crosswalker should ship a built-in **Audit Authenticity Report** export — a PDF/JSON bundle containing (a) the commit chain hashes, (b) the corresponding TSA receipts and verification status, (c) a system-description blurb describing the process, formatted for use as a 902(13) certification. This costs almost nothing to build but is the difference between "interesting log file" and "self-authenticating evidence."

Note on case law: Courts have admitted git evidence in employment, IP, and trade-secret matters, but there is no published controlling appellate decision specifically blessing git history as a self-authenticating 902(13) record. Forensic-evidence treatises consistently treat hash-based authentication of digital records as routine post-2017, and there's no reason to expect git would be treated worse than any other hashed digital artifact — but it has not yet been bench-tested at the appellate level.

### 1.8 FRCP 26 / 34 ESI Preservation

Once litigation is "reasonably anticipated," a litigant must preserve relevant ESI. Git's append-only design is preservation-friendly *by default*, but force-push, BFG, and submodule history opacity all break this. Zubulake (the canonical $29.3M sanction case) and Allied Concrete ($542K + $180K fees) demonstrate that courts treat ESI spoliation harshly, and the standard is whether a "reasonable" preservation system was in place — admin-bypass on a protected branch will not meet that standard if invoked during a litigation hold.

**Minimum delta:** Documented procedure to (a) freeze admin bypass on litigation hold and (b) lock the most recent S3-Object-Lock snapshot with a Legal Hold flag.

---

## 2. Failure-Mode Inventory

Listed roughly from most operationally likely to most exotic. "Cost" tier: **C** = cheap config, **D** = operational discipline, **$** = paid third-party tooling.

| # | Failure Mode | How It Subverts the Trail | Mitigation | Cost |
|---|---|---|---|---|
| 1 | **Author/committer date manipulation** (`GIT_AUTHOR_DATE`, `git commit --date=`, `git-backdate`) | The commit signature is over the commit object, which *includes* the asserted timestamp. A signed commit can be signed with an arbitrary past or future date. | RFC 3161 TSA receipts on every audit-relevant commit; reject commits whose committer-date is more than N seconds from TSA time. | **$** (or **C** with FreeTSA / Sigstore) |
| 2 | **Force-push on protected branch via admin bypass** | GitHub/GitLab admins can bypass branch protection (configurable). Server-side reflog eventually GCs the original tip. | Disable bypass; if business requires bypass, alarm on every bypass via webhook; mirror to S3 Object Lock continuously. | **C** + **D** |
| 3 | **History rewrite on a fork or local clone, then re-pushed** | Even with branch protection on `main`, a maintainer with push rights to a feature branch can rewrite local history before merging, then squash-merge — destroying the original signed history. | Require linear history + "Require signed commits on all commits in PR" + dismissal of stale reviews on rewrite; record post-merge tip in TSA chain. | **C** |
| 4 | **Signing key compromise (post-hoc)** | An attacker with a stolen key can sign backdated commits. Without trusted timestamps, "Verified" badges remain valid until/unless platform revokes. GitLab's "verified" status becomes ambiguous after key revocation; GitHub stores verification at push time and continues to display "Verified." | TSA receipts (which are signed by the TSA's key, not the author's) provide an independent time anchor — a forged commit dated before the key compromise but stamped by the TSA *after* would be detectable. Plus standard key-rotation discipline; require hardware-backed keys (YubiKey, secure enclave). | **D** + **$** |
| 5 | **Lost branches / orphan commits / reflog GC** | Default `gc.reflogExpire = 90 days`, `gc.reflogExpireUnreachable = 30 days`. A branch deleted before a backup occurs becomes unrecoverable. | `gc.reflogExpire = never`, `gc.reflogExpireUnreachable = never` on canonical mirror; periodic `git fsck --full` + `git gc --auto=0`; tag every audit-relevant commit (tags are first-class refs and resist GC). | **C** |
| 6 | **`filter-repo` / BFG content expunge** | These tools rewrite history wholesale. Even if the canonical remote rejects, a local clone + new push as a fresh repo defeats the chain. | External WORM snapshot — once written to S3 Object Lock Compliance, the original is undeletable for the retention window even if the live repo is destroyed and recreated. | **$** (S3 Object Lock costs ~$0.023/GB-month; trivial at GRC scale) |
| 7 | **Submodule history opacity** | Submodule commits are referenced by SHA in the parent but the submodule's own audit chain lives elsewhere. If you lose the submodule repo, you lose the subordinate evidence. | Avoid submodules for evidence vaults; if used, mirror submodule repos to the same WORM target. | **D** |
| 8 | **Multi-vault federation chain fragmentation** | If two vaults cross-reference each other (e.g., vault A says "see evidence-link-42 in vault B"), the audit chain is only as strong as the weaker vault. | Require federated vaults to publish their TSA-stamped tip hash on a shared, externally-verifiable feed (Merkle-tree style). | **$** |
| 9 | **Clock skew on author's machine** | Even without malice, a misconfigured clock produces commits dated incorrectly. | TSA stamping makes this obvious — TSA time vs. commit time delta becomes an alert signal. | **C** with TSA |
| 10 | **Repo holder ransom / hardware loss** | Tier 1 local-vault failure mode: the user loses their laptop. | Mandatory remote mirror in Tier 1 — even the "local-first" vault must push to *something* (could be a self-hosted Forgejo, GitHub, etc.) for any audit claim to survive. | **D** |
| 11 | **Signature verification gaps for old commits** (the lobi.to attack model) | If signing keys are added to GitLab *after* commits are made, those commits stay "unverified" forever. Verification is platform-stored, not self-contained. | Verify signatures locally with `git verify-commit` against an externally-anchored keyring snapshot; do not rely on platform "Verified" badges as audit evidence. | **C** |
| 12 | **Repo administrator collusion** | Two admins coordinate to disable branch protection, force-push, re-enable. | This is the irreducible problem that purely-internal git cannot solve. Only an external, immutable mirror defeats this. | **$** (external WORM is the only fix) |
| 13 | **Platform compromise** (GitHub/GitLab outage or breach) | Single-platform reliance creates a chokepoint. | Auditree's deliberate architectural choice: "pure git, no proprietary vendor APIs" — repo can be served from anywhere. Add at least one non-platform mirror. | **C** |
| 14 | **No qualified-person certification template** | At litigation/audit time, a developer cannot improvise a 902(13)/(14) certification that will hold up. | Ship a built-in Audit Authenticity Report exporter (see §1.7). | **C** (one-time dev cost) |

The takeaway: **about half of these failure modes are closed by free/cheap configuration; about a third require operational discipline; and the residual third — the ones involving deliberate, privileged-insider tampering — require an external party (TSA + WORM mirror).** That residual third is precisely where SAS 142's "susceptibility to management bias" attribute lives.

---

## 3. Tier-Based Recommendation

### 3.1 Tier 1 (Local File Vault) — Minimum Bar

The temptation in a "local-first/files-first" tool is to defer all audit-trail hardening to Tier 2 or 3. Resist this. The minimum bar for Tier 1 to make defensible audit-trail claims:

1. **Required: signed commits on every evidence-link state change.** Use SSH signing (Git ≥2.34) to avoid GPG key-management UX pain. Tooling enforces this; users cannot opt out.
2. **Required: at least one remote mirror** (even if it's the user's own self-hosted Forgejo or a free GitHub repo). The product must refuse to claim "audit trail" for a vault that has never been mirrored. Distributed redundancy is the *only* git-native control against management bias.
3. **Required: RFC 3161 TSA stamping for every commit that mutates evidence-link state.** Free public TSAs (FreeTSA, the `rfc3161.ai.moda` aggregator, Sectigo's free endpoint, Apple/Microsoft TSAs) make this functionally free at GRC volume. Sigstore's open-source Timestamp Authority is also viable for self-hosting in Tier 3. Receipts (`.tsr` files) are stored alongside the commits in a `.audit/timestamps/` directory.
4. **Required: `gc.reflogExpire = never` and `gc.reflogExpireUnreachable = never`** in the vault's git config.
5. **Required: built-in Audit Authenticity Report export** (FRE 902(13)-style certification).
6. **Recommended: branch protection on `main` if a hosted remote is used.** Crosswalker can detect and warn if branch protection is missing.

Without items 1–5, Tier 1 should not market "audit trail" — it should market "version history." The semantic distinction matters legally.

### 3.2 Tier 2 (sql.js Sidecar / Local DB) — What Changes?

The sql.js sidecar is a *materialized view*, not a system of record. It accelerates queries; it does not improve audit guarantees, and it can actively hurt them if treated as authoritative.

- **The sidecar must be rebuildable from git history alone.** This is non-negotiable. If git is the system of record, the SQL view is a cache. If the SQL view diverges from git, git wins.
- **The sidecar offers zero audit benefit on its own** — a local SQLite file is trivially modifiable and has no signing/timestamp chain.
- **However:** the sidecar is the right place to *enforce* the discipline that every state change goes through git. A wrapper API that writes to the sidecar must always also commit and (per Tier 1 minimum #3) request a TSA receipt. This is closer to the "system that produces an accurate result" language of FRE 902(13).

**Tier 2 net effect on audit story: neutral-to-slightly-positive,** because it lets Crosswalker enforce write-through-to-git in code rather than relying on user discipline.

### 3.3 Tier 3 (Server-Backed) — Can the Server Provide Missing Guarantees?

Yes, partially. A Crosswalker server can:

1. **Operate the canonical git mirror with strict branch protection and bypass disabled.** This addresses failure modes #2, #3, and #12.
2. **Run a continuous monitor that performs `git verify-commit`, TSA receipt verification, and `fsck --full` on every push.** This addresses #4, #5, #11.
3. **Perform periodic (e.g., hourly or per-commit) export to S3 Object Lock Compliance bucket** with 7+ year retention. This addresses #6, #10, #12. The Cohasset assessment of S3 Object Lock confirms Compliance mode meets SEC 17a-4, FINRA 4511, and CFTC 1.31, which is the strongest WORM bar in U.S. regulatory practice.
4. **Aggregate the qualified-person certification** by issuing its own SOC 2-attestable statement about the integrity of the chain — converting the user's IPE problem into the server's IPE problem, where it can be solved with infrastructure controls.
5. **Publish the latest commit hash to a public, append-only channel** (a tweet, a public Merkle-tree timestamp service like OpenTimestamps, or a static HTTPS feed) — providing a "no later than" anchor that even a fully-compromised server cannot retroactively forge.

The server *cannot* fix:

- The author's local clock at commit time (TSA partly addresses).
- A user's decision not to use the server (which is why Tier 1 must include TSA stamping).
- Cryptographic primitive failures (SHA-1 collision attacks on git's object model — git is migrating to SHA-256; track this).

**Tier 3 net effect on audit story: this is where "tenable" becomes "defensible against a skeptical auditor."**

---

## 4. Decision: Reaffirm, Augment, or Replace?

### **Augment.**

Specifically:

1. **Reaffirm git as the system-of-record substrate.** It is the right primitive: append-only, content-addressed, cryptographically chained, distributed, well-understood by engineering audiences, and — per Auditree's documented threat model — explicitly designed-around for a reason. Auditree's reasoning ("Git meets all our requirements; it's used daily by our team, we're well versed in managing access & integrity, it has a well documented interface… The Locker is implemented as 'pure git', and does not use proprietary vendor APIs") is the prior art Crosswalker should follow.

2. **Augment with three required hardening layers, all shipped in Tier 1:**
   - **Trusted timestamps (RFC 3161)** on every commit affecting evidence-link state. Free public TSAs make this operationally negligible.
   - **External WORM snapshot** (S3 Object Lock Compliance, Azure Blob immutable, or equivalent) on a schedule (per-commit for high-stakes customers; hourly/daily for others). Cost is trivial at GRC document volumes.
   - **Built-in qualified-person certification export** producing a 902(13)/(14)-shaped artifact.

3. **Do not replace.** Append-only ledger sidecars (QLDB, immudb), blockchain notarization, and bespoke audit chains were all considered. They add operational complexity, vendor lock-in (or, for blockchain, ecosystem volatility), and a second source of truth that must itself be reconciled to the file vault. None of them solve a problem that TSA + WORM doesn't already solve more cheaply. Per the brief's out-of-scope guidance, blockchain is overkill — but to be explicit: the marginal value of a public blockchain anchor over an RFC 3161 TSA, for the specific use case of "prove this commit existed by time T," is essentially zero, while the operational and explanation-to-auditor cost is high.

4. **Document the residual risk explicitly.** The residual is: a litigant with admin bypass on the live repo *and* the ability to compromise the WORM bucket *and* the ability to produce a forged TSA receipt — i.e., a three-party collusion involving an external CA. This is below the bar that any GRC tool (including Vanta, Drata, Hyperproof, AuditBoard) credibly defends against, and is a defensible residual to disclose in customer security documentation.

### Why this matches the prior art

**Auditree's threat model**, the closest open-source prior art, deliberately uses git as "pure git" (no vendor lock-in) and treats the locker as "tamper evident." But Auditree's docs are notably quiet on time-attack mitigation and external WORM — its threat model focuses on tampering detection, not tampering prevention. Auditree leans on the assumption that the locker is hosted on a SaaS git platform managed by a separate team ("if we're using systems managed as a service by other teams we have less access & ability to tamper with them" — i.e., separation-of-duties via vendor boundaries). Crosswalker's local-first posture *removes* that separation-of-duties, so it must replace it with a different external party — and the cheapest external party is a TSA.

**Commercial GRC tools** (Vanta, Drata, Hyperproof, OneTrust, AuditBoard) generally do *not* use git as their evidence store. Their audit logs are typically append-only database tables with cryptographic chaining and SOC 2-attested operational controls; the assurance their auditors give to *their* customers' auditors is essentially "we are SOC 2 Type II audited and our log integrity controls are part of that report." This is the SaaS shortcut Crosswalker explicitly rejects by being local-first. The price of that rejection is that Crosswalker must provide its own integrity story — and TSA + WORM is the lightest credible such story.

---

## 5. User-Facing UX Implications

If the augmentations above are required, the user must see *something* — but the design goal should be "audit-grade by default, visible only when the user wants it."

### 5.1 Default UX (invisible)

For 95% of users, the augmentations are background. The user sees:

- A small "Audit-ready" badge next to a vault when (a) signing is enforced, (b) a remote is configured, (c) TSA stamping is current, and (d) WORM mirror is healthy. Red/yellow/green based on which are missing.
- No mention of RFC 3161, no `.tsr` files in the file tree, no Merkle proofs.

### 5.2 Power UX — "Audit Log" Panel

A dedicated panel (not the same as the file diff/version history panel) that surfaces:

- **Per evidence-link:** state-transition timeline (Draft → Reviewed → Approved → Superseded), with reviewer name, review date, *TSA-attested timestamp*, and a green/red verification badge. Clicking the badge reveals the chain of evidence: commit hash → signature verify → TSA receipt → WORM snapshot reference.
- **Vault-level:** "Last WORM snapshot: 2026-04-30 14:22 UTC, 1,247 commits sealed" with a button to verify the latest snapshot integrity.
- **Auditor mode:** an export button that produces the FRE 902(13)/(14)-shaped Audit Authenticity Report — a single PDF + JSON bundle the user can hand to their external auditor.

### 5.3 Notarization receipts

Users do *not* see raw `.tsr` files. They see:
- "Timestamp verified by FreeTSA (or DigiCert, etc.) on 2026-04-30 at 14:22:03 UTC" — a one-line attestation in the audit log panel.
- A "Show technical detail" disclosure that exposes the TSA's distinguished name, OID, and verification command.

### 5.4 What about supersedes chains?

Supersedes relationships are themselves evidence-state changes and should be commits like any other. The UX implication is that when an auditor asks "show me the lineage of evidence-link X," Crosswalker walks the supersedes chain *and* shows the TSA receipt for each transition — converting the supersedes chain from "an interpretation of git history" to "a sequence of independently-timestamped state transitions."

### 5.5 Settings / configuration UX

- **Required:** A signing-key onboarding wizard that creates an SSH signing key (lower friction than GPG) and registers it with the configured remote. Users who refuse should see an explicit "this vault will not be marked Audit-ready" warning.
- **Required:** A "remote and WORM snapshot" configuration page. Sensible defaults: any of GitHub/GitLab/Forgejo + any of S3 Object Lock / Azure Immutable Blob / Backblaze B2 with Object Lock.
- **Optional but recommended:** A "qualified person" profile that captures the would-be 902(13) declarant's name, role, and credentials, so the Audit Authenticity Report export can be pre-populated.

---

## Conclusion

The project owner's instinct — "I'm honestly not sure git history is tenable for audit trail" — is correct in the strict sense and wrong in the practical sense. Strictly, bare signed-commit + branch-protection git fails on SAS 142's "susceptibility to management bias" attribute, on PCAOB AS 1105's IPE precision-and-completeness controls, on ISO 27001 A.8.15's tamper-resistance-against-privileged-insiders requirement, and on SOX §802's WORM expectation. Practically, all four gaps close with cheap, well-understood, off-the-shelf controls — RFC 3161 timestamping, S3 Object Lock (or equivalent) snapshots, and a small amount of certification-template engineering.

The recommendation is to **reaffirm git as substrate, augment with TSA + WORM + certification export, and ship those augmentations in Tier 1 rather than deferring them.** Doing so puts Crosswalker on parity with — and in some respects ahead of — Auditree (which lacks built-in TSA stamping and built-in WORM mirroring) while preserving the local-first/files-first identity that distinguishes the project from Vanta/Drata-class SaaS tools.

The UX cost is one badge, one panel, and one "export audit report" button. The engineering cost is modest. The compliance benefit converts the project from "we use git for history" to "we produce audit evidence that satisfies SAS 142, AS 1105, SOC 2 CC8, ISO 27001 A.8.15, HIPAA 164.312(b), and FRE 902(13)/(14) — here is the certification." That is the difference between a power-user tool and a tool an external auditor will accept.

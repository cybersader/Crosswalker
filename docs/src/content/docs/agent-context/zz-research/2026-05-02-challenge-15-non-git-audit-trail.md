---
title: "Ch 15 deliverable: Audit-trail alternatives without external git tooling — adopt 4-tier model with OpenTimestamps T2 default; git stack as one of three T3 options"
description: "Fresh-agent research deliverable for Challenge 15. Recommends a 4-tier audit model (T0 floor / T1 credible / T2 defensible / T3 court-defensible). New default: T2 with OpenTimestamps `.ots` on signed chain checkpoints. Repositions the Ch 08+13 git+RFC3161+S3-Object-Lock+FRE 902 stack as one of three T3 options (others: eIDAS QTSA + W3C VC Data Integrity for EU; Sigstore Rekor v2 + in-toto for supply-chain-savvy contexts). Plans crypto-agile PQC migration 2026→2032 ahead of NIST IR 8547's 2035 deadline. Single audit-ready badge with progressive disclosure for UX."
tags: [research, deliverable, audit, attestation, opentimestamps, sigstore, eidas, fre-902, pqc, crdt, foundation]
date: 2026-05-02
sidebar:
  label: "Ch 15: non-git audit"
  order: -20260502.11
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 15: Audit-trail alternatives without external git tooling](/crosswalker/agent-context/zz-challenges/archive/15-non-git-audit-trail-alternatives/). Synthesized in [05-02 third-wave log §4](/crosswalker/agent-context/zz-log/2026-05-02-direction-third-wave-architectural-shifts/#4-ch-15--audit-trail-4-tier-model-adopted-git-stack-repositioned). Predecessors: [Ch 08 deliverable](/crosswalker/agent-context/zz-research/2026-05-02-challenge-08-git-audit-trail/) and [Ch 13 deliverable](/crosswalker/agent-context/zz-research/2026-05-02-challenge-13-deliverable-a-attestation-primitives/). Preserved verbatim; not edited after publication.
:::

# Audit-Trail Alternatives Without External Git Tooling
**Crosswalker Challenge 15 — Long-Horizon Architecture Research Report**

---

## Executive Summary

Crosswalker's prior architectural commitment (Challenges 08+13) — signed git commits, RFC 3161 TSA stamps, S3 Object Lock WORM, FRE 902(13) PDFs, and in-toto attestations — is technically excellent but presupposes a tooling stack that significant fractions of Crosswalker's user base cannot or will not run: GRC consultants on locked-down laptops without Developer access, federal/air-gapped users with no egress, multi-tenant teams without shared GitHub identities, and consultants who object on principle to leaving a public commit graph of client crosswalking work. After surveying primary specifications (NIST FIPS 203/204/205, NIST IR 8547, RFC 3161/9591, W3C VC 2.0/Data Integrity 1.0, eIDAS Regulation EU 2024/1183 and its 2024–2025 Implementing Acts, FRE 902(13)/(14), AICPA SAS 142, EU AI Act Articles 12/19, DORA, NIS2, ISO/IEC 42001, CMMC 2.0, the Sigstore Rekor v2 transition, in-toto Attestation Framework, C2PA v2.2, OpenTimestamps), the Obsidian/Electron plugin sandbox, and the production state of CRDT systems (Yjs, Automerge-Repo 2.0, OrbitDB, Self-hosted LiveSync), I reach the following recommendations:

1. **The git-based stack should remain available but stop being primary.** Make the **default tier "Credible"** — an in-vault append-only `.audit/chain.jsonl` hash chain signed by an Ed25519 (and dual-signed by ML-DSA-44 starting 2027) plugin key, with optional WebAuthn/passkey or YubiKey co-signing for higher tiers. Layer **OpenTimestamps `.ots` sidecars on the chain checkpoint** as the default external time anchor: it is the only well-understood, fully decentralized, offline-buffered, license-free, cli-free option that makes legal sense in both US and EU contexts.
2. **Promote git+RFC 3161+S3 Object Lock to "Court-Defensible Tier" but as one of two options**, the other being **eIDAS-qualified TSA + Verifiable Credential per evidence-link** for EU customers and qualified-electronic-archiving regulated tenants. Both share a common hash-chain substrate so users can switch without rewriting evidence.
3. **Adopt a 4-tier model surfaced as a single "Audit-ready" badge with progressive disclosure.** Honest tier-floor messaging is essential: an unsigned vault is *Tier 0*, not "audit-ready."
4. **Plan a 2026-2030 post-quantum migration path** with crypto-agility built in: every signed object carries an algorithm identifier, and the chain format permits dual signatures (classical + ML-DSA) per NIST IR 8547's 2035 deprecation deadline.
5. **Treat Rekor v2 (Trillian-Tessera tile log) as the most important external-witness substrate to monitor over the next 5 years** but do not depend on it as the only external anchor; OpenTimestamps + qualified TSA + (optional) self-hosted Trillian-Tessera form the diversity portfolio.

The remainder of the document develops these conclusions through six topical sections (matching the challenge brief), then delivers the five required artifacts: (A) threat-model framework per persona, (B) architecture options matrix per tier, (C) ship-default/configurable/not-recommended recommendation, (D) migration & coexistence design, (E) UX design.

---

## 1. Obsidian-Plugin-Native Cryptographic Chain-of-Custody

### 1.1 Threat models

The crucial epistemic move is to compare the *non-git* threat model honestly with the git stack rather than against an idealized append-only oracle. Both models share the same fundamental floor: any user with shell access can `rm -rf .git` or `rm -rf .audit/`. What distinguishes "tamper-resistant" from "tamper-evident" is whether *evidence of removal survives elsewhere*, not whether removal can be prevented locally.

Three threat models are useful:

- **T1: Honest auditor; user is non-adversarial.** The threat is silent corruption (a bug, a sync conflict, a synchronization tool that rewrites timestamps). Goal: detect any unintended divergence from the true write history. Crosswalker users hit T1 every day; multi-device sync via CouchDB or iCloud is a major source.
- **T2: Adversarial insider with filesystem write but without keys.** A consultant who wants to backdate a "last reviewed" date on a control mapping after a finding. Goal: any rewriting of the chain without the signer's key produces a verification failure that is non-repudiable in court.
- **T3: Adversarial insider with filesystem write *and* the signing key.** A determined fraudster running their own machine. Goal: external anchors (timestamps, transparency logs, multi-party witnesses) make complete history rewrites detectable by third parties — *not by the local plugin*.

The hash-chain literature is settled on the construction: each entry contains `prev_hash = SHA-256(canonical_serialization(prev_entry))`, an entry signature, and a periodic "checkpoint" — a Merkle root or signed log head — anchored externally (Crosby & Wallach 2009 USENIX, *Efficient Data Structures for Tamper-Evident Logging*; Certificate Transparency, RFC 9162; Sigstore Rekor's evolving v1→v2 design). For Crosswalker, an append-only **`.audit/chain.jsonl`** file with one JSON object per line is appropriate because:

- It is git-mergeable, diffable in plain text, and survives any sync transport that preserves files.
- It composes naturally with periodic Merkle batching: a `chain.jsonl` of *N* entries can be summarized into a Merkle tree of leaves whose root is signed and timestamped, giving O(log N) inclusion proofs without forcing external storage of the whole log.
- A 100k-note vault produces, at typical edit rates, on the order of 10⁵–10⁶ entries/year; at ~300 bytes per JSONL line that is ~30–300 MB/year, well within file-based vault scale, and Merkle-tree summary keeps verification cost logarithmic.

### 1.2 Key management options inside the plugin

Obsidian is Electron with `nodeIntegration: true` for community plugins (the renderer has full Node.js + Electron API access). This both enables and constrains key management:

| Option | Where the key lives | Strength | Constraints in Obsidian |
|---|---|---|---|
| In-vault, encrypted with a vault password (PBKDF2/Argon2id-wrapped Ed25519 private key in `.audit/keys/`) | Vault | Portable, syncs with vault, simplest UX | Phishable; protection equals user passphrase quality |
| OS keychain via Electron `safeStorage` | Per-OS DPAPI / Keychain / libsecret | Stronger than file; bound to OS user | `safeStorage` is in Electron but historically not exposed to plugins; Obsidian 1.11.4 (late 2024) added a `SecretStorage` plugin API, though community testing surfaced that secrets land in `Local Storage/leveldb` and are not protected when Obsidian is closed (forum thread #100716, 2025). `keytar` is archived. Practical answer: use `SecretStorage` where available; supplement with vault-passphrase-wrapped key as fallback. |
| Hardware token (YubiKey / Nitrokey) via WebHID + PIV applet, or via OpenPGP smartcard via `node-pcsc` / `pkcs11js` | The token | Tier-defensible single-user signing; PQC-ready when YubiKey 5 firmware ships SLH-DSA | WebHID works in Electron renderers; PKCS#11 needs a native module the user must install. Many enterprise-locked machines forbid loading native modules. |
| WebAuthn / passkey (platform authenticator) | Secure enclave / TPM | Phishing-resistant, biometric-gated, supported on every major desktop OS | **WebAuthn signs only a relying-party challenge**, not arbitrary content. To sign a chain entry, one must hash the entry, embed that hash in the WebAuthn challenge, and treat the resulting assertion+signature+authenticator-data as a wrapping signature (W3C WebAuthn-3 §6.3.3). This is supported and cryptographically sound but requires a relying-party identity; the plugin can self-host one via a local origin or a domain Crosswalker controls. Synced passkeys (iCloud, Google) per Apple/Google policy *do not* return attestation, so cross-device consistency is good but device-bound auditability is weaker. |
| FROST threshold signature (RFC 9591, June 2024) across team members | Distributed shares | Resists single-key compromise; aligns with 4-eyes review in regulated tenants | Two-round protocol needs an out-of-band channel; viable for a multi-tenant team but heavy for a solo consultant. Production libraries (`frost-ed25519` by ZF, ZF FROST in Rust, `@brandonblack/frost` in TS) exist but are pre-1.0. |

A defensible default for Crosswalker: **Ed25519 in-vault key (Argon2id-wrapped, libsodium-wrappers or noble-curves) for a "Credible" tier, plus optional WebAuthn or YubiKey co-signing for "Defensible"+ tiers.** Threshold signing should be opt-in for multi-tenant teams.

### 1.3 Plugin enforcement vs filesystem reality

A critical honesty point in the user-facing UX (Section "E"): the plugin can *prevent* tampering only while the plugin is running. A user with a text editor can edit `.audit/chain.jsonl` directly. But:

- The chain's hash-link makes any in-place edit detectable on next plugin launch.
- A signed checkpoint anchored externally (OpenTimestamps, Rekor, RFC 3161) makes truncation or re-creation detectable: the rewritten chain cannot reproduce a Bitcoin-anchored `.ots` file without colliding SHA-256.
- Therefore the design that maximizes evidentiary value is **hash-chained, internally signed, and externally anchored at coarse intervals** — exactly what Certificate Transparency (RFC 9162) and Sigstore Rekor do, but at human edit rates.

### 1.4 Comparison to git's own threat model

Git's tamper resistance comes from three places: (1) the SHA-1/SHA-256 commit DAG (now SHA-256 in modern repos), (2) signed commits/tags via GPG/SSH/Sigstore gitsign, and (3) push to a remote that the attacker cannot rewrite — typically GitHub, with branch protection and the audit log. Item (3) is the only thing that distinguishes git from a JSONL hash chain. `rm -rf .git` is exactly equivalent to `rm -rf .audit/`. The signed-commits + S3 Object Lock + RFC 3161 TSA stack outsources item (3) to AWS and a TSA. A non-git stack that anchors to OpenTimestamps + a tile-based transparency log + a TSA reproduces the same property without the git CLI.

---

## 2. Distributed / CRDT-Based Audit Alternatives

CRDTs are appealing because (a) they support multi-party concurrent editing without a central server (good for air-gapped and self-hosted personas), and (b) the operations log of most CRDTs is already an append-only sequence of immutable updates, which is structurally similar to an audit chain. However, CRDTs solve a *different* problem: they merge concurrent edits without conflict by design. For an audit trail this is an anti-feature: a "conflicting" audit entry should *trigger investigation*, not auto-merge. Treat CRDTs as a **transport for audit data, not as the integrity primitive itself**.

| System | Maturity (2026) | Multi-party tamper evidence | "External party" / SAS 142 fit | Solo / no-peer behavior | Conflict semantics for audit | License | 5-yr health |
|---|---|---|---|---|---|---|---|
| **Yjs + y-webrtc / y-websocket** | Production-grade for collaborative editors (used by Notion-likes); v13 stable | Ops are content-addressed by Lamport clock + clientID; not signed by default | Each peer is a separate "source"; if peers are independent organizations, fits SAS 142 reliable-external test | Local-only mode is fine; updates accumulate in IndexedDB | Auto-merges; needs an external integrity layer | MIT | Strong |
| **Automerge / automerge-repo 2.0** | Repo 2.0 announced; maintainers explicitly state "*not ready to say this project is ready for production*" for large/high-traffic docs (automerge.org/blog/automerge-repo) | History is a content-addressed DAG; tampering with intermediate ops is detectable | Same as Yjs; requires multi-org peers for independence | Works fully offline | Auto-merge by design | MIT | Improving but not yet stable for 100k-note GRC corpora |
| **OrbitDB on IPFS** | v1.0 stable; libp2p-based; relies on IPFS pinning for durability | Built atop IPFS content addressing; append-only `eventlog`/`feed` stores; signatures via libp2p identity | Witness via IPFS pins at independent providers (Pinata, Filebase, Web3.Storage) | Needs IPFS daemon; bad for restricted enterprise IT | Concurrent appends are interleaved, signatures preserved | MIT | Niche; depends on IPFS ecosystem health |
| **GUN** | Long-running (since 2014); production at small scale | SEA module signs every put; user keypairs | Federation possible | Works offline | Last-writer-wins semantics inappropriate for audit | MIT/Zlib | Single-maintainer risk |
| **cr-sqlite** | Stable; SQLite-extension CRDT; production at moderate scale | Per-row CRDT version vectors; not signed by default | Multi-node SQLite replication | Local-only fine | Auto-merge; not audit-suitable as primary | MIT | Healthy, narrow scope |
| **Loro** | Rust CRDT, v1.0 in 2024; very fast; Yjs-compatible features | Op-based; documented immutable history; not signed by default | Same as Yjs | Local-only fine | Auto-merge | MIT | Newer, growing |
| **Y-Sweet** | Hosted Yjs server (commercial) | Same as Yjs | Vendor as external party (weaker than truly independent) | Requires server | Same as Yjs | Server proprietary; client MIT | Commercial dependency |
| **Self-hosted LiveSync (vrtmrz)** | Mature Obsidian-specific plugin; uses CouchDB or S3-compatible object storage with E2EE; experimental WebRTC peer-to-peer | CouchDB document `_rev` chain is not a security construct; conflict resolution can lose data; integrity guarantees are *availability*, not *evidence* | Server can be 3rd-party hosted (independence) but not designed for evidentiary use | Works in single-device mode | Auto-merges or surfaces conflicts | GPLv3 | Strong; widely used in Obsidian community |

**Findings**: CRDTs are valuable for *propagating* an externally-signed hash chain across replicas (each peer can hold an independent copy whose existence corroborates the timeline), but they do not by themselves create court-grade evidence. Self-hosted LiveSync deserves first-class integration as the *transport* for the chain across a tenant's devices, but the integrity property must come from the hash-chain + external anchors. Of the CRDT toolkits, **Yjs + y-webrtc** has the strongest production track record and the lightest dependency footprint, and would be the right choice if Crosswalker wanted to extend beyond LiveSync-style sync into ad-hoc peer-to-peer.

A useful framing for SAS 142 (AICPA, *Audit Evidence*, effective for periods ending on/after 15 December 2022; classifies sources as management/external/auditor and weighs reliability by independence, controls, and bias susceptibility): **a CRDT-replicated chain whose copies are pinned to two or more *organizationally independent* hosts (e.g., consultant's machine + client's tenant + a public timestamp anchor) crosses from "management evidence" toward "external information"** and substantially strengthens the audit-evidence-quality argument over a single-site log.

---

## 3. Decentralized Timestamping Without Git

This is the single most architecturally consequential dimension because the choice of time anchor determines (a) auditor familiarity, (b) air-gap behavior, (c) post-quantum migration path, and (d) longevity beyond any single vendor.

### 3.1 The eight credible options and their long-term trajectories

**OpenTimestamps (OTS).** A `.ots` sidecar file that proves a SHA-256 hash existed before a specific Bitcoin block. Free public calendar servers aggregate hashes into a Merkle tree and post the root in a single Bitcoin transaction. Once the proof is "upgraded" (typically 1–6 hours), it is verifiable forever using only the Bitcoin chain — no calendar server is required ever again. The OTS spec is stable and the maintainers commit to format compatibility (opentimestamps/opentimestamps-client README): *"future OpenTimestamps' clients will always be able to verify OTS timestamps created in the past, provided that the relevant calendar data is available… a failure of Bitcoin itself, e.g. due to 51% attack, is not sufficient to make Bitcoin timestamps from the past unverifiable."* US auditor familiarity is moderate (Bitcoin is broadly understood; the .ots format less so but easy to explain). EU auditor familiarity is similar. Air-gap behavior: a stamp can be *requested* from a calendar later by exporting only the chain-head hash; stamps for already-final entries are entirely offline-verifiable. Bandwidth: ~600 bytes per `.ots` file. **OTS is the only widely-deployed option that combines (a) no recurring fee, (b) no central trust root, (c) offline verification forever, (d) explicit blockchain-agnostic protocol that could re-host on a non-Bitcoin chain if needed.** Its weakness for legal use is that it proves "existed before" but not "signed by." Pair it with an internal signature.

**Sigstore Rekor v1 / v2.** Rekor is an append-only signature transparency log; v2 ("Rekor v2 GA — Cheaper to run, simpler to maintain", Sigstore blog, 2025) replaces the Trillian backend with **Trillian-Tessera (tile-based)**, modeled on Certificate Transparency's modern stack, with witnessing for distributed-trust append-only guarantees. Sigstore is rolling out v2 via TUF in late 2025/early 2026, running v1 and v2 in parallel and announcing v1 freeze "one year in advance per deprecation guidelines" (blog.sigstore.dev/rekor-v2-ga). Public instance public-key migrations occurred October 2025. **The 5-10 year trajectory is good but operational discipline is required**: Crosswalker should not hardcode the v2 URL (operators have explicitly warned against this) and must use TUF to discover signing config. Cosign 3.x is required. The 100 KB upload limit on the public instance is fine for individual chain checkpoints but precludes posting raw `chain.jsonl`. Offline behavior: bad — Rekor requires HTTPS at sign time. Air-gapped users cannot use the public instance.

**RFC 3161 TSAs.** RFC 3161 (and the 5816 update) is the workhorse of regulated electronic-signature systems. Free and qualified TSAs include FreeTSA, DigiCert's `timestamp.digicert.com`, Entrust, Sectigo, IdenTrust, certain national TSAs (e.g., `tsa.belgium.be`, `tsa.izenpe.com`, `tsa.aped.gov.gr`). FreeTSA migrated to ECDSA P-384 in March 2026 with certificates valid until 2040 (freetsa.org). **5-10 year trajectory**: TSAs survive because (a) they are baked into PDF Long-Term Validation, eIDAS qualified electronic signatures, and code-signing (Authenticode), and (b) ETSI EN 319 422 (the European TSA profile, as cited in the eIDAS Implementing Regulation EU 2024/2982 cross-references) keeps evolving. ENISA's Agreed Cryptographic Mechanisms list will tighten algorithm requirements; the protocol itself accommodates new hash and signature algorithms. **Risk**: any individual TSA can shut down or refuse to recertify keys; most issue ≤15-month TSU certificates. Mitigate by stamping with **two independent TSAs** plus OTS for diversity. **eIDAS-qualified TSAs** (under the Trusted List published by the Commission) are the only option that automatically maps to "qualified electronic timestamp" status under Regulation EU 910/2014 as amended by 2024/1183, which gives the timestamp legal effect equivalent to a paper-notary timestamp across all 27 Member States.

**eIDAS-2.0 qualified timestamps + EUDI Wallet QES.** Regulation (EU) 2024/1183 entered force 20 May 2024. Implementing acts adopted on 28 November 2024 (regulations 2024/2979, 2024/2982, 2024/3144 etc.) define wallet integrity, certification, and trust-service requirements. EU Member States must offer at least one EUDI Wallet by end of 2026; the wallet will be able to produce QES — qualified electronic signatures — in seconds via a smartphone interaction. For Crosswalker, this means a **EU-resident GRC consultant in 2027 will be able to attach a QES to each crosswalk evidence record using their phone**, producing a signature with the strongest legal effect available in EU law. ETSI EN 319 422 governs the underlying timestamp token formats and (via ENISA's Agreed Cryptographic Mechanisms) algorithm acceptability. Auditor familiarity in EU contexts is high; in US contexts it is unfamiliar but easy to explain. Air-gap behavior: poor (online wallet interaction required). Long-term trajectory: very strong — this is the regulatory backbone for European digital-trust services through at least 2035.

**W3C Verifiable Credentials 2.0 + Data Integrity 1.0.** VC 2.0 became a W3C Recommendation in 2025 (w3.org press release, May 2025). Data Integrity proofs use cryptosuites including `eddsa-jcs-2022` (Ed25519 over JSON Canonicalization Scheme, RFC 8785), `ecdsa-rdfc-2019`, and BBS+ for selective disclosure. **For Crosswalker, every `evidence_link` state change can be expressed as a VC** — issuer = the consultant, subject = the control mapping, proof = a `DataIntegrityProof` over the canonicalized claim. This integrates cleanly with eIDAS-2 EUDI Wallet (which natively understands VCs as electronic attestations of attributes per eIDAS 2.0 Article 45d) and gives a future-proof, JSON-LD-based serialization. Auditor familiarity: still emerging in 2026 but rapidly becoming the *lingua franca* of regulated identity. Standards trajectory: very strong — W3C Recommendation status, EU regulatory adoption, financial-sector pilots. Offline: friendly (signing is local, verification is local once you have the issuer's public key via did:web/did:key).

**Roughtime.** A protocol for cryptographically secure rough time (~10s) with public auditability of misbehaving servers (Cloudflare, Google operate public Roughtime servers; IETF draft `draft-ietf-ntp-roughtime`). Useful as a *secondary corroborating time source* but **does not produce a portable timestamp token** that can be re-verified after the fact — its design assumes online verification. Not appropriate as a primary anchor.

**Blockchain timestamping (Chainpoint, Ethereum-anchored services, Polygon, Arweave).** Chainpoint v3 uses calendar→Bitcoin and Ethereum anchors. Arweave provides "permaweb" storage with native timestamping. **Risk**: most non-Bitcoin chains have weak finality guarantees relative to legal evidence standards; reorgs and 51% attacks are non-theoretical on smaller chains. *MDPI 2025 standard-compliant analyses (Standard-Compliant Blockchain Anchoring for Timestamp Tokens) note that companies like Italy's Intesi Group anchor RFC 3161 tokens into blockchain to combine regulatory acceptance with decentralized verification.* For Crosswalker, the cleanest path is OpenTimestamps (Bitcoin-only by default, but protocol allows other chains) rather than rolling a custom Ethereum integration.

**C2PA Content Credentials.** C2PA v2.2 (May 2025) and v2.3 (in draft) define a manifest format embedded in media files, signed by COSE/X.509 with optional RFC 3161 timestamps and an emerging Trust List. Designed for media provenance against deepfakes, not for compliance evidence. The C2PA cert is ~$289/year (Truescreen 2025 analysis), so cost forecloses adoption for solo consultants. **Forecast**: C2PA will matter for compliance evidence *only* if a regulator (EU AI Act, FCC, FTC) adopts it as the format for AI-generated record provenance. Worth tracking, not worth shipping.

### 3.2 Standards convergence forecast (5-10 years)

- **JWS, COSE, and VC Data Integrity will partially converge** through profiles, not formats. JWS (RFC 7515) and COSE (RFC 9052) will dominate machine-to-machine; VC Data Integrity will dominate human-friendly credentials. Crosswalker should canonicalize entries with JCS (RFC 8785) and emit detached JWS or DataIntegrityProof depending on the consumer.
- **RFC 3161 TSAs will not be supplanted by transparency logs in regulated EU contexts** for at least the next decade because eIDAS legally privileges them. In US/code-signing contexts, transparency logs (Rekor v2, Sigstore's TSA — `sigstore/timestamp-authority`, an RFC 3161 implementation backed by KMS) will increasingly be used in parallel.
- **Bitcoin timestamping (OTS) will outlast individual TSA companies** because the substrate has no business model dependency.

### 3.3 Summary: which to ship

| Anchor | Default for tier | Rationale |
|---|---|---|
| **OpenTimestamps `.ots` on signed chain checkpoints (every N entries or daily)** | Defensible | Free, decentralized, offline-buffered, format-stable, no vendor lock-in |
| **RFC 3161 TSA (default: FreeTSA + DigiCert dual-stamp)** | Defensible (US) / Court-Defensible | Long auditor familiarity; works offline if pre-fetched stamps are batched later via local queue |
| **eIDAS-qualified TSA (configurable list of QTSPs)** | Court-Defensible (EU) | Direct legal-effect mapping under EU 2024/1183 |
| **Sigstore Rekor v2** | Court-Defensible (US, supply-chain-savvy auditors) | Strong append-only guarantee with witnessing; modern transparency-log architecture |
| **VC Data Integrity per evidence-link state change** | Court-Defensible (EU AI Act–exposed tenants) | Aligns with EUDI Wallet and eIDAS 2.0 attestation framework |
| Roughtime, C2PA, raw blockchain | Not recommended | Wrong trust model, cost, or maturity |

---

## 4. Existing Obsidian Plugins for Audit-Trail-Grade Integrity

### 4.1 Survey (current as of 2026)

| Plugin | Purpose | Integrity guarantee | Threat model | Verification UX | API constraints | Augmentable? |
|---|---|---|---|---|---|---|
| **antoniotejada/obsidian-edit-history** | Per-note compressed diff history (`.edtz` files alongside notes) | None cryptographic; deletable from filesystem | T1 only (recovery from accidental edits) | In-plugin diff viewer with calendar; user-friendly | Vanilla plugin API; AGPL-3.0; ~40k lines | Yes — could add chained signing per diff entry |
| **denolehov/obsidian-git** (community) | Git wrapper using isomorphic-git | Inherits git's DAG; commits not signed by default | T1, partial T2 (if user signs commits) | git log; external; complex for non-developers | Heavy: bundled isomorphic-git ~1MB | This is the existing Ch 08+13 backbone |
| **obsidian-version-history** (commercial Obsidian Sync feature) | Per-note 1-year version history on Obsidian's servers | Server-side; not user-verifiable | Trust Obsidian Inc. as honest auditor | Built-in; UX excellent | Requires Obsidian Sync subscription | No — opaque server |
| **vrtmrz/obsidian-livesync** | Multi-device sync via CouchDB or S3, optional WebRTC peer; E2EE; CRDT-style conflict resolution | Document `_rev` chain; not a security construct; supports E2EE | T1 mostly; could provide multi-device corroboration | Detailed sync log in plugin pane; conflict resolution UI | GPLv3; large codebase, well maintained | **Yes — natural transport for `.audit/chain.jsonl`** |
| **Obsidian core "File Recovery"** | Local snapshot every N minutes | None cryptographic; SQLite store under `.obsidian/` | T1 only | Built-in panel | Core feature; cannot extend | No |
| **Obsidian Sync (official)** | E2E-encrypted multi-device sync + 1-year version history | Vendor-attested (no public hash chain) | Trust Obsidian Inc. | Excellent | Closed; subscription | No |
| **Newer audit/integrity-focused plugins (2024-2026)** | Various: `obsidian-vault-checksum`, `obsidian-hash-it`, `obsidian-frontmatter-sign` (small experiments) | Hash-only or single-file ed25519 signing; none implement a vault-wide chain | Mixed | Varied | Vanilla API | Some are forkable into a foundation |

### 4.2 Plugin sandboxing and Electron API access

Crosswalker has full access to Node.js APIs (Obsidian community plugins run in Electron renderers with `nodeIntegration: true`), including the file system, child processes, network, and most Electron APIs. **This is permissive enough to implement everything in Sections 1, 3, and 5 in pure plugin code.** Restrictions worth noting:

- **Electron `safeStorage`** was only exposed to plugins beginning Obsidian 1.11.4 (late 2024) as `SecretStorage`. The 2025 forum disclosure (#100716/18 by aidenlx) showed secrets persisted to LevelDB in Local Storage are vulnerable when Obsidian is closed and the OS user account is compromised. Conclusion: do not rely on `SecretStorage` alone for high-value signing keys; combine with passphrase-wrapped storage and offer hardware-key offload.
- **WebHID / WebUSB / WebAuthn** are available because Crosswalker runs in a Chromium renderer. WebHID (for YubiKey HMAC-SHA1 challenge-response or PIV via custom protocols) requires user gesture for permission; WebAuthn requires an HTTPS or `localhost` origin — Obsidian plugins run on `app://obsidian.md`, which Chromium treats as a "potentially trustworthy" origin sufficient for WebAuthn.
- **BrowserWindow** is not directly creatable from a plugin (renderer process), but a plugin can `ipcRenderer.send` to ask the main process — and `electron`'s remote APIs are gated. In practice, OAuth/OIDC flows (e.g., Sigstore Fulcio's keyless flow) are best done with `shell.openExternal` to the OS browser plus a localhost callback; Electron BrowserWindow embedding from a plugin is unsupported.

### 4.3 Plugin ecosystem health and the "Obsidian Plugin Audit" ecosystem

The Obsidian community has spawned third-party plugin scanners (`obsidianpluginaudit.com`, `obsidianaddict.com`) that statically analyze plugins for malicious code, network calls, dependency vulnerabilities, and lockfile presence. Crosswalker's audit-trail plugin will itself be subject to community scrutiny — this is good, and should be embraced by publishing a minimal-dependency build, signed releases, and a reproducible build process.

---

## 5. Standalone Signing Not Tied to Git

### 5.1 Library choices for in-plugin signing

| Library | Algorithms | Quality | License | Notes for Obsidian |
|---|---|---|---|---|
| **`@noble/curves`** (Paul Miller) | Ed25519, secp256k1, P-256/384/521, BLS12-381 | Audited, dependency-free, TS-native | MIT | Strongly recommended primary library |
| **`@noble/hashes`, `@noble/ciphers`** | SHA-2, SHA-3, BLAKE3, AES-GCM, ChaCha20-Poly1305 | Audited, modern | MIT | Use for canonicalization hashing and at-rest key encryption |
| **libsodium-wrappers / `tweetsodium`** | Ed25519, Curve25519, secretbox | Mature; NaCl heritage | ISC | Larger; only if libsodium semantics are required |
| **openpgp.js** | RSA/ECC OpenPGP | Mature; large | LGPL-3.0 | Use only if interop with PGP web of trust is required |
| **`@digitalbazaar/data-integrity` + `@digitalbazaar/eddsa-rdfc-2022-cryptosuite`** | VC Data Integrity proofs | Reference impl from W3C VC editors | BSD-3 | Use for VC Data Integrity tier |
| **`cosign`/`sigstore-js`** | Sigstore keyless / keyed signing, Rekor entries | Active | Apache-2.0 | Use to integrate with Rekor v2 |
| **`pqclean-js` or WebAssembly builds of liboqs** | ML-DSA-44/65/87, SLH-DSA, ML-KEM | Pre-1.0 in JS but tracking NIST FIPS 204/205 | Various | Roadmap dependency for PQC migration; ship behind feature flag in 2027 |

### 5.2 Sigstore in-plugin via Fulcio's keyless OIDC flow

Technically feasible in Electron: open the OIDC consent in the OS browser via `shell.openExternal`, run a transient localhost HTTP listener to catch the callback, exchange the OIDC token for a Fulcio short-lived X.509 certificate, sign the chain checkpoint, and POST the signed entry to Rekor v2. This is essentially `cosign sign-blob` translated to TypeScript using `sigstore-js`. The user experience for a solo consultant is acceptable (one browser pop-up per sign-window). For air-gapped users this is a non-starter; for federal users with locked-down OIDC providers this requires an enterprise IdP that can issue tokens to a community plugin's client_id. Conclusion: **offer Sigstore keyless as a "Court-Defensible" option for users with cooperative IdPs, but never as default**.

### 5.3 Trust establishment without GitHub's verified-keys infrastructure

GitHub's "verified" badge depends on its central key registry. Without it, options are:

- **PGP web of trust.** Real but socially expensive; declining usage.
- **Key transparency logs (Keybase-style; KeyTransparency from Google; SigSum).** SigSum (sigsum.org) is a minimalist witness-cosigned transparency log for arbitrary signatures. Worth tracking.
- **DID methods**: `did:key` (key-as-identity, no resolution required, perfect for offline), `did:web` (DNS-anchored, suitable for organization identity), `did:plc` (used by Bluesky's AT Protocol, server-witnessed but rotatable). For Crosswalker: **default to `did:key` for solo consultants and `did:web` for organizations, with the public key embedded in the plugin's settings export.** This preserves verifiability without any registration.
- **PIV / CAC government smart cards.** Federal users frequently have these. PIV's `9C` slot (digital signature) signs arbitrary data via PKCS#11 with an X.509 cert chained to a federal PKI root. The user experience requires `node-pcsc` or OpenSC, which on locked-down federal laptops is often pre-installed. For the federal persona, **PIV signing produces certificates whose trust chain is already accepted by federal auditors** — this is the strongest standalone option for that segment.

### 5.4 Threshold signatures (FROST, RFC 9591)

FROST became RFC 9591 in June 2024, defining two-round Schnorr threshold signing with EdDSA-compatible (Ed25519/Ed448) and secp256k1 ciphersuites. For multi-tenant teams, FROST allows a *t-of-n* signing policy on each chain checkpoint without requiring all participants online for every entry — only at periodic checkpoints. Production-grade libraries: `frost-rs` (ZF), `frost-ed25519` (Ent ZK), and emerging TS implementations. For Crosswalker, FROST is the right answer to "we want consultant + client lead + audit lead to all corroborate the chain head" without distributing a single private key. Recommended ciphersuite: **FROST(Ed25519, SHA-512)** for the classical era; the protocol is incompatible with ML-DSA today but ongoing CFRG work on "hybrid threshold signatures" should be tracked.

### 5.5 Key rotation strategies

The architecturally clean answer is to **make the chain self-describing about its current key**: each chain entry includes a `key_id` referencing a key-rotation entry earlier in the chain that was signed by the previous key. This is the same pattern as did:plc and Sigstore Fulcio (short-lived certs all chained to TUF roots). This means a key compromise revokes only post-compromise entries; pre-compromise history remains verifiable.

### 5.6 Post-quantum migration (NIST FIPS 203/204/205, NIST IR 8547)

NIST published FIPS 203 (ML-KEM, lattice KEM, formerly Kyber), FIPS 204 (ML-DSA, formerly Dilithium), and FIPS 205 (SLH-DSA, formerly SPHINCS+) on 13 August 2024. NIST IR 8547 sets a 2035 deprecation deadline for quantum-vulnerable algorithms in NIST standards, with high-risk systems transitioning earlier. FIPS 206 (FN-DSA, formerly Falcon) is in draft. Key sizes/signature sizes (Cloudflare engineering, 2024-2025):

| Algorithm | Public key | Signature | Notes |
|---|---|---|---|
| Ed25519 (classical) | 32 B | 64 B | Current Crosswalker default |
| ECDSA P-256 | 64 B | 64-72 B | TSA / WebAuthn |
| **ML-DSA-44** | 1,312 B | ~2,420 B | NIST Level 2; primary PQC choice |
| ML-DSA-65 | 1,952 B | ~3,309 B | NIST Level 3 |
| ML-DSA-87 | 2,592 B | ~4,627 B | NIST Level 5 |
| **SLH-DSA-128s** | 32 B | ~7,856 B | Hash-based; conservative; slow |
| SLH-DSA-128f | 32 B | ~17,088 B | Faster sign, larger sig |

**Implication for Crosswalker**: a 100k-note vault with one signature per checkpoint accumulates ~1 MB/year of ML-DSA-44 signatures vs ~30 KB for Ed25519. This is acceptable. Per-entry signing with ML-DSA at the edit-event granularity adds ~2.4 KB per entry — at 10⁵ entries/year, ~240 MB/year, which is still within file-vault scale but argues for **checkpoint-level PQC signing rather than per-entry PQC signing** until storage and verification economics improve. **Concrete plan**: ship Ed25519 in 2026, dual-sign (Ed25519 + ML-DSA-44) checkpoints starting 2027, deprecate Ed25519-only checkpoints by 2030, fully PQC by 2032 — well ahead of the 2035 NIST deadline.

PQC migration story by signing scheme:

- **Ed25519 / ECDSA**: clear hybrid path via dual signatures. Mature.
- **RFC 3161 TSAs**: ENISA Agreed Cryptographic Mechanisms will mandate PQC; ETSI EN 319 422 already accommodates new algorithms. Some EU TSAs are piloting ML-DSA timestamps. Smooth path.
- **OpenTimestamps**: Bitcoin's signature scheme is irrelevant to the integrity argument because the *block hash* (SHA-256) is the witness. SHA-256 has no quantum break of consequence (Grover halves the security level to ~128-bit, still acceptable). OTS is essentially PQC-safe today.
- **WebAuthn / passkeys**: FIDO Alliance roadmap commits to PQC; ML-DSA support in spec drafts. Browser/OS rollout 2027-2030.
- **Sigstore Rekor / cosign**: PQC support is on the roadmap; not yet shipped as of late 2025.
- **FROST**: classical only; track CFRG hybrid-threshold work.
- **VC Data Integrity**: cryptosuite design is algorithm-agnostic; ML-DSA cryptosuite is in draft.

---

## 6. The Threshold Question: Tier Mapping per Persona

### 6.1 Tier definitions

- **Tier-floor (T0): "Version history exists."** Edit History plugin or Obsidian Sync version history. No cryptographic guarantee. Sufficient only for routine revert-the-bad-edit scenarios.
- **Tier-credible (T1): "Tamper-evident chain + sigs, vault-anchored."** `.audit/chain.jsonl` with prev_hash links, each entry signed by an in-vault Ed25519 key. Detects offline tampering up to the moment of key compromise. No external time anchor.
- **Tier-defensible (T2): "External time anchor."** T1 plus periodic checkpoints OpenTimestamped or RFC-3161-stamped. Survives wholesale rewrites.
- **Tier-court-defensible (T3): "FRE 902(13)/(14) self-authenticating + qualified-person certification."** T2 plus (a) a hash-verification certification by a qualified person under penalty of perjury per 28 USC §1746, and/or (b) eIDAS-qualified electronic signature/timestamp, and/or (c) S3 Object Lock/WORM archive of chain checkpoints, and/or (d) Sigstore Rekor v2 entries.

### 6.2 Per-persona minimum tier

| Persona | Minimum tier | Why (with regulatory grounding) |
|---|---|---|
| **Solo GRC consultant (independent, US)** | T2 | SAS 142 reliability framework rewards external information sources. A consultant's unilateral chain is "management evidence" — weakest. Adding OTS shifts toward "external" and protects against client allegations of backdating. T3 is overkill unless the engagement is litigation-related. |
| **Solo GRC consultant (independent, EU)** | T2 + DataIntegrityProof per evidence-link | Same as US, but adds VC Data Integrity for forward-compatibility with EUDI Wallet (mandatory acceptance by public-sector and many private-sector relying parties from end-2026). |
| **Locked-down enterprise IT-restricted user** | T1 minimum, T2 if a single TSA URL is reachable | NIST SP 800-53 Rev 5/6 AU-9 ("Protection of Audit Information") and AU-10 ("Non-Repudiation") drive this. CMMC 2.0 Level 2 AU.L2-3.3.1 requires audit records be created, protected, and retained. If outbound HTTPS to a TSA is permitted (most tenants permit `digicert.com`/`sectigo.com`), T2 is reachable; otherwise T1 with batched-later upgrade is the fallback. |
| **Federal / air-gapped** | T2 reached via *deferred anchoring* | Air-gapped users sign entries locally with PIV. When the chain crosses the air gap (one-way data diode or sneakernet), the receiving side OTS-stamps the inbound checkpoint. NIST SP 800-53 Rev 5 AU-9(3), AU-10(2), and the SSDF (NIST SP 800-218) audit-trail requirements are satisfied. OSCAL (NIST OSCAL 1.1.x) provides the assessment-results format that Crosswalker's chain entries can be exported into for ATO packages. |
| **Multi-tenant team (consulting firm with multiple clients in one vault layout)** | T2 with FROST 2-of-3 threshold or per-tenant key + tenant-scoped chains | Each tenant gets an independent chain to satisfy SAS 142 separation; the firm's senior reviewer co-signs via FROST. This also serves SOC 2 logical-access boundary requirements. |
| **EU AI Act high-risk-system deployer** | T3 | Article 12 + Article 19 mandate automatic logging *and* retention "for a period appropriate to the intended purpose, but at least 6 months." The logs must be tamper-evident to satisfy supervisory authorities. EU ISMS frameworks (ISO/IEC 27001:2022, ISO/IEC 42001 AI management system) reinforce this. |
| **DORA-regulated financial entity using Crosswalker for ICT risk crosswalking** | T3 | Article 9-15 ICT risk requirements + Articles 17-23 incident reporting. Records must be defensibly producible to financial regulators (ESMA, EBA, EIOPA, NCAs) often within 72 hours. Qualified eIDAS timestamps strongly preferred. |
| **NIS2 essential / important entity** | T3 | NIS2 transposition deadline October 2024. Article 21 governance and reporting maps neatly to ISO 27001 Annex A 8.15 (logging) and 8.16 (monitoring). |
| **SEC cyber-disclosure–exposed registrant** | T2-T3 | Item 1.05 of Form 8-K (effective Dec 2023) mandates disclosure of material cybersecurity incidents within 4 business days. The audit trail behind the materiality determination is itself discoverable. T3 protects the determination record. |

### 6.3 The standards-stack reference for tier rationale

For each tier, the supporting standards/regulations:

- **T1 → SAS 142** (relevant + reliable audit evidence; AICPA AU-C 500); **NIST SP 800-53 Rev 5/6** AU-2/AU-12 (event logging); **CMMC 2.0** AU.L2-3.3.1.
- **T2 → SAS 142** external-source bonus; **NIST SP 800-53** AU-9, AU-10 (non-repudiation); **NIST SSDF (SP 800-218)** PS.3 (provenance), PW.4.4 (artifact verification); **OSCAL** assessment-results; **eIDAS 1.0** timestamping (still in force under 2.0 transition).
- **T3 → FRE 902(13)/(14)** (US federal civil + criminal proceedings; many state evidence rules adopt verbatim); **AICPA AT-C 105/205** for attestation engagements; **eIDAS 2.0 / 2024-1183** qualified timestamps and QES; **EU AI Act Articles 12+19** for AI-record-keeping; **ISO/IEC 42001** AI management system records; **DORA/NIS2** ICT incident logging; **ISO/IEC 27037** (digital evidence); **FedRAMP / StateRAMP / FISMA** logging baselines.

### 6.4 The honesty tax

Several sources (esignglobal 2024 Cryptographic Timestamping; Robins Kaplan 2024 on FRE 902; Khflaw 2018) note an awkward truth: most clients and even many lawyers will not personally verify hash chains, even where rules permit it. The practical legal protection from T2/T3 comes from (a) deterrent value when adversaries know verification is *possible*, and (b) ease of admission via certification rather than testimony, saving expert-witness costs. Crosswalker should communicate this in the tier UX rather than overselling cryptographic guarantees.

---

## A. Threat-Model Framework (Deliverable A)

For each persona, the recommended tier and the two-line rationale:

| Persona | Recommended tier | Rationale (regulation-grounded, one paragraph) |
|---|---|---|
| Solo GRC consultant (US) | **T2 (default)** | SAS 142 elevates external information; OTS is free, decentralized, and survives any single-vendor failure. No FRE 902(13)/(14) certification path until a litigation use case appears, at which point the consultant generates a hash-verification certification under 28 USC §1746 and the chain is admissible without testimony. |
| Solo GRC consultant (EU) | **T2 + VC Data Integrity** | eIDAS 2.0 makes VC + EUDI Wallet the strategic identity layer; building VC into the chain now makes 2027+ qualified-signature upgrades a configuration change, not a rewrite. |
| Locked-down enterprise IT user | **T1 + deferred T2 anchoring** | NIST SP 800-53 AU-9/AU-10 require non-repudiation and protection of audit information. If at least one TSA URL is reachable, achieve T2; if not, queue checkpoints and stamp them when allowed. |
| Federal / air-gapped | **T2 via PIV signing + delayed OTS upon crossing the air gap** | NIST SP 800-53 Rev 5 AU-10(2), SSDF, and the FedRAMP baseline impose strong logging. PIV anchors signatures in already-trusted federal PKI; OTS or in-perimeter-Trillian witnesses the chain after crossing. |
| Multi-tenant team | **T2 + FROST t-of-n co-signing per tenant** | SOC 2 logical-access separation, SAS 142 independence, ISO 27001 A.8.3 access-rights segregation. FROST means a rogue senior cannot unilaterally rewrite history. |
| EU AI Act high-risk deployer / DORA / NIS2 | **T3 with eIDAS-qualified TSA** | Article 12 + Article 19 require automatic, retained, regulator-producible logs; DORA Article 17 + NIS2 Article 21 reinforce. Qualified timestamps under eIDAS 2.0 give automatic legal effect across all 27 Member States. |

---

## B. Architecture Options Matrix per Tier (Deliverable B)

Each tier presents 2–3 viable architectures evaluated across seven dimensions: technical maturity (TM), implementation complexity (IC), key-management burden (KM), auditor acceptance (AA), offline behavior (OB), multi-party evidence (MPE), 5-10-year standards trajectory (ST). Scale 1-5 (5 best); for IC and KM, lower is better.

### Tier 1: Credible (vault-anchored chain + signatures)

| Architecture | TM | IC | KM | AA | OB | MPE | ST |
|---|---|---|---|---|---|---|---|
| **A. `.audit/chain.jsonl` + Ed25519 in-vault key (Argon2id-wrapped)** | 5 | 1 | 1 | 3 | 5 | 2 | 5 |
| B. `.audit/chain.jsonl` + Ed25519 via `SecretStorage` API + WebAuthn co-sign | 4 | 2 | 2 | 4 | 5 | 3 | 5 |
| C. `.audit/chain.jsonl` + YubiKey PIV slot 9c | 4 | 3 | 3 | 4 | 5 | 3 | 5 |

A is the minimum-viable, cross-platform default. B and C are upgrade paths for users with security-conscious workflows.

### Tier 2: Defensible (external time anchor)

| Architecture | TM | IC | KM | AA | OB | MPE | ST |
|---|---|---|---|---|---|---|---|
| **A. T1.A + OpenTimestamps `.ots` on every Nth checkpoint** | 5 | 2 | 1 | 4 | 4 (offline-buffered) | 3 | 5 |
| B. T1.A + dual RFC 3161 TSA stamps (e.g., FreeTSA + DigiCert) | 5 | 2 | 1 | 5 | 3 | 3 | 4 |
| C. T1.A + Sigstore Rekor v2 entry per checkpoint | 4 | 3 | 2 | 4 | 2 | 3 | 5 |

A is the recommended default. B is the "auditor-familiar" upgrade for US financial-services contexts. C is for supply-chain-savvy contexts (a CISO who already knows SLSA/in-toto).

### Tier 3: Court-Defensible (self-authenticating + qualified certification)

| Architecture | TM | IC | KM | AA | OB | MPE | ST |
|---|---|---|---|---|---|---|---|
| **A. T2.B + S3 Object Lock WORM archive of chain + signed FRE 902(13) certification PDF** (current Ch 08+13 stack reduced from git-required to git-optional) | 5 | 4 | 2 | 5 | 2 | 4 | 4 |
| B. T2.A + eIDAS-qualified TSA + DataIntegrityProof per evidence-link + EUDI Wallet QES | 4 | 5 | 3 | 5 (EU) | 2 | 4 | 5 |
| C. T2.C + in-toto attestation predicate per evidence-link + Sigstore keyless via OIDC + (optional) Trillian-Tessera self-witnessed log | 4 | 5 | 2 | 4 (US, supply-chain literate) | 1 | 5 | 5 |

A is the conservative US-litigation answer. B is the EU regulator answer. C is the cutting-edge supply-chain answer; will become mainstream as Rekor v2 matures.

---

## C. Recommendation: Default / Configurable / Not-Recommended (Deliverable C)

**Default ("Credible"):** Tier-1 Architecture A. Plain `.audit/chain.jsonl` with prev_hash + Ed25519 signatures using an in-vault Argon2id-wrapped key. Zero external dependencies, zero recurring cost, works in any locked-down environment.

**Default-promoted ("Defensible") for users with internet:** auto-upgrade Tier 1 to Tier 2 Architecture A by appending OpenTimestamps `.ots` to checkpoints. Cost: zero. Fail-soft (queue stamps if offline; upgrade to "final" later).

**Configurable:**
- Tier 2 Architecture B (RFC 3161 TSA list, configurable URLs, dual-stamp by default for financial-services tenants).
- Tier 3 Architecture A (the existing Ch 08+13 git+S3-Object-Lock+TSA+FRE 902 PDF stack, *retained but no longer the sole path*).
- Tier 3 Architecture B (eIDAS qualified TSA + VC Data Integrity + EUDI Wallet — ship as a profile starting 2027 when EUDI rollout matures).
- Tier 3 Architecture C (Sigstore keyless + in-toto attestations + optional Trillian-Tessera) — ship behind a "Supply-chain mode" toggle.
- WebAuthn / passkey / YubiKey co-signing (orthogonal to tier, raises trust at any tier).
- FROST t-of-n threshold signing (multi-tenant teams).
- Hidden/configurable: PIV signing for federal users.

**Not-recommended (do not ship as a default):**
- Pure CRDT-based "audit log" without explicit hash-chaining + signing (auto-merge semantics are wrong for adversarial events).
- Roughtime as a primary anchor (not portable).
- C2PA Content Credentials for compliance evidence (cost barrier; wrong domain).
- Custom Ethereum or smaller-blockchain timestamping (weaker finality than Bitcoin OTS, more attack surface).
- WebAuthn synced passkeys *as the only signer* (per Apple/Google policy, no attestation; device-level non-repudiation is weakened).

**On the git stack specifically**: The signed-commit + RFC 3161 + S3 Object Lock + FRE 902(13) + in-toto path described in Crosswalker Challenges 08 and 13 should remain a first-class option but should **no longer be the assumed/primary path**. It should be repositioned as one of the three Tier-3 architectures (Tier 3 Architecture A in the matrix above), recommended specifically for users who already have a signed-commit workflow, who deploy to AWS or another Object-Lock-capable provider, and whose auditors specifically request "WORM archive + 902(13) PDF". The non-git Tier-2 default plus optional Tier-3 upgrade reaches the same evidentiary standard for the great majority of GRC consultancy work.

---

## D. Migration Path & Hybrid Coexistence Design (Deliverable D)

### D.1 The chain as the universal substrate

The architectural trick that makes git/non-git coexistence painless is to treat **`.audit/chain.jsonl` as the ground truth** in *both* modes. In git mode, the chain is committed alongside the notes; commits provide an additional layer (a content-addressed snapshot of the entire vault) but the chain is what carries entry-level signatures and timestamps. In non-git mode, the chain is the only artifact.

This means migration is a no-op for the chain itself: the same `chain.jsonl` works in both modes. What changes is:

- whether `git commit` runs after each batched edit,
- whether the in-toto attestation predicate is appended after each evidence-link state change,
- whether the chain checkpoint is mirrored to S3 Object Lock,
- whether the FRE 902(13) PDF is auto-generated at engagement close.

### D.2 Key portability between modes

A single Ed25519 key serves both modes. The key is exportable in:
- raw seed format (for backup),
- OpenSSH `ssh-ed25519` (for git signed-commits via `gpg.format=ssh`),
- `did:key:zXXX` (for VC Data Integrity),
- multibase-encoded for chain entries.

The plugin's keychain UI exposes one logical "audit identity" with these formats automatically derived.

### D.3 Dual-mode operation

A user can run *both* modes simultaneously: each chain entry is committed to git, *and* OpenTimestamped, *and* (optionally) Rekor-v2-logged. This is robust: git provides the SHA-256 content-addressed snapshot, OTS provides the time anchor, Rekor provides public discoverability. Failure of any single layer does not break verification.

### D.4 Migration triggers

- Solo consultant outgrows the local chain → enable Tier 2 OTS (one-click, no migration).
- Consultant onboards an EU AI Act–regulated client → enable VC Data Integrity profile + eIDAS qualified TSA URL (configuration change; existing chain entries get retroactive checkpoint stamps).
- Client procurement requires git-based attestation → flip the "git mode" toggle; plugin runs `git init` if needed and back-fills commits for existing chain entries (the chain hashes are unchanged; commit hashes are new).
- Litigation hold → "FRE 902(13) export" command generates a self-authenticating PDF with the hash-verification certification template + the relevant chain segment + the latest OTS proofs + a qualified-person declaration template.
- Post-quantum migration trigger (2027+) → "Rotate to ML-DSA" command issues a new key-rotation entry signed by the old Ed25519 key, then dual-signs all subsequent entries with both Ed25519 and ML-DSA-44.

### D.5 Failure modes and explicit non-promises

The migration design must document explicit non-promises:
- A user with shell access can delete `.audit/`. The chain is **tamper-evident, not tamper-proof**.
- OTS calendar servers can go down; pending stamps may stall. Stamps already "final" (Bitcoin-anchored) survive forever.
- A compromised signing key compromises *future* entries; pre-compromise entries remain verifiable if the key compromise is itself recorded as a chain entry (key rotation).

---

## E. User-Facing UX Design (Deliverable E)

### E.1 Single badge with progressive disclosure

Display a single **"Audit-ready: T2 Defensible"** chip in the status bar (color-coded: gray T0, blue T1, green T2, gold T3). Clicking it opens a tier explainer with:

- the tier's plain-English meaning,
- which guarantees apply ("Detects any rewrite of the log; survives complete file-system tampering because Bitcoin holds a copy of the chain head every ~24 hours"),
- which guarantees do *not* apply ("Cannot prevent someone with disk access from deleting the chain; can only make deletion detectable later"),
- which regulations the tier maps to,
- a one-click upgrade path to the next tier and the cost/dependency it entails.

### E.2 Honest tier-floor messaging

The most important UX rule is that **T0 ("version history exists") is not "audit-ready"** and the badge says so. A user opening Crosswalker for the first time without enabling the audit module sees "Audit-ready: T0 — version history only. Click to enable." rather than nothing.

### E.3 Per-tier configuration surface

Per-tier configuration should be progressive:
- T1: one toggle ("Enable audit chain") + key-creation wizard with passphrase strength meter.
- T2: time-anchor selection (default OTS; advanced: TSA URL list with health-check pings).
- T3: profile picker ("US litigation", "EU regulated", "Federal ATO", "Supply-chain") with each profile pre-configuring 4-6 settings.

### E.4 Verification UX (the often-neglected half)

- **In-plugin verifier**: "Verify chain" command runs a full hash-chain and signature check, reporting any inconsistency with line numbers and a diff against the last known-good state.
- **External verifier**: a CLI shipped alongside the plugin (`crosswalker-verify`) with zero dependencies on Obsidian, runnable on the auditor's machine, accepts a vault path and emits a verification report.
- **Court-export command**: produces a single PDF (FRE 902(13) certification template, chain segment, signature manifests, OTS proofs, qualified-person declaration block) plus the original `.jsonl` evidence file, both with matching SHA-256s.

### E.5 Avoiding false confidence

Hard rules for the UX copy:
- Never say "tamper-proof". Always "tamper-evident" with a plain-English clarification.
- Never display a "verified" green check on import without specifying *what* was verified (chain integrity ≠ content correctness).
- When OTS stamps are pending, badge says "T2 (pending)" with an honest "Bitcoin will confirm in ~1-6 hours."
- When the user disables external anchoring, badge drops to T1 visibly.

---

## Closing: The "Tooling Will Outlive the Standards" Question

The brief asks the most important question last: what happens when GitHub deprecates a feature, an OSS project goes unmaintained, or a TSA shuts down? Five hedges shape the recommendation:

1. **Layer multiple anchors.** OTS + dual TSAs + (optionally) Rekor v2 means the simultaneous failure of any one layer does not break verification of historical entries.
2. **Format stability over vendor stability.** OTS, RFC 3161 TimeStampToken (CMS), and JCS-canonicalized JWS are all formats whose parsers will continue to exist regardless of the original maintainers; Bitcoin and Trillian-Tessera tile logs are similarly format-stable.
3. **Self-contained evidence.** Each chain entry is verifiable from its bytes plus the public keys it references; no calls to a vendor API are needed to *re-verify* a stamp once final.
4. **Crypto-agility is mandatory, not optional.** Algorithm identifiers in every signed object; dual signing during the PQC transition; explicit deprecation-window planning aligned with NIST IR 8547's 2035 deadline.
5. **Plain-text JSONL is the moat.** Even if the entire Crosswalker plugin disappears, the `.audit/chain.jsonl` is human-readable, parsed by `jq`, and verifiable with 30 lines of any language. Standards (RFC 3161, Bitcoin, Ed25519, SHA-256) outlast tooling.

Ship the simple thing as default; make the heavy things configurable; tell the truth about what each tier guarantees; plan the post-quantum migration on a calendar that beats NIST's 2035 deadline by at least three years. The git stack is an excellent maximalist option but it must not be the *only* option, because the moment Crosswalker requires a CLI is the moment it stops being a viable tool for the consultants, federal users, and locked-down enterprises that comprise its highest-value audience.

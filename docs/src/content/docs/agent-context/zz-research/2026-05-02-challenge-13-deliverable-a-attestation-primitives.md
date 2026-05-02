---
title: "Ch 13 deliverable: Modern attestation primitives (Sigstore, in-toto, SLSA, OpenTimestamps, VCs)"
description: "Fresh-agent research deliverable for Challenge 13. Confirms Challenge 08's TSA + WORM + cert-export Tier 1 stack as the floor; adds in-toto attestations as mandatory schema for review/approval evidence; offers Sigstore/gitsign as configurable alternative to GPG/SSH (path to SLSA L3); skips OpenTimestamps for Tier 1; drops AWS QLDB (dead 2025-07-31); skips Azure Confidential Ledger and immudb as Tier 1 primitives; tracks W3C Verifiable Credentials for v2.0+."
tags: [research, deliverable, audit, attestation, sigstore, in-toto, slsa, compliance]
date: 2026-05-02
sidebar:
  label: "Ch 13: Attestation primitives"
  order: -20260502.9
---

:::tip[Origin and lifecycle]
Fresh-agent research deliverable produced 2026-05-02 in response to [Challenge 13: Modern attestation primitives](/crosswalker/agent-context/zz-challenges/13-modern-attestation-primitives/). Summarized in [05-02 §2.6](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#26-challenge-13--modern-attestation-primitives-confirms-ch-08-adds-in-toto). Critical read in [05-02 §3.6](/crosswalker/agent-context/zz-log/2026-05-02-direction-research-wave-and-roadmap-reshape/#36-critical-read-of-ch-13). Preserved verbatim; not edited after publication.
:::

# Challenge 13: Modern Attestation Primitives — Research Report

## Executive Summary

Challenge 13 evaluates whether modern attestation primitives (Sigstore, in-toto, SLSA, OpenTimestamps, W3C Verifiable Credentials, and managed/open-source ledgers) should **replace, complement, or be skipped** relative to the Tier 1 stack recommended in Challenge 08 (RFC 3161 trusted timestamps + S3 Object Lock WORM mirror + FRE 902(13) qualified-person certification report).

The short answer: **Challenge 08's Tier 1 stack should be confirmed as the floor, not superseded.** The modern primitives split cleanly into three groups:

- **Complement (high value, layer in):** Sigstore/gitsign (as an upgrade path for commit-signing UX), in-toto attestations (as the canonical schema for review/approval evidence), and SLSA as the framing model for Crosswalker's evidence pipeline.
- **Skip (for now):** OpenTimestamps as a Tier 1 element (latency, auditor unfamiliarity); AWS QLDB (dead as of 2025-07-31); Azure Confidential Ledger and immudb as primary primitives (vendor-/operations-locked, low marginal value over git+TSA+WORM).
- **Optional / future-facing:** W3C Verifiable Credentials for the qualified-person artifact (track for v2.0+; not auditor-ready today).

Crosswalker should keep the Challenge 08 Tier 1 stack verbatim, **add in-toto attestations as the mandatory schema for review/approval evidence**, and **offer Sigstore/gitsign as a configuration-level alternative to GPG/SSH** for commit signing. SLSA Build Level 1 is achievable for v0.1, Level 2 for v1.0, and Level 3 should be the v2.0 target.

---

## 1. Sigstore vs RFC 3161 + GPG/SSH for Per-Commit Signing and Timestamping

### Architecture and trust model

Sigstore is a Linux Foundation / OpenSSF project comprised of three coordinated services: **Fulcio**, a free code-signing CA that issues short-lived (~10-minute) X.509 certificates whose subject is bound to an OIDC identity (Google, GitHub, Microsoft, or a custom issuer); **Rekor**, an append-only Merkle-tree transparency log that records (signature, certificate) pairs so verification remains possible after the certificate expires; and **Cosign/gitsign**, the client tooling. **gitsign** is the git-specific client: it uses gitsign as a `gpg.format=x509` program, performs an OIDC flow on each commit, gets an ephemeral Fulcio cert, signs the commit as PKCS7, and uploads a HashedRekord (SHA-256 of the commit + cert) to Rekor.

The contrast with the Challenge 08 baseline (developer-managed GPG or SSH keys plus an RFC 3161 TSA receipt per commit) is sharp:

| Dimension | Sigstore/gitsign | GPG/SSH + RFC 3161 |
|---|---|---|
| Identity binding | Federated OIDC (Google/GitHub/Microsoft) → OIDC claim baked into ephemeral cert | Self-issued long-lived key; identity is whatever metadata the holder chose |
| Key lifetime | ~10 minutes (ephemeral) | Years; revocation via WoT, keyserver, or GitHub upload |
| Rotation | Automatic per-commit | Manual; frequent source of "Unverified" commits |
| Audit verifiability | Rekor public log queryable by anyone, by entry index, UUID, hash, or identity | TSA receipt held locally; verification requires the receipt + CA cert chain |
| External-party attribute (SAS 142 ¶A22) | Yes — Rekor + Fulcio operated by OpenSSF/Linux Foundation as separate parties from the signer | Yes — TSA is a third-party CA; arguably stronger pedigree (PKIX, ETSI EN 319 421/422) |
| Air-gap support | Possible but requires self-hosted Fulcio + Rekor + Dex + TUF root + CTLog (full Sigstore "scaffold" stack) | RFC 3161 is trivially self-hostable; freeTSA, DigiCert, Sectigo public TSAs work offline-after-issuance |
| GitHub UX | Commits show as "Unverified" — Sigstore CA root is not in GitHub's trust root; verification requires `gitsign verify` or Rekor lookup | Commits show "Verified" if the GPG/SSH key is registered with GitHub |
| Maturity (May 2026) | gitsign v0.13.x stable; Rekor v1 in maintenance, Rekor v2 actively developed on Trillian-Tessera (tile-based log); rekor-monitor reaching production readiness via OpenSSF | RFC 3161 is from 2001 with broad PKIX tooling; well understood by every PKI auditor |

### Auditor familiarity

RFC 3161 is universally understood by Big 4 IT-audit teams and PKIX-trained ISO 27001 assessors; it appears in ETSI standards explicitly cited by SOC 2 and SAS 142 guidance. Sigstore is well-known in the software supply-chain audit community (it underpins SLSA L2+ for many CNCF projects and is referenced in NIST SP 800-204D), but it is **not yet** a default vocabulary item in financial-statement audits. The "external party" test under SAS 142 ¶A22 is satisfied by both, but the management-bias defense is easier to articulate with a CA-issued TSA receipt than with a Rekor entry, because the audit reader does not need to be re-educated on transparency-log mechanics.

A particularly important fact: **GitHub still does not display Sigstore-signed commits as "Verified"** because Sigstore's intermediate is not in GitHub's trust root and standard X.509 verification fails after the 10-minute cert expires. An auditor pulling up the repository in a browser will see every commit marked "Unverified," which is a significant adverse optic regardless of how rigorous the underlying Rekor verification actually is.

### Decision: **Complement, not replace**

- **Keep RFC 3161 as the Tier 1 mandatory layer.** Its auditor familiarity, sub-second latency, offline verifiability, and direct alignment with ETSI / eIDAS qualified-timestamp regimes make it the safer floor.
- **Offer Sigstore/gitsign as a first-class configurable alternative for commit signing**, with Crosswalker documentation marking it as appropriate when (a) the team already uses GitHub/Google/Microsoft SSO, (b) the vault is non-air-gapped, and (c) the auditor is supply-chain-fluent.
- **Run Rekor lookups as part of Crosswalker's verification CLI** when gitsign is configured — exposing the Rekor log index in the Audit Authenticity Report turns the public transparency log into a corroborating "external party" alongside the TSA, which is *strictly stronger* evidence than either alone.
- **Do not rely on Sigstore in air-gapped or classified deployments unless a private Sigstore stack (Fulcio + Rekor + Dex + TUF + CTLog, all deployable via the sigstore-helm-charts scaffold) is operated locally.** This is a non-trivial operational burden — at least four services and a TUF root rotation cadence.

---

## 2. in-toto Attestations vs Simple Commit Messages for the Review/Approval Chain

### What in-toto provides

in-toto (CNCF graduated project, in-toto.io) defines a signed-statement format with three layers: an **envelope** (DSSE), a **statement** binding one or more **subjects** (artifact digests) to a **predicate** (typed metadata), and the predicate types themselves. The Linux-Foundation-maintained predicate library includes SLSA Provenance v1, SPDX, CycloneDX, test-result, vulnerability, link, and SCAI (Supply Chain Attribute Integrity), and the framework explicitly supports custom predicate types declared by URI. SLSA's Provenance is in fact defined as an in-toto predicate; SLSA does not invent its own envelope.

Practical adoption outside pure software builds is already real: Lockheed Martin's open-source SBOM utility kit Hoppr, SolarWinds' post-SUNBURST infrastructure, TestifySec's Witness framework, and Archivista (an attestation store) all consume in-toto. The CNCF GUAC project ingests in-toto attestations as its primary input. This validates that **the format is general enough for a compliance-evidence pipeline**, not just for build artifacts.

### Cost model for Crosswalker

For each evidence-link state change, generating an in-toto attestation costs roughly one extra ~2-4 KB JSON file plus a DSSE signature. The two viable storage strategies are:

1. **In-band**: Commit the `.attestations/<sha>.intoto.jsonl` alongside the evidence-link change. This keeps the attestation cryptographically bound to the same git history and TSA-timestamped commit, gives natural offline verifiability, and lets the Audit Authenticity Report PDF cite a deterministic file path.
2. **Out-of-band**: Push to a Rekor instance (public or private) with the attestation referenced by Rekor log index. Use this only when transparency-log corroboration is desired.

Crosswalker should default to **in-band**, with Rekor cross-publication as a configurable add-on for installations that have already adopted gitsign.

### Custom predicate for Crosswalker

A purpose-built predicate type — e.g. `https://crosswalker.dev/predicates/evidence-review/v1` — should encode at minimum: the evidence-link ID, the source-control identity of the reviewer (and approver, if separate), a structured review verdict (`approved`/`rejected`/`requested_changes`), the reviewed-artifact digest (SHA-256 of the markdown vault note plus any binary attachments), the underlying control(s) being attested to, and a reference to the parent attestation if this is a re-review. This **replaces the role of the commit-message free text** as the authoritative audit-chain record while leaving the commit message in place as a human-readable summary.

### Backward compatibility with the FRE 902(13) report

in-toto attestations and the Challenge 08 PDF Audit Authenticity Report are **complementary, not substitutive**. The PDF remains the human-readable artifact handed to the auditor (it will continue to exist for the next decade in every audit working-paper system); the in-toto attestations become the machine-verifiable evidence that the PDF *summarizes*. The PDF's contents become "X commits, Y review attestations, all signed and timestamped, full chain available at `.attestations/`" — and the qualified-person signing the PDF is now signing a quantitatively verifiable claim instead of a narrative.

### Decision: **Complement (mandatory)**

- **Add in-toto attestations to the Tier 1 minimum bar** as the canonical schema for the review/approval chain.
- **Define one Crosswalker custom predicate type** (`evidence-review/v1`) and one re-use of SLSA Provenance v1 (for the actual evidence-link generation step, where the "build" is the markdown render or crosswalk computation).
- **Ship a `crosswalker attest verify <evidence-link>` command** that walks the attestation graph and outputs a clean audit chain.
- **Auditor familiarity**: medium-low today, rising. Most ISO 27001 assessors will not have heard of it; SOC 2 auditors at supply-chain-aware firms (Big 4 cyber practices, A-LIGN, Schellman) increasingly will. The PDF report mitigates the unfamiliarity gap.

---

## 3. SLSA Level 1–4 Mapping for Crosswalker

### What SLSA v1.0 actually requires

SLSA v1.0 (May 2023) restructured the spec into **tracks**; only the Build track is normative in v1.0, with Source and Dependency tracks deferred. Within the Build track:

- **L0** — no requirements; baseline.
- **L1** — Provenance exists and is generated by a consistent (scripted) build process; provenance is available to consumers; it is not required to be signed and is "trivial to bypass or forge."
- **L2** — Provenance is generated by a hosted build platform (not a developer laptop); it is digitally signed; the signing key is controlled by the build platform, not user-defined steps.
- **L3** — Hardened build: build steps run in ephemeral, isolated environments; signing material is non-extractable from user-defined steps; provenance is "non-falsifiable" by anyone other than the build platform itself.
- **L4** — Removed from v1.0 (was in v0.1 draft as two-party review of all changes); listed as a future direction. Treat v1.0 L3 as the current ceiling.

### Mapping Crosswalker's evidence pipeline

Crosswalker's "build" is the act of producing or modifying an evidence-link (a markdown note in the Obsidian vault that asserts a crosswalk relationship between a control framework citation and an evidence artifact). The "artifact" is the rendered evidence-link plus any included file digests.

| SLSA Level | Crosswalker Status | What's needed |
|---|---|---|
| **L1** | **Achievable for v0.1** | Document the evidence-link generation process; emit a provenance file alongside each commit recording who edited what and what tooling versions were involved. Already implicit in git + commit signing; just needs an in-toto SLSA-Provenance predicate emitted on commit. |
| **L2** | **Target for v1.0** | The provenance generation must move into a "hosted" context — i.e., a Crosswalker-managed pre-commit hook or CI workflow signs the provenance with a key the user can't forge. Combined with TSA + WORM + signed in-toto, this is essentially Challenge 08's Tier 1 + a CI-side signer. |
| **L3** | **Target for v2.0+** | Requires that the Crosswalker provenance generator run in an isolated environment where the user cannot exfiltrate the signing key. This implies **either (a) a managed Crosswalker SaaS-style "verifier service," or (b) gitsign with Fulcio**, because Fulcio's ephemeral keys are by construction inaccessible to user steps. This is the cleanest architectural argument for adopting gitsign-with-OIDC at v2.0. |
| **L4** | **Not pursued** | Not in v1.0 spec. The two-party review pattern is independently valuable for high-stakes vaults and can be implemented via in-toto evidence-review predicates that require two signed approvals before a vault gate is satisfied — *without* claiming a SLSA L4 designation. |

### Precedents for SLSA on non-build pipelines

There is no formal precedent for applying SLSA to compliance evidence chains; SLSA's specification language is build-centric ("artifact," "builder," "package"). However, the SLSA FAQ explicitly notes that the Build-track requirements should be imposed on "the transitive closure of the systems which are responsible for informing the provenance generated," and the in-toto Provenance predicate is general. Treating the evidence-link as the artifact and the Crosswalker render-and-commit step as the build is a defensible analogical extension. Crosswalker should publish a short "SLSA Mapping for Compliance Evidence" document that makes this analogy explicit so an auditor sees the framing rather than having to derive it.

### Recommended targets

- **Crosswalker v0.1**: SLSA Build L1 (provenance exists, scripted, available).
- **Crosswalker v1.0**: SLSA Build L2 (hosted/CI provenance generator + signed) — this aligns with the moment Crosswalker introduces a managed signer.
- **Crosswalker v2.0+**: SLSA Build L3 via gitsign + Fulcio + Rekor, with a documented air-gap variant via private Sigstore deployment.

---

## 4. OpenTimestamps vs RFC 3161 TSAs

### What OpenTimestamps is

OpenTimestamps (opentimestamps.org) batches submitted file hashes into a Merkle tree, then publishes the root in a Bitcoin transaction. The resulting `.ots` proof file contains the path from the original hash through the tree to the on-chain transaction, plus the block height. Anyone with a Bitcoin node (or an SPV verifier) can independently confirm that the hash existed before the block was mined.

### Trade-offs against RFC 3161

| Dimension | RFC 3161 TSA | OpenTimestamps |
|---|---|---|
| Trust anchor | CA's root cert + CA's continued operation/archive | Bitcoin proof-of-work history (no operator required to remain alive) |
| Latency to confirmation | Sub-second | Hours-to-days; the `.ots` file is initially "pending" until calendar servers commit and Bitcoin mines a block |
| Cost | Free (freeTSA, DigiCert, Sectigo public) or modest paid SLA | Free |
| Verification tooling | PKIX libraries on every platform | Bitcoin-aware tooling required (`ots verify`, OTS browser drag-drop) |
| Permanence | As long as the CA archive plus root crypto remain valid | Effectively permanent; survives operator failure |
| US legal posture | Long-established under FRE 901 / 902 | Recognized under FRE 901/902(14) as self-authenticating digital records by hash; specific blockchain-evidence statutes in Vermont (12 V.S.A. § 1913) and Arizona (A.R.S. § 44-7061) |
| EU legal posture | eIDAS qualified electronic time stamp (QETS) — explicit Article 42 recognition | eIDAS 2.0 (Regulation 2024/1183) Article 45l qualified electronic ledgers — *new* recognition with legal presumption of authenticity for blockchain-anchored records |
| Auditor familiarity | High (Big 4, ISO 27001, SOC 2 all comfortable) | Low to medium; growing in IP/legal-tech contexts (Bernstein.io, Hangzhou Internet Court 2018, Italian D.L. 135/2018) but not yet routine in financial-statement audits |
| Recognition under SAS 142 ¶A22 | Clearly an external party (the CA) | Bitcoin miners are arguably an "external party" but the auditor must be educated on PoW; not a battle worth fighting in a financial-statement audit |

### The case for OpenTimestamps

The genuine argument for OTS is **permanence beyond CA lifetime**. An RFC 3161 receipt from a CA that ceases operations or rotates its root in 15 years becomes harder to verify; a Bitcoin-anchored proof remains independently verifiable as long as Bitcoin block headers are preserved. For a SOX §802 seven-year retention horizon, RFC 3161 is more than adequate. For evidence chains intended to survive 25–50-year retention (medical-device approval files, environmental-liability records, certain government contracts), OTS becomes attractive *as a complement* — both timestamps cost the same (zero), so layering them is essentially free.

### Decision: **Skip from Tier 1; offer as Tier 2 optional complement**

- **Do not replace RFC 3161 with OpenTimestamps.** The latency penalty (a `.ots` file in "pending" state until the next Bitcoin block) is incompatible with a per-commit timestamp UX, and the auditor education burden is higher than the marginal benefit for normal compliance retention horizons.
- **Offer OTS as a second, parallel timestamp layer for high-retention vaults.** Crosswalker's `crosswalker timestamp` command can write both a `.tsr` (RFC 3161) and a `.ots` file to `.attestations/`, with the `.ots` upgraded from pending to confirmed asynchronously by a follow-up job.
- **Auditor familiarity rating: Low** for financial-statement audit; **Medium-rising** for legal evidence and EU eIDAS-2 contexts.
- **Document the EU eIDAS 2 / FRE 902(14) framing** in Crosswalker's compliance docs so users in regulated jurisdictions can cite the regulatory recognition explicitly.

---

## 5. W3C Verifiable Credentials for Qualified-Person Certification

### Standards posture (May 2026)

W3C Verifiable Credentials Data Model **v2.0 became a W3C Recommendation on May 15, 2025**, alongside six co-published specifications (Data Integrity 1.0, EdDSA Cryptosuites, ECDSA Cryptosuites, Securing VCs using JOSE/COSE, Controlled Identifiers 1.0, and Bitstring Status List 1.0). This is the standards-stable moment that procurement and compliance teams typically wait for. The model is three-party (issuer / holder / verifier), supports DID-based identifiers for cross-organization federation, and supports both JOSE/COSE and Data Integrity (LD-Proof) signature paths.

### As an artifact for the qualified-person certification

The Challenge 08 deliverable is a PDF Audit Authenticity Report signed by a qualified person attesting to the chain integrity. A VC-based equivalent would be a JSON document:

```
issuer = qualified person (DID or X.509-bound entity)
credentialSubject = {repo digest, attestation graph root, claim text}
proof = JOSE/COSE signature
```

| Dimension | PDF certification report | W3C VC 2.0 |
|---|---|---|
| Auditor familiarity | Universal | Low — VC is principally known to digital-identity / EUDI-wallet specialists |
| Standards alignment | None — PDF is a UI choice | W3C Recommendation; aligned with eIDAS 2.0 EUDI Wallet ecosystem |
| Verification tooling | Adobe / open-source PDF readers | walt.id, Veramo, sphereon, vidos, etc. — fragmented, not in standard audit toolchains |
| Cross-vault federation | Manual cross-references | DID-based identity composes naturally |
| Regulatory guidance for FRE 902(13) qualified-person | None directly endorses VCs; FRE 902(13) is technology-neutral | None either; VCs are gaining EU regulatory traction (eIDAS 2) but no US compliance-audit precedent |

### Decision: **Skip for v0.1–v1.0; track for v2.0+**

- **Do not replace the PDF certification report with a VC** for any near-term Crosswalker version. PDF is universal; VC tooling is not in any Big 4 audit working-paper system today, and no SOC 2 / ISO 27001 / SOX guidance currently endorses or even discusses VCs.
- **Implement VC issuance as an additive option** at v2.0+, ideally when the user base includes EU customers governed by eIDAS 2.0 EUDI-Wallet workflows. The same qualified-person signing can produce both a PDF *and* a co-signed VC bound to the same evidence-graph digest.
- **Auditor familiarity rating: Very low today; medium in 3–5 years** if EU adoption drives US audit-firm tooling investment.
- The strongest argument for VC eventually is **cross-vault federation**: a multi-entity GRC organization that wants one qualified-person attestation to cover the same control across multiple Obsidian vaults benefits from DID-bound subject references in a way that PDFs cannot replicate.

---

## 6. Managed/Open-Source Ledgers: AWS QLDB, Azure Confidential Ledger, immudb

### AWS QLDB — **dead, drop entirely**

AWS announced QLDB's deprecation in mid-2024 with **end of support on July 31, 2025**. New customer signups closed; existing data was scheduled to be deleted; AWS recommended migration to Aurora PostgreSQL (which loses the cryptographic-ledger guarantees QLDB was sold for). The Terraform AWS provider is removing `aws_qldb_ledger` resources in v7. **Drop QLDB from any Crosswalker recommendation immediately and do not include it in documentation except as a cautionary note about vendor lock-in for compliance-critical infrastructure.**

### Azure Confidential Ledger — viable but high-cost, narrow benefit

Azure Confidential Ledger (ACL) is GA, runs on Intel SGX-attested enclaves with the Microsoft Confidential Consortium Framework, exposes a REST API + SDKs (.NET, Java, Python, JavaScript), holds SOC 2 Type 2 and ISO 27001 certifications, and as of March 1, 2025 charges roughly **$3/day per ledger instance** (approximately $90/month/instance) plus storage. Each transaction returns a cryptographic receipt; the ledger is replicated across availability zones with Merkle-tree-backed integrity.

Compared to git + RFC 3161 TSA + S3 Object Lock WORM mirror, ACL adds:
- **Hardware-attested execution** (SGX) — a property git+TSA+WORM does not provide.
- **Tamper-evident receipts per transaction** — partially redundant with TSA receipts.
- **Vendor-managed availability** (3-node consensus, AZ replication) — useful but achievable with multi-region S3.

It does **not** add anything that closes a gap in SAS 142 / PCAOB AS 1105 / ISO 27001 A.8.15 / SOX §802. The "external party" attribute is satisfied by the TSA. Auditors are not yet asking for SGX attestations on evidence ledgers in financial-statement audits.

**Decision: Skip as a Tier 1 element; document as a Tier 3 option for Azure-native customers** who already have ACL spending and want a redundant integrity store. ~$3/day/ledger is meaningful for small teams.

### immudb — viable as a self-hosted Tier 3 mirror

immudb (codenotary/immudb, BSL 1.1 license) is an open-source, embeddable, append-only database with cryptographic Merkle-tree proofs of inclusion and consistency. It supports K/V, SQL, and document models; runs on every common OS; and has documented post-QLDB migration patterns (a French trade-finance bank case study is the canonical reference). It can ingest commit hashes or in-toto attestation digests and provide independent inclusion proofs to clients without requiring trust in the database operator.

Compared to git + TSA + WORM:
- **Adds**: client-verifiable inclusion proofs, query history, performance (millions of TPS) for high-volume telemetry.
- **Does not add**: a third-party trust anchor — immudb run by the same organization is not an external party under SAS 142 ¶A22 unless operated by a separate legal entity.

**Decision: Skip as a Tier 1 element; document as an optional Tier 3 mirror** for installations with high-volume evidence-link change rates (>>1,000/day) where git's per-commit overhead becomes costly, or for organizations replacing a former QLDB deployment.

### Net assessment for ledger primitives

The git + RFC 3161 TSA + S3 Object Lock WORM stack from Challenge 08 already provides: append-only history, third-party-anchored timestamping, and immutable off-site storage. Layering a managed ledger or immudb adds operational complexity and cost without closing any specific compliance gap that an auditor would flag. **Auditor familiarity ratings**: ACL — Low (Microsoft-only specialist knowledge); immudb — Very Low. None of the three should be marketed to Crosswalker's primary audit audience.

---

## 7. Resolution to Challenge 08

Challenge 08's recommendation — augment bare git with (1) RFC 3161 trusted timestamps, (2) S3 Object Lock WORM mirror, and (3) FRE 902(13) qualified-person certification report — is **confirmed and refined**, not superseded.

### Revised Tier 1 minimum bar

| # | Layer | Status vs Challenge 08 |
|---|---|---|
| 1 | **Per-commit signing** (GPG/SSH default; gitsign/Sigstore as configurable alternative) | Refined — Challenge 08 implied keys; Challenge 13 makes the alternative explicit and adds Sigstore as a path to SLSA L3 |
| 2 | **RFC 3161 trusted timestamp** on every commit | Confirmed — auditor-familiarity floor |
| 3 | **S3 Object Lock WORM mirror** of repo + attestations | Confirmed |
| 4 | **FRE 902(13) qualified-person certification PDF** | Confirmed |
| 5 | **in-toto attestation per evidence-link review/approval** (custom Crosswalker `evidence-review/v1` predicate, plus SLSA Provenance v1 for the commit's "build") | **NEW — added by Challenge 13** |

### Tier 2 (recommended, not minimum)

- Rekor cross-publication of attestation hashes when gitsign is in use.
- OpenTimestamps as a parallel `.ots` proof for high-retention vaults (>10 years).

### Tier 3 (optional)

- Azure Confidential Ledger or immudb as a redundant integrity store for high-volume installations.
- W3C Verifiable Credentials co-issuance of the qualified-person certification (track for v2.0+).

### Net architectural impact

The architectural footprint changes only modestly. Crosswalker gains:
- One JSON file (`.attestations/<sha>.intoto.jsonl`) per evidence-link state change.
- A documented custom predicate type.
- A `crosswalker attest verify` CLI that walks the attestation graph.
- Optional `gitsign` configuration mode.
- An optional `--ots` flag on `crosswalker timestamp`.

No new daemons, no required cloud accounts, no new auditor-education burden as long as the PDF certification report continues to summarize the evidence chain in human-readable form.

---

## 8. Auditor-Familiarity Summary

| Primitive | Familiarity (Big 4 / SOC 2 / ISO 27001 today) | Trajectory |
|---|---|---|
| RFC 3161 TSA | High | Stable |
| S3 Object Lock WORM | High | Stable |
| GPG/SSH commit signing | Medium-High | Stable |
| FRE 902(13) PDF certification | High | Stable |
| Sigstore / gitsign | Medium (high in cyber-supply-chain practices, low elsewhere) | Rising |
| Rekor transparency log | Medium-Low | Rising |
| in-toto attestations | Medium-Low | Rising |
| SLSA framework references | Medium | Rising sharply |
| OpenTimestamps | Low (financial audit); Medium (legal evidence) | Rising in EU under eIDAS 2 |
| Azure Confidential Ledger | Low | Flat |
| immudb | Very Low | Flat |
| W3C Verifiable Credentials | Very Low (audit context) | Rising 2027+ |
| AWS QLDB | N/A — discontinued | Dead |

---

## 9. Long-Term Strategic Outlook

Three trends will reshape GRC tooling expectations between 2026 and 2030:

1. **SLSA and in-toto are crossing from supply-chain into general-purpose evidence frameworks.** The OpenSSF investment in rekor-monitor productionization (December 2025), Rekor v2 on Trillian-Tessera, and the broadening predicate library (SCAI, test-result, vulnerability) all suggest that within 2–3 years SOC 2 and ISO 27001 practitioners will start citing in-toto as an expected mechanism for review-and-approval evidence. Adopting it now positions Crosswalker ahead of the curve and gives early-adopting auditors a vocabulary they already know.

2. **eIDAS 2.0 (Regulation 2024/1183) reshapes EU evidentiary expectations.** Article 45l's recognition of qualified electronic ledgers — explicitly including blockchain — gives OpenTimestamps and similar primitives a regulatory presumption EU auditors will be required to honor. This is the single strongest reason to make OTS optional-but-supported, even if it is not Tier 1. Likewise, the EUDI Wallet rollout is mainstreaming W3C VCs, and US Big 4 firms will follow because their EU practices need the tooling.

3. **Vendor-managed ledger services are an unstable substrate for compliance infrastructure.** AWS QLDB's deprecation — with one year of notice and no equivalent migration target preserving cryptographic-ledger semantics — is a teaching case. Crosswalker's choice to anchor on git + RFC 3161 + S3 WORM (open formats with multiple suppliers) is correct precisely because it is *substitutable* if any single supplier exits the market. Sigstore, in-toto, and OpenTimestamps share that substitutability property; ACL and (commercially) immudb do not. The strategic principle: **compliance infrastructure should be built on standards or open-source projects with multiple implementations, not on managed cloud services that can be deprecated.**

The directional recommendation is therefore consistent: **harden the open-format core (git + TSA + WORM + in-toto + qualified-person PDF) as the durable Tier 1, treat Sigstore and OpenTimestamps as open-format upgrade paths, and treat managed ledgers and VCs as opt-in features for organizations whose contexts (Azure-native, EU-regulated, multi-vault federation) make them worth the marginal complexity.**

---

## 10. Concrete Decisions

| Primitive | Decision | Rationale (one line) |
|---|---|---|
| Sigstore / gitsign / Rekor | **Complement (configurable alternative)** | Cleanest path to SLSA L3; non-air-gap only; offer alongside GPG/SSH |
| in-toto attestations | **Complement (mandatory, Tier 1)** | Replaces commit messages as authoritative review-chain record; backward-compatible with PDF |
| SLSA targeting | **Adopt as framing model** | L1 for v0.1, L2 for v1.0, L3 for v2.0+ via gitsign |
| OpenTimestamps | **Skip Tier 1; offer Tier 2** | Latency + auditor unfamiliarity outweigh marginal benefit for 7-year retention |
| W3C Verifiable Credentials | **Skip near-term; track for v2.0+** | Standards-stable since May 2025 but not in audit toolchains; viable for cross-vault federation later |
| AWS QLDB | **Drop** | Service ended 2025-07-31 |
| Azure Confidential Ledger | **Skip Tier 1; document as Tier 3** | High cost, narrow incremental benefit, vendor-locked |
| immudb | **Skip Tier 1; document as Tier 3** | Useful for high-volume scale but not auditor-recognized as external party |
| Challenge 08 stack | **Confirm + extend with in-toto** | Auditor-familiar floor; in-toto is the missing review/approval schema |

The result is a Tier 1 stack that **adds exactly one primitive (in-toto) to Challenge 08**, makes one alternative explicit (Sigstore/gitsign for organizations ready for it), and refuses to chase primitives whose auditor-recognition is not yet established. Crosswalker's compliance posture is strengthened where it matters — the review/approval evidence chain — without paying operational complexity to chase primitives whose value is years from being legible to its target audit audience.

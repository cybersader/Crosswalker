---
title: "Ch 19 deliverable: Over-engineering stress test — radically simplify with narrow tiered escape hatch"
description: "Fresh-agent adversarial research deliverable for Challenge 19. Bottom line: the architecture has lost the property of 'simpler thing becomes default because it's more adoptable.' Five concrete arguments: (1) competitive landscape (Hyperproof/Drata/Vanta hide crosswalk complexity from users; Excel + SharePoint baseline is what Crosswalker actually competes with); (2) SSSOM has zero GRC adoption (~50K downloads/month all biomedical); STRM (NIST IR 8477) + OSCAL is what NIST OLIR / SCF actually use; (3) audit trail wildly over-specified vs FRE 902(13)/(14) requirements (hash + qualified-person cert + git is the legal floor); (4) 5 MB three-engine WASM bundle is 10–50× Obsidian plugin median; SCF (1,400 controls × 261 frameworks) ships as one Excel file; recursive CTEs handle 3-hop closures over 10K edges in single-digit ms; (5) concrete 'simple default' proposal: markdown + YAML frontmatter (STRM) + git + signed releases + Dataview + STRM-TSV/OSCAL export, under 500 KB. Layered engines as separate opt-in companion plugins."
tags: [research, deliverable, architecture, simplicity, adoption, grc, adversarial, foundation]
date: 2026-05-02
sidebar:
  label: "Ch 19: Over-engineering stress test"
  order: -20260502.14
---

:::tip[Origin and lifecycle]
Fresh-agent adversarial research deliverable produced 2026-05-02 in response to [Challenge 19: Over-engineering stress test](/crosswalker/agent-context/zz-challenges/19-overengineering-stress-test/). Synthesized in the [v0.1 stack-pivot log](/crosswalker/agent-context/zz-log/2026-05-02-v0-1-initial-stack-pivot/), which **adopts the deliverable's architectural direction with calibrations**: v0.1 ships Tier 1 + Tier 2 sqlite-wasm sidecar bundled (~1.2 MB total, 4× under the 5 MB stack the deliverable attacks); SSSOM stays as internal validation envelope while STRM-shaped TSV becomes the user-authored wire format (hybrid resolution); Junction Notes from Ch 07 are kept (deliverable's framing of them as 'complexity' was a misread of the de-entanglement architectural property). Preserved verbatim with minor formatting fixes for paste artifacts.
:::

# Crosswalker Architecture Stress Test: An Adversarial Assessment

## Verdict (Stated Up Front)

**Radically simplify, with a narrow tiered escape hatch.** The research strongly suggests that Crosswalker, as currently architected, has lost the property of being "the simpler thing that becomes the default because it's more adoptable." The actual problem domain — mapping a few hundred to a few thousand control-to-control relationships between 2–10 frameworks, with provenance an auditor will accept — is comfortably solved by a TSV/CSV file in a folder, a SQLite database (or no database at all), git history, and signed commits. Every additional layer you have stacked above that line either (a) duplicates what commercial GRC tools already hide entirely from the user, (b) imports a standard (SSSOM) that has zero traction in your target ecosystem, or (c) hardens against a litigation/audit threat model that GRC auditors and FRE 902 do not actually require.

Crosswalker's competitive moat is *plaintext markdown in Obsidian*. Each architectural layer that moves the system away from "open the vault, edit a file, commit" is a moat that is being filled in by your own hand. The honest framing is: ship a 100KB plugin that reads CSV/TSV crosswalks and renders them as wikilinks; treat DuckDB-WASM, Oxigraph, Nemo, the 4-tier audit trail, and the IPLD bundles as *research artifacts* or *opt-in advanced modules* that 2% of users will ever touch.

This report walks through the evidence.

---

## 1. Competitive Landscape: What the Market Actually Demands

Crosswalker's competitors do not expose crosswalk complexity to users. They hide it behind a pre-built catalog and a "click to add framework" button.

**Hyperproof** ships a feature called "Crosswalks and Jumpstart" ([Hyperproof](https://hyperproof.io/resource/crosswalks-between-compliance-frameworks/)) that maps frameworks against the **Secure Controls Framework (SCF)** as the underlying meta-framework. The user does not author mappings — Hyperproof has done the mapping work and presents a "percentage overlap" between an existing program and a new one (e.g., "you are X% of the way to ISO 27701 given your SOC 2 + ISO 27001"). The user-facing complexity is reading a percentage and reusing controls. Hyperproof reviewers consistently cite *long ramp time and configuration overhead* as the platform's downside — and that is for a product whose mapping logic is fully hidden from end users.

**Drata** markets "control cross-mapping made always-on" as a key talking point against Vanta. The user experience is: connect integrations, pick frameworks, get a dashboard showing overlapping controls. There is no user-facing mapping editor; the platform claims that a single control can be mapped to satisfy multiple frameworks, and that mapping is done by Drata's content team.

**Vanta** offers cross-mapping across SOC 2, ISO 27001, HITRUST, GDPR, HIPAA, PCI DSS, multiple NIST families, FedRAMP readiness, ISO 27017/27018, TISAX, and CMMC. Again, the mappings are pre-curated. Vanta positions itself for enterprises managing "complex compliance needs" ([Vanta](https://www.vanta.com/resources/vanta-vs-drata-vs-auditboard)) but the *user* never authors a crosswalk.

**AuditBoard (now Optro)** likewise provides a content library and "supports cross-mapping" but is described in third-party comparisons as more "manual or point-in-time" than Vanta.

**Excel + SharePoint + PDF folder baseline** is alive and well. Multiple GRC vendor blogs (Resolver, UnderDefense, Cyber Sierra, Symbiant, Daitasoft) explicitly describe the *standard* GRC operating model as: shared Excel workbook, color-coded by risk level, updated quarterly before audits, with one or two people who understand it. Industry surveys consistently cite Excel as the *most widely used GRC software* even when expensive platforms are in place — the platforms become "systems of record in name only" while the team maintains "secondary spreadsheets just for this audit." ([UnderDefense](https://underdefense.com/blog/grc-tools-vs-compliance-platforms-drop-that-excel-table/)) The SCF itself — the canonical industry crosswalk artifact, mapped to 200+ laws/frameworks — ships as Excel/CSV (or NIST OSCAL JSON) and is registered on ComplianceForge as the primary distribution format. The community STRM Template that practitioners use to *contribute* new mappings to SCF is also an Excel spreadsheet.

**Implication for Crosswalker:** the bar to clear is not "outperform Hyperproof's chain-of-custody architecture." The bar is "be at least as adoptable as a shared Excel file, and at least as inspectable as the SCF spreadsheet." A markdown-and-wikilinks Obsidian vault already clears that bar. A multi-WASM-engine layered tier with an SSSOM-canonical data model and four-tier audit trail does not — it raises the floor of what you must understand before you can read a crosswalk.

---

## 2. SSSOM Ecosystem Reality

SSSOM is a mature standard within the OBO Foundry / biomedical ontology community, with a published paper in *Database* (Oxford, 2022) ([PyPI](https://pypi.org/project/sssom-schema/), [NIH](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9216545/)) and an active sssom-py library. PyPI download stats show roughly **40–55K downloads per month** for `sssom` (the operational library) and a healthy release cadence; the GitHub repo has ~194 stars and ~10 contributors. ClickPy reports ~694K total downloads ([ClickPy](https://clickpy.clickhouse.com/dashboard/sssom)) over the project's lifetime.

That sounds healthy until you contextualize it: pandas does ~250M downloads/month. SSSOM is a niche standard with ~10× the user base of the typical bioinformatics PhD student's pet repo, and roughly 1/5000th the user base of the libraries actually inside pandas-using GRC tooling.

**Critically, the search returned zero evidence of SSSOM adoption in GRC, cybersecurity, or compliance.** Every co-author of the SSSOM paper is from a biomedical/ontology institution (Berkeley Lab BBOP, EMBL-EBI, Monarch Initiative, INDRA Lab at Harvard, OBO Foundry). The "use cases" cited in the spec are all biomedical: gene IDs, disease ontologies, environmental exposure ontologies.

What the GRC and cybersecurity ecosystem *has* converged on is something different and arguably better-fit:

- **NIST IR 8477 — Set Theory Relationship Mapping (STRM).** Defines five relationship types (Equal To, Subset Of, Superset Of, Intersects With, No Relationship) and a numeric strength score (1–10). This is what NIST itself uses in the OLIR program, what the Secure Controls Framework uses for all 200+ of its mappings, and what NIST endorses as "the US Government's gold standard for crosswalk mapping."
- **NIST IR 8278A r1 — OLIR submission format.** Concept crosswalks, set-theory relationship mappings, and supportive relationship mappings, distributed via an Excel template.
- **OSCAL.** XML/JSON/YAML formats for control catalogs, profiles, system security plans, and assessments. Adopted by FedRAMP, US DoD, Singapore CCC, Australia ISM, and slowly emerging in private sector. Thoughtworks Technology Radar (assessed) explicitly notes that "OSCAL has not yet been widely adopted outside the public sector and its ecosystem is still maturing."

**Conclusion:** Crosswalker has chosen SSSOM as canonical and added STRM as a secondary predicate set. This inverts the priority order that the actual GRC ecosystem has. The closest thing to an authoritative crosswalk format in the GRC world is "STRM in an OLIR-shaped Excel file, optionally exported as OSCAL JSON." SSSOM gives you *theoretical* future interoperability with biomedical ontology tooling that no GRC user will ever touch, at the cost of explaining a non-native data model to every adopter. This is aspirational future-proofing, not a real ecosystem benefit. If Crosswalker were designed around STRM-with-OSCAL-export, with optional SSSOM emission for academic users, it would meet the actual community where it is.

---

## 3. Audit Trail Requirements: What Auditors Actually Want

The 4-tier audit trail with Ed25519, OpenTimestamps, RFC 3161 TSA, Sigstore Rekor v2, eIDAS QTSA, S3 Object Lock, FRE 902(13) PDF generation, in-toto, W3C VC Data Integrity, FROST threshold signatures, PIV, and PQC dual-sign is a wildly over-specified threat model. Here is what the actual requirements look like:

**SOC 2 (the most common framework):** Auditors evaluate whether the entity has documented encryption policies aligned with industry standards and can prove they are followed. SOC 2 is explicitly *risk-based and not prescriptive* — it does not mandate specific algorithms, key lengths, or chain-of-custody mechanisms. The artifacts auditors actually request are: encryption policies, architecture diagrams, key management procedures, configuration evidence from cloud services, monitoring/audit logs, and screenshots from monitoring tools showing controls operating effectively over the audit period (Type II is 6–12 months). No SOC 2 control language demands cryptographic timestamping of mapping artifacts. The "chain of custody" articles that surface in search results (ISMS.online, AccountableHQ, Copla) are vendor marketing — they describe best-practice hashing and timestamping for *evidence that travels through the compliance pipeline*, not for the *control mappings themselves*.

**ISO 27001:** Annex A has 93 controls; the standard requires an ISMS with documented procedures, but again, no specific cryptographic protocol is mandated for the mapping artifacts.

**FRE 902(13) and 902(14):** This is where the over-engineering becomes most visible. FRE 902(13) covers records *generated by an electronic process or system* (e.g., system registry reports, GPS logs from a phone). FRE 902(14) covers data *copied from an electronic device* (e.g., a forensic image of a hard drive) authenticated via "a process of digital identification" — which the Advisory Committee notes is generally **a hash value comparison**. Both rules require a **certification by a qualified person** that meets the procedural requirements of FRE 902(11) — which itself is the business records foundation: record made at or near the time, kept in the regular course of business, making the record was a regular practice. The actual legal floor is *git commit + SHA-256 hash + a signed declaration from a qualified person*. RFC 3161 TSA, Sigstore Rekor, eIDAS QTSA, FROST threshold signatures, and PQC dual-sign are not on the list of things FRE 902(13)/(14) requires, mentions, or anticipates. They are not *wrong*, they are simply orthogonal — they harden against a threat model (state-level adversaries forging timestamps in court) that has, to my best research, never come up in litigation over a control mapping artifact.

**FedRAMP/FISMA:** OSCAL is the relevant artifact. The audit floor is documented assessment plans, system security plans, and POA&Ms in machine-readable form. Cryptographic provenance of the *mapping* itself is not a stated requirement.

**ISO/IEC 27037 (digital evidence):** Defines four core processes — identification, collection, acquisition, preservation — and requires a cryptographic hash + qualified timestamp + transfer documentation + the principles of auditability, repeatability, justifiability. This is the closest the literature gets to what Crosswalker is hardening against. None of it requires Sigstore, OTS, eIDAS QTSA, in-toto, or W3C VC Data Integrity to be satisfied. It requires a hash and a signature.

**Practitioner reality:** A typical Reddit/forum search across compliance forums (referenced in vendor blogs) shows the *actual* compliance floor is "screenshots with metadata, dated PDFs, and policy documents." The RiskImmune SOC 2 screenshot guide and similar resources are the level that auditors complain about — not the level they demand more rigor than. The litigation risk profile of "we mapped NIST CSF to ISO 27001" being interrogated in court is, as far as the public record reveals, vanishingly small. Compliance failures are litigated, but the chain-of-custody questions are typically about *evidence* (logs, screenshots, customer data) not *control crosswalks*.

**Implication:** A single-tier audit trail consisting of (a) git history with signed commits, (b) optional Ed25519 detached signatures on TSV/CSV exports for external sharing, and (c) timestamped releases when a mapping set is "published" — exceeds what SOC 2, ISO 27001, FedRAMP, and FRE 902(13)/(14) actually demand. Each of the other 12+ optional components is a *nice* defense-in-depth feature for a customer that explicitly asks for it. None should be in the default install. Bundling 15 of them into the architecture is complexity tax with no commensurate audit benefit.

---

## 4. Obsidian Plugin Ecosystem Complexity Norms

The Obsidian plugin ecosystem has thousands of plugins ([Obsidian](https://obsidian.md/plugins)) on the official directory. Bundle size norms cluster well under 1 MB; popular plugins like Dataview, Templater, and Excalidraw are typically a few hundred KB. There is no published Obsidian community guideline cap, but the community submission forum has explicit threads (e.g., "Question regarding dependency limits and bundle size for Community Plugin submission") ([Obsidian](https://forum.obsidian.md/t/question-regarding-dependency-limits-and-bundle-size-for-community-plugin-submission/111972)) expressing concern about plugins with 40+ dependencies including React 19 and the Unified/Remark ecosystem — indicating that the community treats heavyweight bundles as exceptional.

**Specific to Crosswalker's stack:**

- **DuckDB-WASM gzipped is ~1.8 MB** by official measurement; the underlying `duckdb-eh.wasm` is 6.4 MB uncompressed (and over 18 MB in some misconfigured CDN scenarios). The browser client is single-threaded by default and has a bounded memory footprint (commonly cited near 2 GB hard limit on 32-bit WASM).
- **Oxigraph-WASM** adds another similar-magnitude footprint.
- **Nemo-WASM** is a Datalog reasoner; its WASM build is non-trivial and Nemo itself is relatively new and rare in production.

A combined ~5 MB compressed bundle would put Crosswalker among the largest plugins in the Obsidian ecosystem and would be approximately **10–50× larger than the median plugin**.

Loading three independent query engines in one Obsidian process risks memory pressure on lower-spec machines (Obsidian users include large numbers of MacBook Air and lower-tier Windows users), and Obsidian itself runs on Electron — which means each plugin shares the renderer process with the editor, the graph view, and any other plugins.

There is precedent for WASM in Obsidian plugins (e.g., the MotherDuck/DuckDB-on-Obsidian RAG project at ssp.sh demonstrates DuckDB-WASM client integration), but those are pioneering, single-engine experiments — not three-engine layered stacks. I found no Obsidian plugin in the wild that bundles DuckDB-WASM + Oxigraph-WASM + Nemo-WASM together.

**Implication:** A 5 MB three-engine Obsidian plugin is feasible but unusual. The Tier 2-Lite alternate (sqlite-wasm + sqlite-vec + simple-graph + recursive CTE, ~600 KB) is much closer to ecosystem norms. For the actual problem (a few thousand mapping rows, predicate filtering, transitive closure of small graphs), even SQLite-WASM is more than enough. Recursive CTEs handle A→B→C transitive crosswalks without breaking a sweat at any plausible mapping volume.

---

## 5. Local-First / Plaintext-First GRC Alternatives

The local-first plaintext-first GRC space exists but is small and has informative lessons:

- **OSCAL tooling (NIST):** XML/JSON/YAML, machine-readable, designed exactly for the use case Crosswalker addresses. Adoption "still maturing" outside public sector per Thoughtworks. Complexity: high schemas, but one engine (any JSON/YAML parser) is enough to consume them.
- **Secure Controls Framework (SCF):** Distributed as Excel/CSV and OSCAL JSON. ([Securecontrolsframework](https://securecontrolsframework.com/free-content)) The "Living Control Set" concept and STRM methodology are well-developed. The shipping artifact is *a spreadsheet*. Auditor-facing.
- **ComplianceAsCode (formerly SCAP Security Guide):** Generates SCAP content for hardening Linux/RHEL. Different problem space (control implementation, not mapping) but lessons translate: it emits XCCDF/OVAL XML and is consumed by `oscap`. Complexity is in the build pipeline, not the data model.
- **OpenControl / Comply (now archived/GoComply):** Was the canonical "compliance-as-code" project. Its data model was simple YAML. It fizzled in adoption — a cautionary tale about over-investing in machine-readable formats before an ecosystem of consumers exists.
- **SimpleRisk:** Open-source GRC that explicitly markets itself with "The problem with many GRC tools is that they overreach their mission and become incredibly complex. So complex that they require dedicated resources to manage them." ([Simplerisk](https://www.simplerisk.com/)) This positioning is the same hill Crosswalker is trying to claim.
- **GRC Playbook (ComplianceForge):** Excel-based GRC toolkit, sold as a "smart Excel template." ([Grcplaybook](https://grcplaybook.com)) Demonstrates that the market for "compliance in a spreadsheet" is real and revenue-generating.
- **PolicyForge / SimpleRisk / various CMMC-focused tools:** Lightweight, opinionated, single-purpose.

The Obsidian-as-PKM-for-GRC use case appears to be largely greenfield. There is one interesting precedent — Obsidian-note-taking-assistant (ssp.sh) — showing DuckDB-WASM integration with Obsidian works, but it's RAG/search, not GRC. There is no existing "GRC in Obsidian" tool of any prominence, which is both opportunity and warning: it may be that GRC professionals don't use PKMs for this work because the workflow is fundamentally collaborative and audit-facing, not personal.

**Implication:** The lesson from OSCAL ("still maturing") and OpenControl (didn't reach escape velocity) is that *machine-readable formats only succeed when consumers exist*. Crosswalker's data model commitments (SSSOM, STRM, Junction-Notes, StewardshipProfile, meta-schema lifecycle, LinkML, IPLD) front-load semantic richness in advance of any consumer demand. The successful tools in this space (SCF, SimpleRisk, GRC Playbook) shipped a useful spreadsheet first and added structure later.

---

## 6. User Persona Adoption Barriers

**GRC consultants / vCISOs:** The tooling stack is overwhelmingly Excel + SharePoint + PowerPoint + occasional GRC platform when a client mandates one. Tech-savviness varies enormously; many are former auditors with strong domain knowledge but limited dev tooling familiarity. Asking such users to adopt Obsidian is a meaningful but plausible ask. Asking them to also reason about layered query engines, IPLD bundles, and PQC dual-signing is not.

**Enterprise IT constraints:** Locked-down environments often disallow installing Electron-based desktop apps without IT approval. Obsidian itself requires a per-seat commercial license in commercial settings — the user-facing forum thread "Commercial License in an Air-Gapped Environment" confirms that air-gapped use is supported but requires explicit license activation/transfer ([Obsidian](https://forum.obsidian.md/t/commercial-license-in-an-air-gapped-environment/78469)), which is a friction point. In strict environments (DoD SIPRNet/JWICS, IL5/IL6, financial trading floors) ([Datacendia](https://datacendia.com/learn/air-gapped-ai-deployment/)), Electron apps with WASM modules face significant scrutiny — not because they are banned, but because every additional bundled binary is another component to vet. A 5 MB three-engine plugin will get more attention from a vetting team than a 100 KB plugin that reads markdown.

**Federal/air-gapped:** Obsidian works in air-gapped environments, but plugin updates require manual sideload. Crosswalker's update cadence and dependency surface area become the operations team's problem. A plugin that depends on three WASM modules with their own update pipelines is materially harder to maintain in a sealed environment than a plugin that depends only on the Obsidian API.

**Multi-tenant consulting firms:** They share artifacts via SharePoint, OneDrive, Google Drive, or client GRC platforms. Git-based collaboration is rare outside firms with strong devops culture. A plaintext markdown vault in a git repo is a *real* improvement over SharePoint hell — but only if it stays simple.

**Implication:** The user persona adoption envelope is narrower than the architecture seems to assume. The *floor* is "competent Excel user who has now adopted Obsidian." The *ceiling* is "GRC engineer at a CMMC-focused firm who is comfortable with git, OSCAL, and command-line tools." Anything above that ceiling is not a Crosswalker user. The Tier 3 layered stack (Apache Jena Fuseki, oxigraph-server, DuckDB-on-server, TerminusDB, Apache AGE, Postgres+JSONB+CTE) is targeting a population that, if it existed, would already be on Hyperproof or building its own thing.

---

## 7. Framework Crosswalk Complexity Reality

The numbers anchor the data-volume question:

- **NIST CSF 2.0:** 6 Functions, ~22 Categories, ~106 Subcategories.
- **NIST SP 800-53 Rev 5:** ~1,000 controls and control enhancements.
- **CIS Controls v8:** 18 controls / ~153 safeguards.
- **SOC 2 Trust Services Criteria:** ~64 common criteria + privacy/availability/confidentiality categories.
- **CMMC 2.0:** ~110 practices (Level 2).
- **SCF:** ~1,400 controls mapped to 200+ frameworks. The full SCF spreadsheet ([Securecontrolsframework](https://securecontrolsframework.com/free-content)), including all mappings, is shipped as a single Excel file.

A typical organization juggles 2–5 frameworks simultaneously (e.g., SOC 2 + ISO 27001 + HIPAA, or CMMC + NIST 800-171 + FedRAMP). Larger enterprises stretch to 8–10. Per published industry overlap studies, ISO 27001 certification covers ~83% of NIST CSF requirements; NIST CSF compliance covers ~61% of ISO 27001. The number of pairwise control-to-control mapping rows for any specific framework pair is typically **in the low hundreds to low thousands**.

The SCF crosswalk dataset — 1,400 controls × 200+ frameworks with STRM metadata — is on the order of **a few hundred thousand rows** at most, and SCF distributes the entire thing as an Excel workbook that opens on a laptop. Excel's row limit is ~1M.

**Transitivity:** Most real-world crosswalk questions are 2-hop ("If I'm SOC 2 compliant, how close am I to ISO 27001?"). A few are 3-hop ("Given a control implementation that satisfies NIST 800-53 AC-2, what does it imply for ISO 27001 and CMMC?"). 4+ hop transitive closures are rare and usually a sign that someone is trying to extract too much signal from low-confidence chains. SQLite recursive CTEs handle 3-hop closures over ~10,000 mapping edges in single-digit milliseconds.

**Implication:** The data volume that would stress-test a SQLite-based approach for crosswalk querying is *one to two orders of magnitude larger than any plausible Crosswalker user dataset*. DuckDB-WASM is overkill. Oxigraph (SPARQL) is overkill unless someone has a specific RDF interop need. Nemo (Datalog) is overkill twice over. The recursive-CTE / sqlite-vec / simple-graph "Tier 2-Lite" stack is itself probably 5–10× more capability than the typical user needs — and that's the *lite* tier.

The honest sizing: a single CSV of mappings in TSV-with-front-matter format (i.e., SSSOM-shaped TSV but parsed naively), loaded into JavaScript Maps and a small adjacency list in memory, would handle 99% of real workloads with sub-millisecond queries.

---

## 8. Synthesis: Where the Architecture Stops Being Adoptable

Pulling the threads together, the architecture has crossed the adoption boundary in five distinct places:

1. **The data model.** SSSOM is canonical for biomedical ontologies; STRM/OSCAL is canonical for GRC. The right primary commitment is STRM with OSCAL export; SSSOM should be optional emission for academic/biomedical interop.
2. **The query stack.** A 5 MB three-engine WASM bundle (DuckDB + Oxigraph + Nemo) is unprecedented in the Obsidian ecosystem and overkill for the data volume. Default should be either no engine (plain JS over markdown front-matter) or sqlite-wasm at most. The full Tier 2 stack should be an opt-in "power user" plugin that 95% of users never install.
3. **The audit trail.** FRE 902(13)/(14) requires hash + qualified-person certification. SOC 2/ISO 27001 require documented evidence with normal business-records foundations. Default audit trail should be: git commits + Ed25519-signed releases for shared mapping bundles. Everything else (OTS, RFC 3161, Sigstore Rekor, eIDAS QTSA, in-toto, W3C VC, FROST, PIV, PQC) should be optional and clearly labeled "for organizations with specific regulatory threats that demand it."
4. **The Tier 3 server stack.** Apache Jena Fuseki, oxigraph-server, DuckDB-on-server, TerminusDB, Apache AGE, and Postgres+JSONB+CTE are six distinct deployment paths. If users actually need a server, *one* default (probably Postgres+JSONB+CTE because it is the most boring and the most operable) is more honest than offering six. Six options is not "flexibility"; it is "we could not decide."
5. **Optional-component sprawl.** 15+ optional components in the audit trail alone, plus IPLD bundles, plus meta-schema lifecycle, plus Junction-Notes, plus StewardshipProfile, plus LinkML, plus the Tier 3 stack matrix. Each individual component may be defensible; the cumulative cognitive load is not. The user does not need to read 15 concept docs to use a crosswalk.

---

## 9. What the Simple Default Should Look Like

The version of Crosswalker that *would* become the default because it's adoptable looks something like:

- **Storage:** Markdown files with YAML front-matter holding STRM relationship metadata. One file per mapping or one file per control — author's choice.
- **Index:** Plain in-memory JS Map built at vault-load time. Optional sqlite-wasm escape hatch at ~600 KB if a vault gets very large.
- **Query:** Native Obsidian search + Dataview-style queries on front-matter. Optional recursive CTE over sqlite if transitive closure is needed.
- **Provenance:** Git commits, signed by GPG/SSH/Sigstore-cosign at the user's discretion. A default `git log --follow` view per mapping is enough for 99% of audits.
- **Export:** STRM-shaped TSV (which is also valid SSSOM TSV — they are not in conflict, just prioritized differently) plus OSCAL JSON profile export. Excel-friendly CSV with a header that maps to NIST IR 8278A r1's OLIR template fields, so a user can submit to NIST OLIR directly from a Crosswalker vault.
- **Bundle:** Under 500 KB compressed. No bundled WASM engines in the default plugin.

Everything else — DuckDB-WASM analytics workspace, Oxigraph SPARQL endpoint, Nemo Datalog reasoning, IPLD content-addressed bundles, OpenTimestamps, Sigstore Rekor, FROST threshold signing, the Tier 3 server matrix — should live in **separate plugins** that announce themselves as advanced and that depend on the core plugin's data contract.

This architecture preserves the property the user is worried about losing: *the simpler thing becomes the default because it's more adoptable*. Every advanced feature that exists today can still exist; it just needs to be unbundled so that the first-time user experience is "install the plugin, open the vault, see crosswalks rendered as wikilinks" — not "read 15 architecture docs to understand which tier I am on."

---

## A Note on the Three-Verdict Framing

The question allowed three verdicts: (1) complexity justified, (2) radically simplify, (3) tiered complexity with simple default. Strictly speaking, (3) is also defensible — *if* the simple default is genuinely simple and the tiers are genuinely opt-in. But the architecture as described in the prompt does not have that property today; it has a "Tier 2-Lite alternate" that is itself ~600 KB with four moving parts, and a "Tier 2 layered stack" that bundles three WASM engines as the primary path. That is not "tiered with a simple default" — that is "two complex defaults plus a server matrix."

So the practical answer is: aim for verdict (3), but the design work to get there requires actually demoting Tier 2 and Tier 3 from architecture-tier features to optional companion-plugin features. Everything I have learned about the GRC market, the Obsidian ecosystem, the SSSOM ecosystem, audit-trail requirements, and crosswalk data volumes points the same direction: **the moat is plaintext markdown in Obsidian with STRM-flavored front-matter, signed in git. Defend that moat. Treat everything else as research.**

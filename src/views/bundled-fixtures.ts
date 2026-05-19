/**
 * bundled-fixtures.ts — Phase 6.3
 *
 * Realistic SSSOM crosswalk fixtures bundled inline so the dev "Import
 * test fixture" command can populate a vault with one click — no manual
 * file copying. Same TSV content as `tools/fixtures/realistic/*.sssom.tsv`.
 *
 * Kept small (~6KB total) — adds minimal bundle weight in exchange for
 * the user-testability win.
 */

export interface BundledFixture {
	id: string;
	displayName: string;
	subjectOntology: string;
	objectOntology: string;
	rowCount: number;
	tsv: string;
}

export const BUNDLED_FIXTURES: BundledFixture[] = [
	{
		id: 'iso27001-to-soc2',
		displayName: 'ISO 27001:2022 → SOC 2 Trust Services Criteria',
		subjectOntology: 'iso27001',
		objectOntology: 'soc2',
		rowCount: 10,
		tsv: `# curie_map:
#   iso27001: "https://www.iso.org/standard/27001/"
#   soc2: "https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/sorhome.html"
#   skos: "http://www.w3.org/2004/02/skos/core#"
#   semapv: "https://w3id.org/semapv/vocab/"
# mapping_set_id: "https://example.org/crosswalks/iso27001-to-soc2/v0.1"
# mapping_set_title: "ISO 27001:2022 → SOC 2 (Trust Services Criteria) — control alignment (synthetic test fixture)"
# mapping_provider: "Aggregate of public ISO ↔ SOC 2 crosswalks (structural model only)"
# mapping_date: "2026-05-15"
# license: "https://creativecommons.org/publicdomain/zero/1.0/"
# subject_source: "iso27001"
# object_source: "soc2"
subject_id\tpredicate_id\tobject_id\tmatch_type\tconfidence\tmapping_justification\tsubject_label\tobject_label
iso27001:A.5.1\tskos:closeMatch\tsoc2:CC1.1\tclose\t0.90\tsemapv:ManualMappingCuration\tPolicies for information security\tCOSO Principle 1 — Integrity and Ethical Values
iso27001:A.5.2\tskos:closeMatch\tsoc2:CC1.2\tclose\t0.85\tsemapv:ManualMappingCuration\tInformation security roles and responsibilities\tCOSO Principle 2 — Board Oversight
iso27001:A.5.15\tskos:exactMatch\tsoc2:CC6.1\texact\t0.95\tsemapv:ManualMappingCuration\tAccess control\tLogical Access Security Software
iso27001:A.5.16\tskos:closeMatch\tsoc2:CC6.2\tclose\t0.85\tsemapv:ManualMappingCuration\tIdentity management\tNew User Authorization
iso27001:A.5.17\tskos:relatedMatch\tsoc2:CC6.2\tbroad\t0.70\tsemapv:ManualMappingCuration\tAuthentication information\tNew User Authorization
iso27001:A.5.18\tskos:exactMatch\tsoc2:CC6.1\texact\t0.90\tsemapv:ManualMappingCuration\tAccess rights\tLogical Access Security Software
iso27001:A.5.24\tskos:closeMatch\tsoc2:CC7.1\tclose\t0.80\tsemapv:ManualMappingCuration\tInformation security incident management planning and preparation\tDetection and Monitoring of Security Events
iso27001:A.5.25\tskos:closeMatch\tsoc2:CC7.1\tclose\t0.85\tsemapv:ManualMappingCuration\tAssessment and decision on information security events\tDetection and Monitoring of Security Events
iso27001:A.8.14\tskos:relatedMatch\tsoc2:A1.1\tbroad\t0.75\tsemapv:ManualMappingCuration\tRedundancy of information processing facilities\tAvailability — Capacity Management
iso27001:A.7.5\tskos:relatedMatch\tsoc2:A1.2\tbroad\t0.70\tsemapv:ManualMappingCuration\tProtecting against physical and environmental threats\tAvailability — Environmental Protections
`,
	},
	{
		id: 'nist-csf-to-mitre-attack',
		displayName: 'NIST CSF 2.0 → MITRE ATT&CK Enterprise (defensive coverage)',
		subjectOntology: 'nist-csf',
		objectOntology: 'mitre-attack',
		rowCount: 13,
		tsv: `# curie_map:
#   nist-csf: "https://csrc.nist.gov/projects/cybersecurity-framework/csf/"
#   mitre-attack: "https://attack.mitre.org/techniques/"
#   skos: "http://www.w3.org/2004/02/skos/core#"
#   semapv: "https://w3id.org/semapv/vocab/"
# mapping_set_id: "https://example.org/crosswalks/nist-csf-to-mitre-attack/v0.1"
# mapping_set_title: "NIST CSF 2.0 → MITRE ATT&CK Enterprise — defensive coverage mapping (synthetic test fixture)"
# mapping_provider: "MITRE Mappings Explorer (structural model only)"
# mapping_date: "2026-05-15"
# license: "https://creativecommons.org/publicdomain/zero/1.0/"
# subject_source: "nist-csf"
# object_source: "mitre-attack"
subject_id\tpredicate_id\tobject_id\tmatch_type\tconfidence\tmapping_justification\tsubject_label\tobject_label
nist-csf:PR.AA-01\tskos:relatedMatch\tmitre-attack:T1078\tbroad\t0.75\tsemapv:ManualMappingCuration\tIdentities and credentials for authorized users are managed\tValid Accounts
nist-csf:PR.AA-02\tskos:closeMatch\tmitre-attack:T1078.001\tclose\t0.85\tsemapv:ManualMappingCuration\tIdentities are proofed and bound to credentials based on the context of interactions\tDefault Accounts
nist-csf:PR.AA-03\tskos:closeMatch\tmitre-attack:T1078.002\tclose\t0.85\tsemapv:ManualMappingCuration\tUsers, services, and hardware are authenticated\tDomain Accounts
nist-csf:PR.AA-05\tskos:relatedMatch\tmitre-attack:T1098\tbroad\t0.75\tsemapv:ManualMappingCuration\tAccess permissions are managed\tAccount Manipulation
nist-csf:DE.CM-01\tskos:closeMatch\tmitre-attack:T1003\tclose\t0.80\tsemapv:ManualMappingCuration\tNetworks and network services are monitored\tOS Credential Dumping
nist-csf:DE.CM-03\tskos:closeMatch\tmitre-attack:T1078\tclose\t0.80\tsemapv:ManualMappingCuration\tPersonnel activity and technology usage are monitored\tValid Accounts
nist-csf:DE.CM-09\tskos:relatedMatch\tmitre-attack:T1543\tbroad\t0.70\tsemapv:ManualMappingCuration\tComputing hardware and software, runtime environments, and their data are monitored\tCreate or Modify System Process
nist-csf:DE.AE-02\tskos:closeMatch\tmitre-attack:T1547\tclose\t0.85\tsemapv:ManualMappingCuration\tPotentially adverse events are analyzed\tBoot or Logon Autostart Execution
nist-csf:DE.AE-03\tskos:relatedMatch\tmitre-attack:T1546\tbroad\t0.75\tsemapv:ManualMappingCuration\tInformation is correlated from multiple sources\tEvent Triggered Execution
nist-csf:PR.PS-01\tskos:closeMatch\tmitre-attack:T1136\tclose\t0.80\tsemapv:ManualMappingCuration\tConfiguration management practices are established\tCreate Account
nist-csf:PR.PS-04\tskos:closeMatch\tmitre-attack:T1543.003\tclose\t0.85\tsemapv:ManualMappingCuration\tLog records are generated and made available for continuous monitoring\tWindows Service
nist-csf:PR.IR-01\tskos:relatedMatch\tmitre-attack:T1505\tbroad\t0.70\tsemapv:ManualMappingCuration\tNetworks and environments are protected from unauthorized logical access\tServer Software Component
nist-csf:PR.IR-03\tskos:relatedMatch\tmitre-attack:T1133\tbroad\t0.70\tsemapv:ManualMappingCuration\tMechanisms are implemented to achieve resilience requirements\tExternal Remote Services
`,
	},
];

---
curie: "nist-mini:AU-3"
title: Content of Audit Records
aliases:
  - AU-3
tags:
  - framework/nist-mini/au
family: AU
family_name: Audit and Accountability
control_id: AU-3
_crosswalker:
  spec_version: "https://crosswalker.dev/spec/tier1.schema.json"
  source_ref:
    file: tools/fixtures/synthetic/nist-mini.csv
    curie: "nist-mini:_"
    source_hash: sha256-380a762cd51be31c9f5d71ef8725a7863d3d07055a54e22dc5be3776088eac8a
  produced_at: "2026-05-04T00:00:00.000Z"
  producer:
    kind: external-cli
    name: tools/generate-fixtures.ts
    version: 0.1.0
  import_set:
    id: iset-a0f1e2
    scheme: endpoint-v1
  recipe:
    id: nist-mini-fixture-flat
    hash: (synthetic — no real recipe)
---
# Content of Audit Records

## Description

Ensure that audit records contain information that establishes what type of event occurred, when the event occurred, where the event occurred, the source of the event, the outcome of the event, and the identity of any individuals or subjects associated with the event.

## Context

- Family: AU — Audit and Accountability

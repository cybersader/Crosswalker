---
curie: "nist-mini:AU-2"
title: Event Logging
aliases:
  - AU-2
tags:
  - framework/nist-mini/au
family: AU
family_name: Audit and Accountability
control_id: AU-2
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
<!-- crosswalker:body:start v=1 -->
# Event Logging

## Description

Identify the types of events that the system is capable of logging in support of the audit function.

## Context

- Family: AU — Audit and Accountability
<!-- crosswalker:body:end -->

---
curie: "nist-mini:AC-2"
title: Account Management
aliases:
  - AC-2
tags:
  - framework/nist-mini/ac
family: AC
family_name: Access Control
control_id: AC-2
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
  recipe:
    id: nist-mini-fixture-flat
    hash: (synthetic — no real recipe)
---
# Account Management

## Description

Define and document the types of accounts allowed and prohibited by the system; assign account managers; require approvals for requests to create accounts; create, enable, modify, disable, and remove accounts.

## Context

- Family: AC — Access Control

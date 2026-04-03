# Crosswalker Logo Generation Prompts

Brand identity derived from "crosswalk" — the GRC term for mapping relationships between compliance frameworks. Visual language: intersecting paths forming a network/graph, compliance shield motifs, the concept of bridging between structured systems.

Subtle thematic layer: crossing paths, a bridge between worlds (structured frameworks ↔ human knowledge).

## Color Palette (matches docs brand.css)

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Background Dark | Near-black | `#0d1117` | Dark mode backgrounds |
| Surface | Dark gray | `#161a22` | Panels, surfaces |
| Accent Primary | Teal/Cyan | `#00d4aa` | Primary accent, edges, highlights |
| Accent Glow | Light teal | `#7ff5d8` | Glow effects, hover |
| Accent Deep | Dark teal | `#0a2a2a` | Accent backgrounds |
| ATT&CK Red | Soft red | `#e06c75` | Secondary accent (technique nodes) |
| Evidence Green | Soft green | `#98c379` | Tertiary accent (evidence nodes) |
| Text Light | Off-white | `#e8edf2` | Text on dark |

---

## Concept 1: Crosswalk Graph — Primary Logo Mark

The core identity: a small network graph where nodes are connected by typed edges, forming a shape that subtly suggests intersecting paths or a bridge.

### Dark Background (Primary)
```
A minimal geometric logo mark: 5-6 small circles (nodes) connected by thin lines (edges) forming an interconnected graph pattern. The nodes are arranged so the connecting lines create a subtle cross or intersection pattern at the center. Nodes are teal (#00d4aa) with slight glow. Edges are thinner, lighter teal. The overall shape is compact, roughly square proportions. One or two edges have tiny rectangular badges on them (representing edge metadata). Dark background (#0d1117). Clean flat vector style. No text. Suitable for a software product icon at 64px and 512px.
```

### Light Background
```
Same graph pattern as above — 5-6 interconnected nodes with crossing edge lines and tiny metadata badges on select edges. Nodes are dark teal (#0a6b56). Edges are medium gray (#5c636e). Clean white (#f8f9fa) background. Flat vector, no gradients. No text. The intersection/crossing pattern of the edges should be the focal point.
```

### Monochrome (Print/Favicon)
```
Same graph topology — 5-6 nodes connected by edges forming a cross/intersection pattern. All elements in a single dark color (#0d1117) on transparent background. Thin, clean strokes. Works at 16x16 favicon size — the overall shape should read as a connected cluster even at tiny sizes.
```

---

## Concept 2: Shield + Graph — GRC Identity

Combines the compliance/security shield with the knowledge graph concept.

### Dark Background
```
A minimal shield outline (rounded bottom, flat top) in teal (#00d4aa), with a small network graph pattern inside it — 4-5 nodes connected by crossing lines. The graph nodes are slightly lighter teal. The shield has a subtle glow. The overall feel is "protected knowledge network." Dark background (#0d1117). Clean flat vector. No text. Suitable as a software icon.
```

### Light Background
```
Same shield + graph concept. Shield outline in dark teal (#0a6b56) on white background. Internal graph nodes in teal, edges in gray. Clean, minimal. No gradients.
```

---

## Concept 3: Crossroads/Bridge — Abstract

More abstract: two parallel horizontal bars (representing frameworks) connected by diagonal crossing lines (crosswalks), forming an "X" or bridge pattern.

### Dark Background
```
Two horizontal parallel lines in muted gray (#3d434e) representing framework hierarchies. Between them, 3-4 diagonal connecting lines in teal (#00d4aa) cross each other, forming a bridge or crosswalk pattern. Small dots at the intersection points glow subtly. Dark background (#0d1117). Minimal, geometric, architectural. No text. The diagonal crossing lines are the hero — they represent the crosswalk mappings.
```

### Light Background
```
Same concept — two parallel horizontals with crossing diagonal connectors. Dark teal connectors on white background. Intersection dots as accent marks.
```

---

## Concept 4: Obsidian-Integrated — Diamond + Graph

For contexts where the Obsidian connection matters (plugin listings, community).

### Dark Background
```
An Obsidian-style diamond (rotated square/rhombus) in teal (#00d4aa) outline, with a small network graph pattern emerging from or contained within the diamond shape. 3-4 nodes with connecting edges extend beyond the diamond's bounds, suggesting knowledge growing beyond the container. Dark background (#0d1117). The diamond references Obsidian; the extending graph represents the knowledge graph Crosswalker creates.
```

---

## Concept 5: CW Monogram — Lettermark

For social media, favicons, and compact contexts.

### Dark Background
```
The letters "CW" intertwined with thin connecting lines between them, as if the letters are nodes in a graph. Small dots at connection points. Teal (#00d4aa) on dark (#0d1117). The connecting lines between C and W suggest the crosswalk/bridge concept. Modern geometric font weight. Clean vector.
```

### Refined CW Graph
```
Stylized "CW" where the strokes of both letters are made of thin lines and small circles (like a graph network). The C curves around several small nodes, and the W's peaks connect to nodes with short edges. Teal (#00d4aa) lines and nodes on dark (#0d1117) background. The overall effect: letters made of the same graph elements that Crosswalker creates. Minimal, tech-forward.
```

---

## Variation Modifiers

Add these to any prompt above for specific contexts:

### With Tagline
```
[base prompt] Below the icon, the text "CROSSWALKER" in a clean geometric sans-serif font, letter-spacing 0.15em, in off-white (#e8edf2). Below that in smaller text: "compliance knowledge graph" in muted gray (#5c636e).
```

### Animated (for web/docs)
```
[base prompt] The graph edges have a subtle animated dash pattern flowing along them, and the nodes have a gentle periodic pulse/glow animation. 
```

### With Framework Colors
```
[base prompt] Different nodes use different accent colors: teal (#00d4aa) for framework controls, soft red (#e06c75) for ATT&CK techniques, soft green (#98c379) for evidence. This shows the multi-domain knowledge graph concept.
```

---

## Usage Guidelines

| Context | Concept | Size |
|---------|---------|------|
| Obsidian plugin listing | Concept 4 (Diamond + Graph) | 256x256 |
| GitHub repo | Concept 1 (Crosswalk Graph) or 5 (CW Monogram) | 400x400 |
| Docs site favicon | Concept 1 (simplified) or 5 | 32x32, 192x192 |
| Social/Open Graph | Concept 1 + tagline | 1200x630 |
| Print/monochrome | Any concept, monochrome variant | Variable |

## Tools for Generation

- [ChatGPT / DALL-E](https://chat.openai.com) — best for iterative refinement
- [Midjourney](https://midjourney.com) — `--style raw` for cleaner vectors
- [Obsidian Logo Maker](https://obsidian.md/logo) — for the Obsidian-integrated variant
- [Figma](https://figma.com) — for final vector cleanup after AI generation
- SVG trace tools — convert raster to vector for final production use

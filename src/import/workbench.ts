/**
 * workbench.ts — the shape-first mapping workbench (spec 2026-07-05 §1a, mockups M0–M2b).
 *
 * One live screen, three zones, all reading and writing ONE `ImportMapping` (the
 * view-coherence law, spec §3a½/§7a):
 *   - source rail (left): file + shape chip, columns with detection badges,
 *     per-detection evidence cards, and the demoted "all columns" destinations.
 *   - mapping canvas (center): preset bar → one card per mapping (shape-card
 *     toggles + combined preview) → the per-level matrix (full control).
 *   - vault preview rail (right): live folder tree + one rendered note + the
 *     deviation banner, recomputed (debounced) on every model change anywhere.
 *
 * Every write goes through `src/import/mapping/view-model.ts` (pure, unit-tested).
 * This module is the Obsidian-facing view over that model; it holds no business
 * logic the view-model doesn't already own.
 *
 * The demoted "all columns" table (spec §3b) is the one piece kept OUTSIDE the
 * single `ImportMapping`: it is a thin frontmatter-assignment layer merged into
 * the recipe at build time, deliberately not part of the matrix's tri-state
 * coherence (documented deviation — the coherence law governs the shape mappings,
 * which is what §3a½ is about).
 */

import type { ParsedData, ColumnInfo } from '../types/config';
import { isEagerRows } from '../types/config';
import type { Detection } from './detection';
import { detectStructure } from './detection';
import type { DebugLog } from '../utils/debug';
import {
	render,
	summarizeRenderNotes,
	type Recipe,
	type RenderReport,
	type PreviewRowNotes,
	type Address,
} from '../render';
import {
	BUILT_IN_PRESETS,
	getBuiltInPreset,
	type Preset,
} from './mapping/presets';
import { instantiate } from './mapping/instantiate';
import { toRecipeRegions, type RecipeRegions } from './mapping/serialize';
import type {
	ImportMapping,
	StructureMapping,
	LevelRule,
	TailRule,
	Destination,
	DestinationPrimitive,
	LevelSource,
	LevelNaming,
	MissingPolicy,
} from './mapping/types';
import { toSourceRefs, isConstantRef } from './mapping/types';
import {
	SHAPE_CARDS,
	deriveShapeCards,
	toggleDestinationAcrossMapping,
	addDestination,
	removeDestination,
	mergeRows,
	splitRow,
	isUnmodifiedPreset,
	destKey,
	type ShapeCardId,
} from './mapping/view-model';

/** Per-column destination in the demoted "all columns" table (spec §3b). */
type ColumnDest = 'property' | 'tag' | 'body' | 'title' | 'alias' | 'link' | 'skip';

/** The subset of primitives the two-stage ⊕ menu offers, grouped by role (spec §3d). */
const ADD_MENU_GROUPS: { group: string; items: { primitive: DestinationPrimitive; label: string }[] }[] = [
	{
		group: 'Structure',
		items: [
			{ primitive: 'folder', label: 'Folder' },
			{ primitive: 'name', label: 'File name' },
			{ primitive: 'note', label: 'Its own note' },
		],
	},
	{
		group: 'Metadata',
		items: [
			{ primitive: 'property', label: 'Property' },
			{ primitive: 'tag', label: 'Tag' },
			{ primitive: 'link', label: 'Link' },
		],
	},
	{
		group: 'Content',
		items: [
			{ primitive: 'heading', label: 'Heading' },
			{ primitive: 'body', label: 'Body' },
			{ primitive: 'alias', label: 'Alias' },
		],
	},
];

/** Affordance + whisper copy for the six shape cards (mockup M2, sentence case). */
const SHAPE_CARD_COPY: Record<ShapeCardId, { icon: string; afford: string; whisper: string }> = {
	folder: { icon: '📁', afford: 'Browse down into it in the file explorer.', whisper: 'pre-coordinated hierarchy' },
	name: { icon: '📛', afford: 'Keep it flat. The id reads at a glance.', whisper: 'packed notation' },
	tag: { icon: '🏷', afford: 'Filter any combination in search and Bases.', whisper: 'faceted classification' },
	heading: { icon: '📄', afford: 'Read top to bottom, one portable outline.', whisper: 'document order' },
	link: { icon: '🔗', afford: 'Hop the graph. A note can sit under many parents.', whisper: 'polyhierarchy' },
	property: { icon: '🧩', afford: 'Group, sort, and filter by level in Bases.', whisper: 'faceted metadata' },
};

const PREVIEW_ROW_LIMIT = 20;

export interface WorkbenchOptions {
	parsedData: ParsedData;
	columnInfos: ColumnInfo[];
	outputPath: string;
	debug: DebugLog;
	defaultPresetId: string;
	/**
	 * A persisted mapping to seed the workbench with (draft resume, spec §7i).
	 * When present, it replaces the fresh preset-instantiation so shape decisions
	 * survive a close/reopen. Detections are still computed (for the evidence rail
	 * and the preset-drift chip); only the mapping is taken from here.
	 */
	initialMapping?: ImportMapping;
	/** Notified after any model change (for draft save / state mirroring). */
	onChange: () => void;
}

/**
 * The mapping workbench. Construct once per source; call `render(container)` on
 * every wizard re-render (internal state persists on the instance).
 */
export class MappingWorkbench {
	private mapping: ImportMapping;
	private detections: Detection[];
	private dismissed = new Set<string>();
	private presetId: string;
	private columnDests = new Map<string, ColumnDest>();
	private readonly columnSig: string;

	// Transient view state (persists across re-renders).
	private expanded = new Set<number>();
	private matrixOpen = new Set<number>();
	private openEvidence: string | null = null;
	private allColumnsOpen = false;
	private addMenu: { mi: number; li: number } | null = null;
	private addMenuPrimitive: DestinationPrimitive | null = null;
	private addMenuParams: Record<string, string> = {};
	private selectedNoteRow = 0;

	private container: HTMLElement | null = null;
	private rerenderTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(private opts: WorkbenchOptions) {
		this.columnSig = opts.parsedData.columns.join('|');
		this.detections = detectStructure(opts.parsedData, opts.columnInfos);
		this.presetId = getBuiltInPreset(opts.defaultPresetId) ? opts.defaultPresetId : 'browsable-framework';
		// Draft resume (spec §7i): rehydrate from the persisted mapping when present,
		// otherwise instantiate the preset over the fresh detections.
		this.mapping = opts.initialMapping ?? instantiate(this.currentPreset(), this.activeDetections());
		this.seedColumnDests();
		opts.debug.info('wizard', 'workbench-init', 'Shape workbench initialized', {
			detections: this.detections.length,
			mappings: this.mapping.mappings.length,
			preset: this.presetId,
			seededFromDraft: !!opts.initialMapping,
		});
	}

	/** Signature of the source columns — the wizard recreates the workbench when this changes. */
	columnsSignature(): string {
		return this.columnSig;
	}

	/** The shape mappings (the single coherent model). */
	getMapping(): ImportMapping {
		return this.mapping;
	}

	// =========================================================================
	// Recipe assembly (shape mappings + the demoted column layer)
	// =========================================================================

	/** The recipe regions the preview and generation consume. */
	buildFinalRegions(): RecipeRegions {
		const base = toRecipeRegions(this.mapping);
		const layout = base.layout.map((e) => ({ ...e }));
		const tags = [...(base.also_emit?.tags ?? [])];
		const aliases = [...(base.also_emit?.aliases ?? [])];
		const managed: Record<string, string> = { ...(base.also_emit?.frontmatter?.managed ?? {}) };

		for (const [col, dest] of this.columnDests) {
			if (dest === 'skip' || dest === 'body') continue;
			const key = this.keyOf(col);
			switch (dest) {
				case 'property':
					if (!(key in managed)) managed[key] = `{${col}}`;
					break;
				case 'tag':
					tags.push(`${this.slug(col)}/{${col}|tagsafe}`);
					break;
				case 'alias':
					aliases.push(`{${col}}`);
					break;
				case 'link':
					if (!(key in managed)) managed[key] = `[[{${col}}]]`;
					break;
				case 'title': {
					// The column becomes the note file name — replace the leaf file entry.
					const fileEntry = layout.find((e) => e.mechanism === 'file');
					if (fileEntry) fileEntry.template = `{${col}}.md`;
					else layout.push({ level: 'leaf', mechanism: 'file', template: `{${col}}.md` });
					break;
				}
			}
		}

		const alsoEmit: RecipeRegions['also_emit'] = {};
		if (tags.length) alsoEmit.tags = tags;
		if (aliases.length) alsoEmit.aliases = aliases;
		if (Object.keys(managed).length) alsoEmit.frontmatter = { managed };
		return tags.length || aliases.length || Object.keys(managed).length ? { layout, also_emit: alsoEmit } : { layout };
	}

	/** A full Recipe for render() / generation. */
	buildRecipe(): Recipe {
		return { recipe: 'shape-workbench', target: this.buildFinalRegions() as Recipe['target'] };
	}

	/** Columns the user routed to the note body — fed to the legacy body path at generate time. */
	getLegacyBodyMappings(): { column: string; heading: string }[] {
		const out: { column: string; heading: string }[] = [];
		for (const [col, dest] of this.columnDests) {
			if (dest === 'body') out.push({ column: col, heading: this.keyOf(col) });
		}
		return out;
	}

	/** The leaf file template (used to give generation a stable curie stem). */
	leafFileTemplate(): string | undefined {
		const entry = this.buildFinalRegions().layout.find((e) => e.mechanism === 'file');
		return entry?.template;
	}

	// =========================================================================
	// Rendering
	// =========================================================================

	render(container: HTMLElement): void {
		this.container = container;
		container.empty();
		const grid = container.createDiv({ cls: 'crosswalker-workbench' });
		this.renderSourceRail(grid.createDiv({ cls: 'crosswalker-wb-rail crosswalker-wb-source' }));
		this.renderCanvas(grid.createDiv({ cls: 'crosswalker-wb-canvas' }));
		this.renderPreviewRail(grid.createDiv({ cls: 'crosswalker-wb-rail crosswalker-wb-preview' }));
	}

	/** Schedule a full re-render; `delay` debounces text-input-driven updates (~300ms). */
	private scheduleRerender(delay = 0): void {
		if (this.rerenderTimer) clearTimeout(this.rerenderTimer);
		this.rerenderTimer = setTimeout(() => {
			this.rerenderTimer = null;
			if (this.container) this.render(this.container);
		}, delay);
	}

	/** Commit a model change: persist via onChange, then re-render. */
	private applyChange(delay = 0): void {
		this.opts.onChange();
		this.scheduleRerender(delay);
	}

	/** Replace one shape mapping and commit. */
	private updateMapping(mi: number, next: StructureMapping, delay = 0): void {
		const mappings = this.mapping.mappings.map((m, i) => (i === mi ? next : m));
		this.mapping = { ...this.mapping, mappings };
		this.applyChange(delay);
	}

	// -------------------------------------------------------------------------
	// Zone 1 — source rail
	// -------------------------------------------------------------------------

	private renderSourceRail(rail: HTMLElement): void {
		rail.createDiv({ cls: 'crosswalker-wb-eyebrow', text: 'Source' });
		const { parsedData, columnInfos } = this.opts;
		const fileLine = rail.createDiv({ cls: 'crosswalker-wb-source-file' });
		fileLine.createEl('b', { text: this.sourceLabel() });
		rail.createDiv({
			cls: 'crosswalker-wb-chip',
			text: `table · ${parsedData.rowCount.toLocaleString()} rows × ${parsedData.columns.length} columns`,
		});

		// One-line hint that the badges are inspectable (spec §7h #2).
		if (columnInfos.some((c) => this.detectionsForColumn(c.name).length > 0)) {
			rail.createDiv({ cls: 'crosswalker-wb-collist-hint', text: 'Click a badge to inspect what we detected.' });
		}

		// Column list with detection badges. The evidence card expands inline as an
		// accordion directly under the clicked column's row (spec §7h #3), so it
		// stays visually tied to the column and never shoves "All columns" down.
		const colList = rail.createDiv({ cls: 'crosswalker-wb-collist' });
		let evidenceShown = false;
		for (const col of columnInfos) {
			const dets = this.detectionsForColumn(col.name);
			const row = colList.createDiv({ cls: 'crosswalker-wb-colrow' });
			row.createSpan({ cls: 'crosswalker-wb-colname mono', text: col.name });
			const badges = row.createSpan({ cls: 'crosswalker-wb-badges' });
			for (const d of dets) {
				const key = this.detectionKey(d);
				const active = this.openEvidence === key;
				const badge = badges.createEl('button', {
					cls: 'crosswalker-wb-badge'
						+ (this.dismissed.has(key) ? ' is-dismissed' : '')
						+ (active ? ' is-active' : ''),
					attr: { title: this.badgeTitle(d), 'aria-label': this.badgeTitle(d) },
				});
				badge.createSpan({ cls: 'crosswalker-wb-badge-icon', text: this.badgeIcon(d) });
				badge.createSpan({ cls: 'crosswalker-wb-badge-label', text: this.badgeLabel(d) });
				badge.addEventListener('click', () => {
					this.openEvidence = this.openEvidence === key ? null : key;
					this.scheduleRerender();
				});
			}

			// Inline evidence, anchored under the first column that owns the open
			// detection (multi-column detections still render exactly once).
			if (this.openEvidence && !evidenceShown) {
				const openDet = dets.find((d) => this.detectionKey(d) === this.openEvidence);
				if (openDet) {
					this.renderEvidenceCard(colList, openDet);
					evidenceShown = true;
				}
			}
		}

		// Demoted "all columns" disclosure, pinned at the rail bottom.
		this.renderAllColumns(rail);
	}

	private renderEvidenceCard(parent: HTMLElement, d: Detection): void {
		const key = this.detectionKey(d);
		const card = parent.createDiv({ cls: 'crosswalker-wb-evidence' });
		card.createDiv({ cls: 'crosswalker-wb-evidence-title', text: this.evidenceTitle(d) });

		// Sample receipts.
		if ('sampleValues' in d && d.sampleValues.length) {
			const samples = card.createDiv({ cls: 'crosswalker-wb-samples mono' });
			for (const s of d.sampleValues.slice(0, 5)) samples.createDiv({ text: String(s) });
		}

		// Coverage / match rate.
		const coverage = this.evidenceCoverage(d);
		if (coverage) card.createDiv({ cls: 'crosswalker-wb-evidence-cov', text: coverage });

		// Depth histogram (CSS bars) for packed hierarchies.
		if (d.kind === 'packed-hierarchy') {
			const hist = card.createDiv({ cls: 'crosswalker-wb-hist' });
			const entries = Object.entries(d.depthHistogram).sort((a, b) => Number(a[0]) - Number(b[0]));
			const max = Math.max(1, ...entries.map(([, n]) => n));
			for (const [depth, n] of entries) {
				const col = hist.createDiv({ cls: 'crosswalker-wb-hcol' });
				const bar = col.createDiv({ cls: 'crosswalker-wb-hbar' });
				bar.style.height = `${Math.round((n / max) * 44) + 4}px`;
				col.createDiv({ cls: 'crosswalker-wb-hlabel', text: `${depth} lvl` });
				col.createDiv({ cls: 'crosswalker-wb-hcount', text: String(n) });
			}
		}

		const btns = card.createDiv({ cls: 'crosswalker-wb-evidence-btns' });
		const dismissed = this.dismissed.has(key);
		const useBtn = btns.createEl('button', { cls: 'crosswalker-wb-confirm', text: dismissed ? 'Use this' : 'In use' });
		useBtn.disabled = !dismissed;
		useBtn.addEventListener('click', () => {
			this.dismissed.delete(key);
			this.reinstantiate();
		});
		const dismissBtn = btns.createEl('button', { cls: 'crosswalker-wb-dismiss', text: 'Dismiss' });
		dismissBtn.disabled = dismissed;
		dismissBtn.addEventListener('click', () => {
			this.dismissed.add(key);
			this.reinstantiate();
		});
	}

	private renderAllColumns(rail: HTMLElement): void {
		const details = rail.createEl('details', { cls: 'crosswalker-wb-allcols' });
		if (this.allColumnsOpen) details.setAttr('open', '');
		details.addEventListener('toggle', () => {
			this.allColumnsOpen = (details as HTMLDetailsElement).open;
		});
		details.createEl('summary', { text: `All columns (${this.opts.columnInfos.length})` });
		const structural = this.structuralColumns();
		for (const col of this.opts.columnInfos) {
			const r = details.createDiv({ cls: 'crosswalker-wb-allcol-row' });
			r.createSpan({ cls: 'crosswalker-wb-colname mono', text: col.name });
			const sel = r.createEl('select', { cls: 'dropdown' });
			for (const [value, label] of [
				['property', 'Property'],
				['tag', 'Tag'],
				['body', 'Body'],
				['title', 'Title'],
				['alias', 'Alias'],
				['link', 'Link'],
				['skip', 'Skip'],
			] as const) {
				sel.createEl('option', { text: label, attr: { value } });
			}
			sel.value = this.columnDests.get(col.name) ?? (structural.has(col.name) ? 'skip' : 'property');
			sel.addEventListener('change', () => {
				this.columnDests.set(col.name, sel.value as ColumnDest);
				this.applyChange();
			});
		}
	}

	// -------------------------------------------------------------------------
	// Zone 2 — mapping canvas
	// -------------------------------------------------------------------------

	private renderCanvas(canvas: HTMLElement): void {
		canvas.createDiv({ cls: 'crosswalker-wb-eyebrow', text: 'Mappings' });

		// Preset bar.
		const presetBar = canvas.createDiv({ cls: 'crosswalker-wb-presetbar' });
		presetBar.createSpan({ text: 'Preset' });
		const presetSel = presetBar.createEl('select', { cls: 'dropdown' });
		for (const [id, preset] of Object.entries(BUILT_IN_PRESETS)) {
			presetSel.createEl('option', { text: preset.label ?? id, attr: { value: id } });
		}
		presetSel.value = this.presetId;
		presetSel.addEventListener('change', () => {
			this.presetId = presetSel.value;
			this.reinstantiate();
		});
		presetBar.createSpan({ cls: 'crosswalker-wb-preset-label', text: this.presetLabel() });

		// One card per mapping.
		if (this.mapping.mappings.length === 0) {
			canvas.createDiv({ cls: 'crosswalker-wb-empty', text: 'No structure detected yet. Use the all columns section to map fields to frontmatter.' });
		}
		this.mapping.mappings.forEach((m, mi) => this.renderMappingCard(canvas, m, mi));

		// Add a mapping by hand.
		const addRow = canvas.createDiv({ cls: 'crosswalker-wb-addmapping' });
		const addSel = addRow.createEl('select', { cls: 'dropdown' });
		addSel.createEl('option', { text: 'Add mapping from a column…', attr: { value: '' } });
		for (const col of this.opts.parsedData.columns) addSel.createEl('option', { text: col, attr: { value: col } });
		addSel.addEventListener('change', () => {
			if (!addSel.value) return;
			this.addManualMapping(addSel.value);
		});
	}

	private renderMappingCard(canvas: HTMLElement, m: StructureMapping, mi: number): void {
		const card = canvas.createDiv({ cls: 'crosswalker-wb-mapcard' });
		const head = card.createDiv({ cls: 'crosswalker-wb-mapcard-head' });
		const expanded = this.expanded.has(mi);
		const toggle = head.createEl('button', { cls: 'crosswalker-wb-mapcard-toggle', text: expanded ? '▾' : '▸' });
		toggle.addEventListener('click', () => {
			if (expanded) this.expanded.delete(mi);
			else this.expanded.add(mi);
			this.scheduleRerender();
		});
		head.createEl('b', { text: this.mappingTitle(m) });
		// Destination summary chips.
		const summary = deriveShapeCards(m);
		const chips = head.createSpan({ cls: 'crosswalker-wb-summary-chips' });
		for (const { id, label } of SHAPE_CARDS) {
			const state = summary[id];
			if (state === 'off') continue;
			chips.createSpan({
				cls: 'crosswalker-wb-chip' + (state === 'mixed' ? ' is-mixed' : ''),
				text: `${SHAPE_CARD_COPY[id].icon} ${label}${state === 'mixed' ? ' (some)' : ''}`,
			});
		}
		// Remove-mapping button.
		const rm = head.createEl('button', { cls: 'crosswalker-wb-mapcard-rm', text: '✕', attr: { title: 'Remove this mapping' } });
		rm.addEventListener('click', () => this.removeMapping(mi));

		if (!expanded) return;

		// Shape cards.
		this.renderShapeCards(card, m, mi);

		// Combined preview — one sample row through the whole mix.
		this.renderCombinedPreview(card, mi);

		// Arrange levels → the matrix.
		const arrange = card.createEl('button', {
			cls: 'crosswalker-wb-arrange',
			text: (this.matrixOpen.has(mi) ? '▾' : '▸') + ' Arrange levels (combine or drop id levels)',
		});
		arrange.addEventListener('click', () => {
			if (this.matrixOpen.has(mi)) this.matrixOpen.delete(mi);
			else this.matrixOpen.add(mi);
			this.scheduleRerender();
		});
		if (this.matrixOpen.has(mi)) this.renderMatrix(card, m, mi);
	}

	private renderShapeCards(card: HTMLElement, m: StructureMapping, mi: number): void {
		const states = deriveShapeCards(m);
		const grid = card.createDiv({ cls: 'crosswalker-wb-shapes' });
		for (const { id, label, primitive } of SHAPE_CARDS) {
			const state = states[id];
			const copy = SHAPE_CARD_COPY[id];
			const shape = grid.createDiv({ cls: 'crosswalker-wb-shape' + (state === 'on' ? ' is-on' : state === 'mixed' ? ' is-mixed' : '') });
			const top = shape.createDiv({ cls: 'crosswalker-wb-shape-top' });
			const cb = top.createEl('input', { type: 'checkbox' });
			cb.checked = state === 'on';
			cb.indeterminate = state === 'mixed';
			cb.addEventListener('change', () => {
				this.updateMapping(mi, toggleDestinationAcrossMapping(m, primitive, cb.checked));
			});
			top.createEl('span', { cls: 'crosswalker-wb-shape-title', text: `${copy.icon} ${label}` });
			shape.createDiv({ cls: 'crosswalker-wb-shape-afford', text: copy.afford });
			shape.createDiv({ cls: 'crosswalker-wb-whisper', text: `${copy.whisper} →` });
		}
	}

	private renderCombinedPreview(card: HTMLElement, mi: number): void {
		const wrap = card.createDiv({ cls: 'crosswalker-wb-combined' });
		wrap.createDiv({ cls: 'crosswalker-wb-combined-label', text: 'Your mix, on one row (rendered for real)' });
		const sample = this.firstRow();
		const pre = wrap.createEl('pre', { cls: 'crosswalker-wb-mini' });
		if (!sample) {
			pre.setText('(no rows to preview)');
			return;
		}
		try {
			const recipe: Recipe = { recipe: 'wb-mix', target: toRecipeRegions({ mappings: [this.mapping.mappings[mi]] }) as Recipe['target'] };
			const address = render(recipe, { curie: 'preview:1', scope: sample });
			pre.setText(this.describeAddress(address));
		} catch (err) {
			pre.setText(`(cannot preview: ${err instanceof Error ? err.message : String(err)})`);
		}
	}

	// -------------------------------------------------------------------------
	// The matrix (M2b)
	// -------------------------------------------------------------------------

	private renderMatrix(card: HTMLElement, m: StructureMapping, mi: number): void {
		const wrap = card.createDiv({ cls: 'crosswalker-wb-matrix-wrap' });
		const table = wrap.createEl('table', { cls: 'crosswalker-wb-matrix' });
		const thead = table.createEl('thead').createEl('tr');
		for (const h of ['Level', 'Sample', 'Lands as', 'Named', 'If missing']) thead.createEl('th', { text: h });
		const tbody = table.createEl('tbody');

		m.levels.forEach((rule, li) => this.renderMatrixRow(tbody, m, mi, rule, li));
		if (m.tail) this.renderTailRow(tbody, m, mi, m.tail);
	}

	private renderMatrixRow(tbody: HTMLElement, m: StructureMapping, mi: number, rule: LevelRule, li: number): void {
		const tr = tbody.createEl('tr');

		// Level cell — id + merge/split buttons.
		const lvl = tr.createEl('td');
		lvl.createEl('b', { text: rule.level });
		const gestures = lvl.createDiv({ cls: 'crosswalker-wb-gestures' });
		if (li < m.levels.length - 1) {
			const mergeBtn = gestures.createEl('button', { text: 'Merge ▾', attr: { title: 'Merge with the next level' } });
			mergeBtn.addEventListener('click', () => this.updateMapping(mi, mergeRows(m, li)));
		}
		if (this.isSplittable(rule.source)) {
			const splitBtn = gestures.createEl('button', { text: 'Split', attr: { title: 'Split this merged level back apart' } });
			splitBtn.addEventListener('click', () => this.updateMapping(mi, splitRow(m, li)));
		}

		// Sample cell.
		tr.createEl('td', { cls: 'mono', text: this.sampleForLevel(rule) });

		// Lands as — destination chips + ⊕.
		const lands = tr.createEl('td');
		this.renderDestinationChips(lands, m, mi, li, rule.destinations);

		// Named — naming dropdown.
		const named = tr.createEl('td');
		const nameSel = named.createEl('select', { cls: 'dropdown' });
		for (const [value, label] of [
			['part', 'The part'],
			['prefix', 'Cumulative prefix'],
			['joined', 'Joined parts'],
		] as const) {
			nameSel.createEl('option', { text: label, attr: { value } });
		}
		nameSel.value = this.namingValue(rule.naming);
		nameSel.addEventListener('change', () => {
			const next: LevelRule = { ...rule, naming: nameSel.value as LevelNaming };
			this.updateMapping(mi, this.replaceLevel(m, li, next));
		});

		// If missing — missing dropdown.
		const miss = tr.createEl('td');
		const missSel = miss.createEl('select', { cls: 'dropdown' });
		for (const [value, label] of [
			['skip', 'Skip level'],
			['fallback', 'Use fallback'],
			['error', 'Report'],
		] as const) {
			missSel.createEl('option', { text: label, attr: { value } });
		}
		missSel.value = rule.missing;
		missSel.addEventListener('change', () => {
			const next: LevelRule = { ...rule, missing: missSel.value as MissingPolicy };
			this.updateMapping(mi, this.replaceLevel(m, li, next));
		});
	}

	private renderTailRow(tbody: HTMLElement, m: StructureMapping, mi: number, tail: TailRule): void {
		const tr = tbody.createEl('tr', { cls: 'crosswalker-wb-tailrow' });
		const lvl = tr.createEl('td');
		lvl.createEl('b', { text: 'Any deeper' });
		lvl.createDiv({ cls: 'crosswalker-wb-tail-note', text: 'the tail rule' });
		tr.createEl('td', { cls: 'mono crosswalker-muted', text: '-' });
		const lands = tr.createEl('td');
		for (const d of tail.destinations) lands.createSpan({ cls: 'crosswalker-wb-chip', text: this.destChipText(d) });
		tr.createEl('td', { cls: 'mono', text: tail.naming });
		const miss = tr.createEl('td');
		miss.createSpan({ text: `report · max ${tail.max_depth ?? 6}` });
	}

	private renderDestinationChips(cell: HTMLElement, m: StructureMapping, mi: number, li: number, destinations: Destination[]): void {
		for (const d of destinations) {
			const chip = cell.createSpan({ cls: 'crosswalker-wb-chip crosswalker-wb-chip-dest', text: this.destChipText(d) });
			const x = chip.createEl('button', { cls: 'crosswalker-wb-chip-x', text: '✕' });
			x.addEventListener('click', () => this.updateMapping(mi, removeDestination(m, li, d.primitive, destKey(d))));
		}
		const add = cell.createEl('button', { cls: 'crosswalker-wb-chip crosswalker-wb-chip-add', text: '⊕' });
		add.addEventListener('click', () => {
			const open = this.addMenu && this.addMenu.mi === mi && this.addMenu.li === li;
			this.addMenu = open ? null : { mi, li };
			this.addMenuPrimitive = null;
			this.scheduleRerender();
		});
		if (this.addMenu && this.addMenu.mi === mi && this.addMenu.li === li) {
			this.renderAddMenu(cell, m, mi, li);
		}
	}

	/** The two-stage ⊕ menu: pick a primitive, then a small param popover (spec §3d). */
	private renderAddMenu(cell: HTMLElement, m: StructureMapping, mi: number, li: number): void {
		const menu = cell.createDiv({ cls: 'crosswalker-wb-addmenu' });
		if (!this.addMenuPrimitive) {
			menu.createDiv({ cls: 'crosswalker-wb-addmenu-title', text: 'Also send this level to…' });
			for (const grp of ADD_MENU_GROUPS) {
				menu.createDiv({ cls: 'crosswalker-wb-addmenu-group', text: grp.group });
				for (const it of grp.items) {
					const b = menu.createEl('button', { cls: 'crosswalker-wb-addmenu-item', text: it.label });
					b.addEventListener('click', () => {
						this.addMenuPrimitive = it.primitive;
						this.addMenuParams = this.defaultParams(it.primitive, m.levels[li]);
						this.scheduleRerender();
					});
				}
			}
			return;
		}

		// Stage 2 — parameter popover for the chosen primitive.
		const primitive = this.addMenuPrimitive;
		menu.createDiv({ cls: 'crosswalker-wb-addmenu-title', text: `Add ${primitive}` });
		for (const field of this.paramFields(primitive)) {
			const row = menu.createDiv({ cls: 'crosswalker-wb-addmenu-field' });
			row.createSpan({ text: field.label });
			if (field.options) {
				const sel = row.createEl('select', { cls: 'dropdown' });
				for (const [v, l] of field.options) sel.createEl('option', { text: l, attr: { value: v } });
				sel.value = this.addMenuParams[field.key] ?? field.options[0][0];
				sel.addEventListener('change', () => { this.addMenuParams[field.key] = sel.value; });
			} else {
				const inp = row.createEl('input', { type: 'text', value: this.addMenuParams[field.key] ?? '' });
				inp.addEventListener('input', () => { this.addMenuParams[field.key] = inp.value; });
			}
		}
		const btns = menu.createDiv({ cls: 'crosswalker-wb-addmenu-btns' });
		const addBtn = btns.createEl('button', { cls: 'mod-cta', text: 'Add' });
		addBtn.addEventListener('click', () => {
			const dest = this.buildDestination(primitive, this.addMenuParams);
			this.addMenu = null;
			this.addMenuPrimitive = null;
			this.updateMapping(mi, addDestination(m, li, dest));
		});
		const cancel = btns.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => {
			this.addMenu = null;
			this.addMenuPrimitive = null;
			this.scheduleRerender();
		});
	}

	// -------------------------------------------------------------------------
	// Zone 3 — vault preview rail
	// -------------------------------------------------------------------------

	private renderPreviewRail(rail: HTMLElement): void {
		rail.createDiv({ cls: 'crosswalker-wb-eyebrow', text: 'Vault preview · live' });
		const preview = this.computePreview();
		if (!preview) {
			rail.createDiv({ cls: 'crosswalker-wb-preview-empty', text: 'Preview is available for in-memory sources. Streamed sources render at generate time.' });
			return;
		}

		// Folder tree from the sample addresses.
		const tree = rail.createEl('pre', { cls: 'crosswalker-wb-tree' });
		tree.setText(this.buildTree(preview.addresses));

		// One selected note.
		const addrs = preview.addresses;
		if (addrs.length) {
			this.selectedNoteRow = Math.min(this.selectedNoteRow, addrs.length - 1);
			const note = rail.createDiv({ cls: 'crosswalker-wb-note' });
			note.createDiv({ cls: 'crosswalker-wb-note-title', text: `📄 ${this.basename(addrs[this.selectedNoteRow].address.primary.path)}` });
			note.createEl('pre', { cls: 'crosswalker-wb-mini', text: this.describeFrontmatter(addrs[this.selectedNoteRow].address) });
			if (addrs.length > 1) {
				const nav = rail.createDiv({ cls: 'crosswalker-wb-note-nav' });
				const prev = nav.createEl('button', { text: 'Previous' });
				prev.addEventListener('click', () => { this.selectedNoteRow = (this.selectedNoteRow - 1 + addrs.length) % addrs.length; this.scheduleRerender(); });
				nav.createSpan({ text: `Row ${this.selectedNoteRow + 1} of ${addrs.length}` });
				const next = nav.createEl('button', { text: 'Next' });
				next.addEventListener('click', () => { this.selectedNoteRow = (this.selectedNoteRow + 1) % addrs.length; this.scheduleRerender(); });
			}
		}

		// Deviation banner (reuses the render report summary).
		if (preview.perRow.length) {
			const summary = summarizeRenderNotes(preview.perRow, preview.total);
			const banner = rail.createDiv({ cls: `crosswalker-render-banner is-${summary.tone}` });
			banner.createSpan({ cls: 'crosswalker-render-banner-icon', text: summary.tone === 'clean' ? '✅' : '⚠️' });
			banner.createSpan({ cls: 'crosswalker-render-banner-text', text: summary.message });
		}
	}

	/** Run the workbench recipe over a sample of rows. Null for non-eager sources. */
	computePreview(): { addresses: { row: number; address: Address }[]; perRow: PreviewRowNotes[]; total: number } | null {
		const rows = this.opts.parsedData.rows;
		if (!isEagerRows(rows) || rows.length === 0) return null;
		let recipe: Recipe;
		try {
			recipe = this.buildRecipe();
		} catch {
			return null;
		}
		const addresses: { row: number; address: Address }[] = [];
		const perRow: PreviewRowNotes[] = [];
		rows.slice(0, PREVIEW_ROW_LIMIT).forEach((row, i) => {
			const rowNum = i + 1;
			const report: RenderReport = { notes: [] };
			try {
				const address = render(recipe, { curie: `preview:${rowNum}`, scope: row as Record<string, unknown> }, report);
				addresses.push({ row: rowNum, address });
				perRow.push({ row: rowNum, notes: report.notes, path: this.withBase(address.primary.path) });
			} catch {
				// A bad row surfaces at generate time; skip it in the live preview.
			}
		});
		return { addresses, perRow, total: this.opts.parsedData.rowCount || rows.length };
	}

	// =========================================================================
	// Model helpers
	// =========================================================================

	private currentPreset(): Preset {
		return getBuiltInPreset(this.presetId) ?? BUILT_IN_PRESETS['browsable-framework'];
	}

	private activeDetections(): Detection[] {
		return this.detections.filter((d) => !this.dismissed.has(this.detectionKey(d)));
	}

	private reinstantiate(): void {
		this.mapping = instantiate(this.currentPreset(), this.activeDetections());
		this.expanded.clear();
		this.matrixOpen.clear();
		this.addMenu = null;
		this.applyChange();
	}

	private presetLabel(): string {
		const preset = this.currentPreset();
		const name = preset.label ?? preset.preset;
		return isUnmodifiedPreset(this.mapping, preset, this.activeDetections())
			? name
			: `Custom (based on ${name})`;
	}

	private seedColumnDests(): void {
		const structural = this.structuralColumns();
		for (const col of this.opts.parsedData.columns) {
			this.columnDests.set(col, structural.has(col) ? 'skip' : 'property');
		}
	}

	/** Columns already carried by a shape mapping (so the all columns table can default them to skip). */
	private structuralColumns(): Set<string> {
		const cols = new Set<string>();
		const addSource = (source: LevelSource) => {
			for (const ref of toSourceRefs(source)) {
				if (!isConstantRef(ref)) cols.add(ref.column);
			}
		};
		for (const m of this.mapping.mappings) {
			for (const l of m.levels) addSource(l.source);
			if (m.tail) addSource(m.tail.source);
		}
		return cols;
	}

	private addManualMapping(column: string): void {
		const next: StructureMapping = {
			levels: [
				{
					level: column,
					source: { column },
					destinations: [{ primitive: 'name' }],
					naming: 'part',
					missing: 'skip',
					materialize: false,
				},
			],
		};
		this.mapping = { ...this.mapping, mappings: [...this.mapping.mappings, next] };
		this.expanded.add(this.mapping.mappings.length - 1);
		this.applyChange();
	}

	private removeMapping(mi: number): void {
		this.mapping = { ...this.mapping, mappings: this.mapping.mappings.filter((_, i) => i !== mi) };
		this.expanded.delete(mi);
		this.matrixOpen.delete(mi);
		this.applyChange();
	}

	private replaceLevel(m: StructureMapping, li: number, next: LevelRule): StructureMapping {
		const levels = m.levels.map((l, i) => (i === li ? next : l));
		return m.tail ? { levels, tail: m.tail } : { levels };
	}

	private defaultParams(primitive: DestinationPrimitive, rule: LevelRule): Record<string, string> {
		const col = this.firstColumn(rule.source);
		switch (primitive) {
			case 'property': return { key: this.keyOf(col) };
			case 'link': return { key: 'parent', direction: 'parent-on-child' };
			case 'tag': return { namespace: this.slug(col) };
			case 'heading': return { depth: '2' };
			case 'body': return { position: 'section' };
			default: return {};
		}
	}

	private paramFields(primitive: DestinationPrimitive): { key: string; label: string; options?: [string, string][] }[] {
		switch (primitive) {
			case 'property': return [{ key: 'key', label: 'Property key' }];
			case 'link': return [
				{ key: 'key', label: 'Frontmatter key' },
				{ key: 'direction', label: 'Direction', options: [['parent-on-child', 'Parent on child'], ['children-on-parent', 'Children on parent'], ['both', 'Both']] },
			];
			case 'tag': return [{ key: 'namespace', label: 'Tag namespace' }];
			case 'heading': return [{ key: 'depth', label: 'Heading depth', options: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6']] }];
			case 'body': return [{ key: 'position', label: 'Position', options: [['section', 'Section'], ['append', 'Append'], ['table-row', 'Table row']] }];
			default: return [];
		}
	}

	private buildDestination(primitive: DestinationPrimitive, params: Record<string, string>): Destination {
		switch (primitive) {
			case 'folder': return { primitive: 'folder' };
			case 'name': return { primitive: 'name' };
			case 'note': return { primitive: 'note' };
			case 'alias': return { primitive: 'alias' };
			case 'property': return { primitive: 'property', key: params.key || 'value' };
			case 'link': {
				const dir = params.direction === 'children-on-parent' || params.direction === 'both' ? params.direction : 'parent-on-child';
				return { primitive: 'link', key: params.key || 'parent', direction: dir };
			}
			case 'tag': return params.namespace ? { primitive: 'tag', namespace: params.namespace } : { primitive: 'tag' };
			case 'heading': return { primitive: 'heading', hostRule: 'root', depth: Number(params.depth) || 2 };
			case 'body': return { primitive: 'body', position: (params.position as 'section' | 'append' | 'table-row') || 'section' };
		}
	}

	// =========================================================================
	// Rendering helpers (pure formatting)
	// =========================================================================

	private detectionsForColumn(column: string): Detection[] {
		return this.detections.filter((d) => this.detectionColumns(d).includes(column));
	}

	private detectionColumns(d: Detection): string[] {
		switch (d.kind) {
			case 'level-column-chain': return d.columns;
			case 'edge-file': return [d.subjectColumn, d.objectColumn, ...(d.predicateColumn ? [d.predicateColumn] : [])];
			default: return 'column' in d ? [d.column] : [];
		}
	}

	private detectionKey(d: Detection): string {
		return `${d.kind}:${this.detectionColumns(d).join(',')}`;
	}

	private badgeIcon(d: Detection): string {
		switch (d.kind) {
			case 'packed-hierarchy': return '⛰';
			case 'level-column-chain': return '⛰';
			case 'facet-candidate': return '🏷';
			case 'parent-column':
			case 'multi-value-link': return '🔗';
			case 'title-candidate': return 'T';
			case 'body-candidate': return '¶';
			case 'edge-file': return '↔';
			case 'row-type-discriminator': return '≡';
		}
	}

	/** Short one-word chip label per detection kind (spec §7h #2). */
	private badgeLabel(d: Detection): string {
		switch (d.kind) {
			case 'packed-hierarchy': return 'hierarchy';
			case 'level-column-chain': return 'chain';
			case 'facet-candidate': return 'facet';
			case 'parent-column':
			case 'multi-value-link': return 'link';
			case 'title-candidate': return 'title';
			case 'body-candidate': return 'text';
			case 'edge-file': return 'edge';
			case 'row-type-discriminator': return 'mixed';
		}
	}

	private badgeTitle(d: Detection): string {
		switch (d.kind) {
			case 'packed-hierarchy': return `Packed hierarchy (${d.classification})`;
			case 'level-column-chain': return 'Level per column';
			case 'facet-candidate': return `Facet, ${d.cardinality} values`;
			case 'parent-column': return 'Parent column';
			case 'multi-value-link': return 'Multi-value link';
			case 'title-candidate': return 'Title candidate';
			case 'body-candidate': return 'Body candidate';
			case 'edge-file': return 'Edge-shaped file';
			case 'row-type-discriminator': return 'Row-type discriminator';
		}
	}

	private evidenceTitle(d: Detection): string {
		switch (d.kind) {
			case 'packed-hierarchy': return `A hierarchy is hiding in ${d.column} (${d.classification})`;
			case 'level-column-chain': return `A hierarchy spans ${d.columns.join(' → ')}`;
			case 'facet-candidate': return `${d.column} looks like a label set`;
			case 'parent-column': return `${d.column} points at ${d.idColumn}`;
			case 'multi-value-link': return `${d.column} lists several ${d.idColumn} values`;
			case 'title-candidate': return `${d.column} names each row`;
			case 'body-candidate': return `${d.column} reads like body text`;
			case 'edge-file': return 'This file is relationships, not concepts';
			case 'row-type-discriminator': return `${d.column} mixes levels as rows`;
		}
	}

	private evidenceCoverage(d: Detection): string | null {
		switch (d.kind) {
			case 'packed-hierarchy': return `Splitting on "${d.delimiter}": ${Math.round(d.coverage * 100)}% of ids have a parent in front of the delimiter.`;
			case 'facet-candidate': return `Every row carries a few of ${d.cardinality} values.`;
			case 'parent-column': return `${Math.round(d.matchRate * 100)}% of values match a row id.`;
			case 'multi-value-link': return `${Math.round(d.matchRate * 100)}% of split values match a row id.`;
			default: return null;
		}
	}

	private mappingTitle(m: StructureMapping): string {
		const cols = new Set<string>();
		for (const l of m.levels) cols.add(this.firstColumn(l.source));
		if (m.tail) cols.add(this.firstColumn(m.tail.source));
		return `${[...cols].slice(0, 2).join(', ') || 'mapping'}`;
	}

	private destChipText(d: Destination): string {
		switch (d.primitive) {
			case 'folder': return '📁 folder';
			case 'name': return '📛 file name';
			case 'note': return '📝 own note';
			case 'heading': return `# heading ${d.depth}`;
			case 'property': return `🧩 ${d.key}`;
			case 'tag': return `🏷 ${d.namespace ?? 'tag'}`;
			case 'link': return `🔗 ${d.key}`;
			case 'alias': return '💬 alias';
			case 'body': return `¶ body`;
		}
	}

	private namingValue(naming: LevelNaming): string {
		return typeof naming === 'string' ? naming : 'part';
	}

	private isSplittable(source: LevelSource): boolean {
		const refs = toSourceRefs(source);
		if (refs.length > 1) return true;
		const only = refs[0];
		return !isConstantRef(only) && Array.isArray(only.part);
	}

	private sampleForLevel(rule: LevelRule): string {
		const sample = this.firstRow();
		if (!sample) return '-';
		try {
			const regions = toRecipeRegions({ mappings: [{ levels: [rule] }] });
			const recipe: Recipe = { recipe: 'wb-cell', target: regions as Recipe['target'] };
			const address = render(recipe, { curie: 'preview:1', scope: sample });
			// Show whichever rendered piece exists (folder path segment, name, or a frontmatter value).
			return address.primary.path || Object.values(address.frontmatter).filter((v) => v !== undefined && v !== 'concept')[0]?.toString() || '-';
		} catch {
			return '-';
		}
	}

	private firstColumn(source: LevelSource): string {
		const ref = toSourceRefs(source)[0];
		return isConstantRef(ref) ? ref.constant : ref.column;
	}

	private firstRow(): Record<string, unknown> | null {
		const rows = this.opts.parsedData.rows;
		if (!isEagerRows(rows) || rows.length === 0) return null;
		return rows[0] as Record<string, unknown>;
	}

	private describeAddress(a: Address): string {
		const lines: string[] = [];
		lines.push(this.withBase(a.primary.path));
		const fm = this.describeFrontmatter(a);
		if (fm.trim()) lines.push(fm);
		return lines.join('\n');
	}

	private describeFrontmatter(a: Address): string {
		const lines: string[] = ['---'];
		for (const [k, v] of Object.entries(a.frontmatter)) {
			if (k === 'curie') continue;
			lines.push(`${k}: ${String(v)}`);
		}
		if (a.tags.length) lines.push(`tags: [${a.tags.join(', ')}]`);
		if (a.aliases.length) lines.push(`aliases: [${a.aliases.join(', ')}]`);
		lines.push('---');
		return lines.length > 2 ? lines.join('\n') : '';
	}

	private buildTree(addresses: { row: number; address: Address }[]): string {
		const paths = addresses.map((a) => this.withBase(a.address.primary.path)).filter(Boolean).slice(0, 12);
		const seen = new Set<string>();
		const lines: string[] = [];
		for (const p of paths) {
			const parts = p.split('/');
			let prefix = '';
			parts.forEach((part, depth) => {
				prefix += (prefix ? '/' : '') + part;
				if (seen.has(prefix)) return;
				seen.add(prefix);
				const isFile = depth === parts.length - 1;
				lines.push(`${'  '.repeat(depth)}${isFile ? '' : '📁 '}${part}${isFile ? '' : '/'}`);
			});
		}
		if (addresses.length > paths.length) lines.push(`… and more`);
		return lines.join('\n') || '(no output)';
	}

	private basename(path: string): string {
		return path.split('/').pop() ?? path;
	}

	private withBase(path: string): string {
		const base = this.opts.outputPath;
		return base ? `${base}/${path}` : path;
	}

	private keyOf(column: string): string {
		return column.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'value';
	}

	private slug(column: string): string {
		return column.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	}

	private sourceLabel(): string {
		return this.opts.parsedData.sheetName ?? 'source table';
	}
}

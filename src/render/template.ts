/**
 * Template engine — R2RML-style `{var|filter}` interpolation.
 *
 * Per Ch 22 §3.3: closed filter set; computation beyond filters escapes into
 * a `Function` primitive (Ch 20) which v0.1 doesn't ship.
 *
 * Closed filter set:
 *   lower, upper, title, slug, tagsafe, fs-safe, truncate(N)
 *
 * Variable resolution: dotted path through `SourceScope`. `{control.id}` →
 * `scope.control.id`. Deep paths (`{a.b.c.d}`) work; missing intermediates
 * throw `RenderError`.
 *
 * Determinism: pure function. Same `(template, scope)` → byte-identical output.
 */

import type { SourceScope } from './types';

export class RenderError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RenderError';
	}
}

/**
 * Render a single template against a scope.
 *
 * @example
 *   renderTemplate('{control.id}.md', { control: { id: 'AC-2' } })
 *   //=> 'AC-2.md'
 *
 *   renderTemplate('framework/{family.id|lower}/{control.id|tagsafe}', { ... })
 *   //=> 'framework/ac/ac-2'
 */
export function renderTemplate(template: string, scope: SourceScope): string {
	return template.replace(/\{([^{}]+)\}/g, (_match, expr) => {
		return interpolate(expr, scope, template);
	});
}

function interpolate(expr: string, scope: SourceScope, originalTemplate: string): string {
	// Split into variable-path and filter pipeline: `var.path|filter1|filter2`
	const parts = expr.split('|').map((s) => s.trim());
	const varPath = parts[0];
	const filters = parts.slice(1);

	let value = resolvePath(varPath, scope, originalTemplate);

	for (const filterExpr of filters) {
		value = applyFilter(filterExpr, value, originalTemplate);
	}

	return String(value);
}

function resolvePath(path: string, scope: SourceScope, originalTemplate: string): unknown {
	const segments = path.split('.');
	let cur: unknown = scope;

	for (const seg of segments) {
		if (cur == null || typeof cur !== 'object') {
			throw new RenderError(
				`Template variable "${path}" — segment "${seg}" hit non-object value while traversing in template "${originalTemplate}".`,
			);
		}
		cur = (cur as Record<string, unknown>)[seg];
	}

	if (cur === undefined || cur === null) {
		throw new RenderError(
			`Template variable "${path}" resolved to undefined/null in template "${originalTemplate}".`,
		);
	}

	return cur;
}

const FILTERS: Record<string, (v: unknown, arg?: string) => unknown> = {
	lower: (v) => String(v).toLowerCase(),
	upper: (v) => String(v).toUpperCase(),
	title: (v) =>
		String(v).replace(
			/\w\S*/g,
			(w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
		),
	slug: (v) =>
		String(v)
			// Replace anything that's not a-z, A-Z, 0-9 with hyphen.
			// Then collapse multiple hyphens, strip leading/trailing.
			.replace(/[^A-Za-z0-9]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase(),
	tagsafe: (v) =>
		String(v)
			// Tags allow [a-zA-Z0-9_-] plus `/`. We strip `/` collisions
			// because tagsafe is used at *segment* level — slash separators
			// come from template structure, not values.
			.replace(/[^A-Za-z0-9_-]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase(),
	'fs-safe': (v) =>
		String(v)
			// Strip Windows-reserved + path separators + control chars.
			.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
			// Strip trailing dot/space (Windows quirk)
			.replace(/[\s.]+$/g, ''),
	truncate: (v, arg) => {
		if (arg === undefined) {
			throw new RenderError(`truncate filter requires a numeric argument, e.g. {var|truncate(60)}.`);
		}
		const n = parseInt(arg, 10);
		if (Number.isNaN(n) || n <= 0) {
			throw new RenderError(`truncate filter argument must be a positive integer; got "${arg}".`);
		}
		const s = String(v);
		return s.length > n ? s.slice(0, n) : s;
	},
	trim: (v) => String(v).trim(),
	split: (v, arg) => {
		// {var|split(<delim>,<index>)} — split on <delim>, return the n-th (0-based)
		// segment, trimmed. For values that pack a code + name into one cell, e.g.
		// CSF's "DE.AE-01: Adverse events are analyzed" → split(:,0) → "DE.AE-01".
		if (arg === undefined) {
			throw new RenderError(`split filter requires "<delim>,<index>", e.g. {var|split(:,0)}.`);
		}
		const m = arg.match(/^(.*),(\d+)$/);
		if (!m) {
			throw new RenderError(`split filter argument must be "<delim>,<index>"; got "${arg}".`);
		}
		const [, delim, idxStr] = m;
		const parts = String(v).split(delim);
		return (parts[parseInt(idxStr, 10)] ?? '').trim();
	},
	regex: (v, arg) => {
		// {var|regex(<pattern>)} — return the first match of <pattern> (or its first
		// capture group, if present). The pattern cannot contain ")" or "|" — the
		// template parser reserves those — so reach for split() in those cases.
		if (arg === undefined) {
			throw new RenderError(`regex filter requires a pattern, e.g. {var|regex([A-Z.]+-\\d+)}.`);
		}
		let re: RegExp;
		try {
			re = new RegExp(arg);
		} catch (e) {
			throw new RenderError(`regex filter pattern is invalid (${(e as Error).message}).`);
		}
		const found = String(v).match(re);
		return found ? (found[1] ?? found[0]) : '';
	},
};

function applyFilter(filterExpr: string, value: unknown, originalTemplate: string): unknown {
	// Parse `name` or `name(arg)`
	const match = filterExpr.match(/^([a-z][a-z0-9_-]*)(?:\(([^)]*)\))?$/);
	if (!match) {
		throw new RenderError(`Malformed filter expression "${filterExpr}" in template "${originalTemplate}".`);
	}
	const [, name, arg] = match;

	const fn = FILTERS[name];
	if (!fn) {
		throw new RenderError(
			`Unknown filter "${name}" in template "${originalTemplate}". Allowed filters: ${Object.keys(FILTERS).join(', ')}.`,
		);
	}

	return fn(value, arg);
}

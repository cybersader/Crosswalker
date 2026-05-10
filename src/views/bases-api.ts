/**
 * bases-api.ts — Phase 3 v0.1.6 (per Settled #2 + Ch 30)
 *
 * Wraps the Obsidian 1.10.0+ public Bases API for plugin-side custom view
 * registration. Adapted from the TaskNotes v4 pattern (the canonical
 * Obsidian-plugin precedent for `registerBasesView` per Settled #11).
 *
 * Design:
 *   - `registerCrosswalkerBasesView(plugin, viewId, registration)` →
 *     wraps `(plugin as any).registerBasesView(...)` with version gating
 *     (`requireApiVersion("1.10.0")`), error handling for already-registered
 *     views, and Bases-disabled detection.
 *   - `isBasesPluginAvailable(app)` → checks if the Bases internal plugin
 *     is enabled. Used by the Bases-disabled fallback Notice in main.ts.
 *
 * Anti-pattern explicitly avoided: writing directly to
 * `internalPlugins.getEnabledPluginById('bases').registrations[viewId]`.
 * That's the pre-1.10 path; it bypasses Bases lifecycle. Public API only.
 */

import { Plugin, App, requireApiVersion } from 'obsidian';

/** Per-view registration shape; matches Obsidian 1.10.0+ BasesViewFactory signature. */
export interface CrosswalkerBasesViewRegistration {
	name: string;
	icon: string;
	factory: (controller: unknown, containerEl: HTMLElement) => unknown;
	options?: () => CrosswalkerBasesViewOption[];
}

/** Subset of Bases ViewOption types Crosswalker uses. Public API per Obsidian 1.10.0+. */
export type CrosswalkerBasesViewOption =
	| {
			type: 'property';
			key: string;
			displayName: string;
			default?: string;
			placeholder?: string;
			filter?: (prop: string) => boolean;
	  }
	| {
			type: 'dropdown';
			key: string;
			displayName: string;
			options: string[];
			default?: string;
	  }
	| {
			type: 'toggle';
			key: string;
			displayName: string;
			default?: boolean;
	  }
	| {
			type: 'text';
			key: string;
			displayName: string;
			default?: string;
			placeholder?: string;
	  }
	| {
			type: 'slider';
			key: string;
			displayName: string;
			default?: number;
			min?: number;
			max?: number;
			step?: number;
	  };

/** Result of a registration attempt. `success: false` doesn't always mean error — Bases may be disabled. */
export interface RegistrationResult {
	success: boolean;
	reason?: 'no-public-api' | 'bases-disabled' | 'already-registered' | 'error';
	error?: Error;
}

/**
 * Register a Crosswalker custom Bases view via the Obsidian 1.10.0+ public API.
 *
 * Returns `{ success: true }` if registration succeeded OR if the view was
 * already registered (idempotent).
 *
 * Returns `{ success: false, reason: '...' }` if:
 *   - Obsidian < 1.10.0 (`reason: 'no-public-api'`)
 *   - Bases plugin disabled by user (`reason: 'bases-disabled'`)
 *   - Other registration error (`reason: 'error'`, with `error` populated)
 *
 * Call sites should treat `'bases-disabled'` as a soft failure (show Notice
 * with one-click enable hint); `'no-public-api'` as user-needs-to-update;
 * `'error'` as a developer bug.
 */
export function registerCrosswalkerBasesView(
	plugin: Plugin,
	viewId: string,
	registration: CrosswalkerBasesViewRegistration,
): RegistrationResult {
	if (!requireApiVersion('1.10.0')) {
		return { success: false, reason: 'no-public-api' };
	}

	const fn = (plugin as unknown as { registerBasesView?: (id: string, reg: unknown) => boolean }).registerBasesView;
	if (typeof fn !== 'function') {
		return { success: false, reason: 'no-public-api' };
	}

	try {
		const ok = fn.call(plugin, viewId, registration);
		if (ok) {
			return { success: true };
		}
		// fn returns falsy when Bases is registered but disabled.
		return { success: false, reason: 'bases-disabled' };
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		// "Already exists" is treated as success (idempotent re-register).
		if (/already\s*(?:exists|registered)/i.test(error.message)) {
			return { success: true, reason: 'already-registered' };
		}
		return { success: false, reason: 'error', error };
	}
}

/**
 * Best-effort check whether the Bases internal plugin is enabled. Used to
 * surface a meaningful Notice when registration fails because the user
 * disabled Bases.
 *
 * Reads `app.internalPlugins.getEnabledPluginById('bases')` — internal API,
 * may break in future Obsidian versions. Falls back to "available" on any
 * error so we don't false-negative.
 */
export function isBasesPluginAvailable(app: App): boolean {
	try {
		const internalPlugins = (app as unknown as {
			internalPlugins?: { getEnabledPluginById?: (id: string) => unknown };
		}).internalPlugins;
		if (!internalPlugins?.getEnabledPluginById) return true;
		return Boolean(internalPlugins.getEnabledPluginById('bases'));
	} catch {
		// Internal API not available or threw — assume available; let the
		// public registerBasesView call succeed-or-fail naturally.
		return true;
	}
}

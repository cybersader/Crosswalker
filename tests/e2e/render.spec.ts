/**
 * render.spec.ts — End-to-end test for v0.1.2 (render() v1)
 *
 * Verifies render() works in the bundled main.js running inside real Obsidian.
 * Drives render through the plugin-instance handle exposed in src/main.ts.
 *
 * Per milestone v0.1.2 success criteria:
 *   "Import a recipe with folder+heading mechanisms; assert correct
 *    vault structure"
 *
 * For v0.1.2 (no engine integration yet) we exercise render() directly and
 * assert the Address output. Engine-level integration ships in v0.1.3 where
 * generation-engine refactors to call render() before writing notes.
 *
 * Run: `bun run e2e`
 */

import { browser } from '@wdio/globals';
import { expect } from 'expect';

const sampleIdentity = {
	curie: 'nist:AC-2',
	scope: {
		catalog: { name: 'NIST 800-53 r5' },
		family: { id: 'AC', title: 'Access Control' },
		control: { id: 'AC-2', title: 'Account Management' },
	},
};

describe('Crosswalker plugin — render() v1 (v0.1.2)', function () {
	it('the render function is exposed on the plugin instance', async () => {
		const info = await browser.executeObsidian(({ app }) => {
			// @ts-expect-error — plugins.plugins is internal API
			const plugin = app.plugins.plugins['crosswalker'];
			return {
				hasRender: typeof plugin?.render === 'function',
			};
		});
		expect(info.hasRender).toBe(true);
	});

	it('renders the all-folders recipe to the expected vault path', async () => {
		const result = await browser.executeObsidian(
			({ app }, identity) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				return plugin.render(
					{
						recipe: 'nist-allfolders',
						source: { ontology: 'nist', levels: ['catalog', 'family', 'control'] },
						target: {
							layout: [
								{ level: 'catalog', mechanism: 'folder', template: 'Frameworks/{catalog.name}' },
								{ level: 'family', mechanism: 'folder', template: '{family.id}' },
								{ level: 'control', mechanism: 'file', template: '{control.id}.md' },
							],
						},
					},
					identity,
				);
			},
			sampleIdentity,
		);

		expect(result.primary.path).toBe('Frameworks/NIST 800-53 r5/AC/AC-2.md');
		expect(result.primary.anchor).toBeUndefined();
		expect(result.wikilinkTarget).toBe('Frameworks/NIST 800-53 r5/AC/AC-2');
		expect(result.frontmatter.curie).toBe('nist:AC-2');
	});

	it('renders the mostly-headings recipe with nested heading anchors', async () => {
		const result = await browser.executeObsidian(
			({ app }, identity) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				return plugin.render(
					{
						recipe: 'nist-mostly-headings',
						source: { ontology: 'nist', levels: ['catalog', 'family', 'control'] },
						target: {
							layout: [
								{ level: 'catalog', mechanism: 'file', template: 'Frameworks/{catalog.name}.md' },
								{
									level: 'family',
									mechanism: 'heading',
									level_depth: 2,
									template: '{family.id} — {family.title}',
								},
								{
									level: 'control',
									mechanism: 'heading',
									level_depth: 3,
									template: '{control.id} {control.title}',
								},
							],
						},
					},
					identity,
				);
			},
			sampleIdentity,
		);

		expect(result.primary.path).toBe('Frameworks/NIST 800-53 r5.md');
		expect(result.primary.anchor).toBe('AC — Access Control#AC-2 Account Management');
		expect(result.wikilinkTarget).toContain('AC-2 Account Management');
	});

	it('emits also_emit tags + aliases + managed frontmatter', async () => {
		const result = await browser.executeObsidian(
			({ app }, identity) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				return plugin.render(
					{
						recipe: 'with-also-emit',
						source: { ontology: 'nist', levels: ['catalog', 'family', 'control'] },
						target: {
							layout: [
								{ level: 'catalog', mechanism: 'folder', template: 'Frameworks/{catalog.name}' },
								{ level: 'family', mechanism: 'folder', template: '{family.id}' },
								{ level: 'control', mechanism: 'file', template: '{control.id}.md' },
							],
							also_emit: {
								tags: ['framework/nist/{family.id|lower}/{control.id|tagsafe}'],
								aliases: ['{control.id}', '{control.title}'],
								frontmatter: {
									managed: {
										framework: 'nist-800-53-r5',
										control_id: '{control.id}',
									},
								},
							},
						},
					},
					identity,
				);
			},
			sampleIdentity,
		);

		expect(result.tags).toContain('framework/nist/ac/ac-2');
		expect(result.aliases).toEqual(['AC-2', 'Account Management']);
		expect(result.frontmatter.framework).toBe('nist-800-53-r5');
		expect(result.frontmatter.control_id).toBe('AC-2');
	});

	it('throws informatively when a recipe uses tag-as-layout (deferred to v0.2)', async () => {
		const result = await browser.executeObsidian(
			({ app }, identity) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				try {
					plugin.render(
						{
							recipe: 'broken-tag-layout',
							source: { ontology: 'x', levels: ['x'] },
							target: {
								layout: [{ level: 'x', mechanism: 'tag', template: 'a/{x.y}' }],
							},
						},
						identity,
					);
					return { threw: false, message: '' };
				} catch (e) {
					return { threw: true, message: (e as Error).message };
				}
			},
			sampleIdentity,
		);

		expect(result.threw).toBe(true);
		expect(result.message).toMatch(/v0.2/);
	});

	it('renders deterministically — same input → byte-identical output', async () => {
		const results = await browser.executeObsidian(
			({ app }, identity) => {
				// @ts-expect-error — internal API
				const plugin = app.plugins.plugins['crosswalker'];
				const recipe = {
					recipe: 'determinism-test',
					source: { ontology: 'nist', levels: ['catalog', 'family', 'control'] },
					target: {
						layout: [
							{ level: 'catalog', mechanism: 'folder', template: 'Frameworks/{catalog.name}' },
							{ level: 'family', mechanism: 'folder', template: '{family.id}' },
							{ level: 'control', mechanism: 'file', template: '{control.id}.md' },
						],
					},
				};

				const reference = JSON.stringify(plugin.render(recipe, identity));
				const matchesAll: boolean[] = [];
				for (let i = 0; i < 50; i++) {
					matchesAll.push(JSON.stringify(plugin.render(recipe, identity)) === reference);
				}
				return { reference, allMatched: matchesAll.every((m) => m === true) };
			},
			sampleIdentity,
		);

		expect(results.allMatched).toBe(true);
		expect(results.reference).toContain('Frameworks/NIST 800-53 r5/AC/AC-2.md');
	});
});

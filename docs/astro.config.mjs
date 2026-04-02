import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://cybersader.github.io',
  base: '/Crosswalker',
  integrations: [
    starlight({
      title: 'Crosswalker',
      description: 'Import structured ontologies into Obsidian with folder structures, typed links, and metadata',
      head: [
        { tag: 'script', attrs: { type: 'module' }, content: `
          import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
          function getTheme() {
            return document.documentElement.dataset.theme === 'light' ? 'default' : 'dark';
          }
          function initMermaid() {
            document.querySelectorAll('pre[data-language="mermaid"]').forEach(pre => {
              const figure = pre.closest('figure');
              const target = figure || pre;
              const lines = [];
              pre.querySelectorAll('.ec-line .code').forEach(line => {
                lines.push(line.textContent);
              });
              const text = lines.length > 0 ? lines.join('\\n') : pre.textContent;
              const div = document.createElement('div');
              div.classList.add('mermaid');
              div.textContent = text;
              target.replaceWith(div);
            });
            mermaid.initialize({ startOnLoad: false, theme: getTheme() });
            mermaid.run({ querySelector: '.mermaid' });
          }
          window.addEventListener('load', initMermaid);
          new MutationObserver(() => {
            document.querySelectorAll('.mermaid[data-processed]').forEach(el => {
              el.removeAttribute('data-processed');
              el.innerHTML = el.dataset.original || el.textContent;
            });
            mermaid.initialize({ startOnLoad: false, theme: getTheme() });
            mermaid.run({ querySelector: '.mermaid' });
          }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        ` },
      ],
      customCss: ['./src/styles/brand.css'],
      social: {
        github: 'https://github.com/cybersader/Crosswalker',
      },
      sidebar: [
        {
          label: 'Getting started',
          autogenerate: { directory: 'getting-started' },
        },
        {
          label: 'Features',
          autogenerate: { directory: 'features' },
        },
        {
          label: 'Concepts',
          autogenerate: { directory: 'concepts' },
        },
        {
          label: 'Design',
          autogenerate: { directory: 'design' },
        },
        {
          label: 'Agent context & exploration',
          autogenerate: { directory: 'agent-context' },
        },
        {
          label: 'Development',
          autogenerate: { directory: 'development' },
        },
        {
          label: 'Reference',
          autogenerate: { directory: 'reference' },
        },
      ],
    }),
  ],
});

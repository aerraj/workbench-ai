import vinext from 'vinext';
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineConfig({ plugins: [vinext(), cloudflare({ viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] }, inspectorPort: false, config: { name: 'workbench-ai', main: 'vinext/server/fetch-handler', compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'] } })] });

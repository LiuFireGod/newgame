import {defineConfig} from 'astro/config'
import preact from '@astrojs/preact'

// https://astro.build/config
export default defineConfig({
	// GitHub Pages 项目页部署路径：https://liufiregod.github.io/slaytheweb/
	base: '/slaytheweb/',
	srcDir: './src/ui',
	vite: {
		build: {
			sourcemap: true,
		},
	},
	devToolbar: {
		enabled: false
	},
	integrations: [
		preact(),
	],
})

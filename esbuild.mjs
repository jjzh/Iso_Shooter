import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/game.js',
  format: 'esm',
  sourcemap: true,
  target: 'es2020',
  // Three.js + nipplejs are loaded via CDN as globals
  external: [],
  // Replace 'three' imports with window.THREE at runtime
  define: {},
  banner: {
    js: '// Built with esbuild\nconst THREE = window.THREE;\nconst nipplejs = window.nipplejs;',
  },
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[esbuild] Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('[esbuild] Build complete.');
}

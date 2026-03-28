import esbuild from 'esbuild';
import process from 'process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWatch = process.argv.includes('--watch');
const isDev = isWatch || process.argv.includes('--dev');

const common = {
  bundle: true,
  sourcemap: isDev,
  minify: !isDev,
  target: 'chrome114',
  platform: 'browser',
  legalComments: 'none',
  format: 'iife', // preserve side-effects and simple global init without ESM runtime
  define: { 'process.env.NODE_ENV': '"production"' },
};

/**
 * Resolve entry point: prefer .ts over .js when available.
 * @param {string} jsPath - Path to the .js entry point
 * @returns {string} Resolved path (.ts if it exists, otherwise .js)
 */
function resolveEntry(jsPath) {
  const tsPath = jsPath.replace(/\.js$/, '.ts');
  return existsSync(tsPath) ? tsPath : jsPath;
}

async function copyStaticFiles() {
  const rootDir = path.resolve(__dirname, '..');
  const outDir = path.resolve(rootDir, 'dist');

  try {
    // Ensure the output directory exists and is clean
    await fs.emptyDir(outDir);

    // Paths to copy
    const pathsToCopy = {
      'manifest.json': path.join(outDir, 'manifest.json'),
      'src/assets': path.join(outDir, 'assets'),
      'src/ui': path.join(outDir, 'ui'),
      'src/styles': path.join(outDir, 'styles'),
      'LICENSE': path.join(outDir, 'LICENSE'),
      'CONTRIBUTING.md': path.join(outDir, 'CONTRIBUTING.md'),
      'PRIVACY.md': path.join(outDir, 'PRIVACY.md'),
      'README.md': path.join(outDir, 'README.md')
    };

    // Perform copy operations
    for (const [src, dest] of Object.entries(pathsToCopy)) {
      await fs.copy(path.join(rootDir, src), dest, {
        filter: (src) => {
          const base = path.basename(src);
          return !base.endsWith('.js') && !base.endsWith('.ts');
        }
      });
    }

    console.log('✅ Static files copied');
  } catch (error) {
    console.error('❌ Error copying static files:', error);
    process.exit(1);
  }
}

async function build() {
  try {
    await copyStaticFiles();

    const esbuildConfig = {
      ...common,
      entryPoints: {
        'content': resolveEntry('src/entries/content-entry.js'),
        'inject': resolveEntry('src/entries/inject-entry.js'),
        'background': resolveEntry('src/background.js'),
        'ui/popup/popup': resolveEntry('src/ui/popup/popup.js'),
        'ui/options/options': resolveEntry('src/ui/options/options.js'),
      },
      outdir: 'dist',
    };

    if (isWatch) {
      const ctx = await esbuild.context(esbuildConfig);
      await ctx.watch();
      console.log('🔧 Watching for changes...');
    } else {
      await esbuild.build(esbuildConfig);
      console.log('✅ Build complete');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();

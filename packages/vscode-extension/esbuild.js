/**
 * esbuild configuration for VS Code extension
 * Bundles extension and MCP server into dist/
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Build options for extension
const extensionBuildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    minify: !isWatch,
};

// Build options for MCP server (bundled with extension)
const serverBuildOptions = {
    entryPoints: [path.join(__dirname, '../mcp-server/src/index.ts')],
    bundle: true,
    outfile: 'dist/mcp-server.js',
    format: 'esm',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    minify: !isWatch,
    banner: {
        js: '#!/usr/bin/env node',
    },
};

async function build() {
    try {
        if (isWatch) {
            // Watch mode
            const extensionCtx = await esbuild.context(extensionBuildOptions);
            const serverCtx = await esbuild.context(serverBuildOptions);

            await Promise.all([
                extensionCtx.watch(),
                serverCtx.watch(),
            ]);

            console.log('👀 Watching for changes...');
        } else {
            // Single build
            await Promise.all([
                esbuild.build(extensionBuildOptions),
                esbuild.build(serverBuildOptions),
            ]);

            console.log('✅ Extension and MCP server bundled successfully');
        }
    } catch (error) {
        console.error('❌ Build failed:', error);
        process.exit(1);
    }
}

build();

'use strict';

let perfStats = {
    loadStartTime: Date.now(),
    loadEndTime: undefined,
};

Object.defineProperty(exports, '__esModule', { value: true });

const ignoreBundle = !/^(false|0)?$/i.test(process.env.SCPLUGIN_IGNORE_BUNDLE || '');
const extensionPath = ignoreBundle ? './out/src/extension' : './dist/extension.bundle'
const extension = require(extensionPath);

async function activate(ctx) {
    return await extension.activateInternal(ctx, perfStats);
}

async function deactivate(ctx) {
    return await extension.deactivateInternal(ctx, perfStats);
}

// Export as entrypoints for vscode
exports.activate = activate;
exports.deactivate = deactivate;

perfStats.loadEndTime = Date.now();

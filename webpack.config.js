//@ts-check

'use strict';

const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const FileManagerPlugin = require('filemanager-webpack-plugin');


const projectRoot = __dirname;

/**@type {import('webpack').Configuration}*/
const config = {
    context: projectRoot,

    // vscode extensions run in a Node.js context, see https://webpack.js.org/configuration/node/
    target: 'node',
    node: {
        // For __dirname and __filename, let Node.js use its default behavior (i.e., gives the path to the packed extension.bundle.js file, not the original source file)
        __filename: false,
        __dirname: false
    },

    entry: {
        'extension.bundle': './extension.bundle.ts',
    },

    output: {
        // The bundles are stored in the 'dist' folder (check package.json), see https://webpack.js.org/configuration/output/
        path: path.resolve(projectRoot, 'dist'),
        filename: '[name].js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },

    // Create .map.js files for debugging
    devtool: 'source-map',

    externals: {
        // Modules that cannot be webpack'ed, see https://webpack.js.org/configuration/externals/

        // The vscode-module is created on-the-fly so must always be excluded.
        vscode: 'commonjs vscode'
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    // https://github.com/webpack-contrib/terser-webpack-plugin/

                    // Don't mangle class names.  Otherwise parseError() will not recognize user cancelled errors (because their constructor name
                    // will match the mangled name, not UserCancelledError).  Also makes debugging easier in minified code.
                    keep_classnames: true
                }
            })
        ]
    },
    plugins: [
        // Copy files to dist folder where the runtime can find them
        new FileManagerPlugin({
            onEnd: {
                copy: [
                    // Test files -> dist/test (these files are ignored during packaging)
                    {
                        source: path.join(projectRoot, 'out', 'test'),
                        destination: path.join(projectRoot, 'dist', 'test')
                    }
                ]
            }
        }),
    ],

    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            }
        ]
    }
};

module.exports = config;

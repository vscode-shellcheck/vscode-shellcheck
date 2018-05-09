//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';


suite('Shellcheck extension', () => {
    const ext = vscode.extensions.getExtension('timonwong.shellcheck');

    test('Extension should not be activated', async () => {
        const plaintextDocument = await vscode.workspace.openTextDocument({
            content: 'hello',
            language: 'plaintext',
        });

        await vscode.window.showTextDocument(plaintextDocument);

        assert.equal(ext.isActive, false, 'should not be activated when file type is not shell script.');
    });

    test('Extension should be activated on shell script files', async () => {
        const shellscriptDocument = await vscode.workspace.openTextDocument({
            content: '#!/bin/bash\n',
            language: 'shellscript',
        });

        await vscode.window.showTextDocument(shellscriptDocument);

        assert.equal(ext.isActive, true, 'should be activated when file type is shellscript.');
    });
});

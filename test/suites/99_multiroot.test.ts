import * as vscode from 'vscode'
import * as path from 'path'
import rimraf from 'rimraf'
import * as assert from 'assert'

import { Extension } from '../../src/main'
import { sleep, runTest, writeTeX, assertBuild, touch, assertAutoBuild, writeTestFile, copyTestFile, getIntellisense, assertRoot, getExtension } from './utils'

suite('Multi-root workspace test suite', () => {

    let extension: Extension
    const suiteName = path.basename(__filename).replace('.test.js', '')
    let fixture = path.resolve(__dirname, '../../../test/fixtures/multiroot')
    const fixtureName = 'multiroot'

    suiteSetup(async () => {
        extension = await getExtension()
        fixture = path.resolve(extension.extensionRoot, 'test/fixtures/multiroot')
    })

    setup(async () => {
        await vscode.commands.executeCommand('latex-workshop.activate')
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.interval', 250)
    })

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        extension.manager.rootFile = undefined

        await vscode.workspace.getConfiguration('latex-workshop').update('latex.tools', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.outDir', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.recipes', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.build.forceRecipeUsage', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.search.rootFiles.include', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.search.rootFiles.exclude', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.run', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('intellisense.citation.label', undefined)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.interval', undefined)

        if (path.basename(fixture) === 'multiroot') {
            rimraf(fixture + '/{A,B}/{*,.vscode/*}', (e) => {if (e) {console.error(e)}})
            await sleep(500) // Required for pooling
        }
    })

    runTest({suiteName, fixtureName, testName: 'basic build A'}, async () => {
        const tools = [
            {name: 'latexmk', command: 'latexmk', args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '-pdf', '-outdir=%OUTDIR%', '-jobname=wsA', '%DOC%'], env: {}},
            {name: 'fake', command: 'touch', args: ['%DIR%/fake.pdf']}
        ]
        const recipes = [{name: 'latexmk', tools: ['latexmk']}]
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.tools', tools)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.recipes', recipes)
        await writeTeX('main', fixture, {fileName: 'A/main.tex'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertBuild({fixture, texFileName: 'A/main.tex', pdfFileName: 'A/wsA.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'basic build B'}, async () => {
        const tools = [
            {name: 'latexmk', command: 'latexmk', args: ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', '-pdf', '-outdir=%OUTDIR%', '-jobname=wsB', '%DOC%'], env: {}},
            {name: 'fake', command: 'touch', args: ['%DIR%/fake.pdf']}
        ]
        const recipes = [{name: 'latexmk', tools: ['latexmk']}]
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.tools', tools)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.recipes', recipes)
        await writeTeX('main', fixture, {fileName: 'B/main.tex'})
        touch(path.resolve(fixture, 'A', 'empty'))
        await assertBuild({fixture, texFileName: 'B/main.tex', pdfFileName: 'B/wsB.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'basic build with outDir A'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.outDir', './out')
        await writeTeX('main', fixture, {fileName: 'A/main.tex'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertBuild({fixture, texFileName: 'A/main.tex', pdfFileName: 'A/out/main.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'basic build with outDir B'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.outDir', './out')
        await writeTeX('main', fixture, {fileName: 'B/main.tex'})
        touch(path.resolve(fixture, 'A', 'empty'))
        await assertBuild({fixture, texFileName: 'B/main.tex', pdfFileName: 'B/out/main.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'build with forceRecipeUsage: true'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.build.forceRecipeUsage', true)
        await writeTeX('magicinvalidprogram', fixture, {fileName: 'A/main.tex'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertBuild({fixture, texFileName: 'A/main.tex', pdfFileName: 'A/main.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'detect root with search.rootFiles.include'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.search.rootFiles.include', ['alt/*.tex'])
        await writeTeX('subfiletwomain', fixture, {fileDir: 'A/'})
        touch(path.resolve(fixture, 'B', 'empty'))
        assert.ok(extension)
        await assertRoot({fixture, openName: 'A/sub/s.tex', rootName: 'A/alt/main.tex', extension})
    })

    runTest({suiteName, fixtureName, testName: 'detect root with search.rootFiles.exclude'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.search.rootFiles.exclude', ['*.tex'])
        await writeTeX('subfiletwomain', fixture, {fileDir: 'A/'})
        touch(path.resolve(fixture, 'B', 'empty'))
        assert.ok(extension)
        await assertRoot({fixture, openName: 'A/sub/s.tex', rootName: 'A/alt/main.tex', extension})
    })

    runTest({suiteName, fixtureName, testName: 'auto-detect subfile root and build A1'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', true)
        await writeTeX('subfile', fixture, {fileDir: 'A/'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertBuild({fixture, texFileName: 'A/sub/s.tex', pdfFileName: 'A/sub/s.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'auto-detect subfile root and build A2'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', false)
        await writeTeX('subfile', fixture, {fileDir: 'A/'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertBuild({fixture, texFileName: 'A/sub/s.tex', pdfFileName: 'A/main.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'auto-detect subfile root and build B1'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', true)
        await writeTeX('subfile', fixture, {fileDir: 'B/'})
        touch(path.resolve(fixture, 'A', 'empty'))
        await assertBuild({fixture, texFileName: 'B/sub/s.tex', pdfFileName: 'B/sub/s.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'auto-detect subfile root and build B2'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', false)
        await writeTeX('subfile', fixture, {fileDir: 'B/'})
        touch(path.resolve(fixture, 'A', 'empty'))
        await assertBuild({fixture, texFileName: 'B/sub/s.tex', pdfFileName: 'B/main.pdf', extension})
    })

    runTest({suiteName, fixtureName, testName: 'auto build with subfiles and onSave 1'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.run', 'onSave')
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', false)
        await writeTeX('subfile', fixture, {fileDir: 'A/'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertAutoBuild({fixture, texFileName: 'A/sub/s.tex', pdfFileName: 'A/main.pdf', extension}, ['onSave'])
    })

    runTest({suiteName, fixtureName, testName: 'auto build with subfiles and onSave 2'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.run', 'onSave')
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.doNotPrompt', true)
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.rootFile.useSubFile', true)
        await writeTeX('subfile', fixture, {fileDir: 'A/'})
        touch(path.resolve(fixture, 'B', 'empty'))
        await assertAutoBuild({fixture, texFileName: 'A/sub/s.tex', pdfFileName: 'A/sub/s.pdf', extension}, ['onSave'])
    })

    runTest({suiteName, fixtureName, testName: 'switching rootFile'}, async () => {
        await writeTeX('main', fixture, {fileName: 'A/main.tex'})
        await writeTeX('main', fixture, {fileName: 'B/main.tex'})
        assert.ok(extension)
        await assertRoot({fixture, openName: 'A/main.tex', rootName: 'A/main.tex', extension})
        await assertRoot({fixture, openName: 'B/main.tex', rootName: 'B/main.tex', extension})
        await assertRoot({fixture, openName: 'A/main.tex', rootName: 'A/main.tex', extension})
    })

    runTest({suiteName, fixtureName, testName: 'switching intellisense'}, async () => {
        await vscode.workspace.getConfiguration('latex-workshop').update('intellisense.citation.label', 'bibtex key')
        writeTestFile({fixture, fileName: 'A/main.tex'}, '\\documentclass{article}', '\\begin{document}', 'abc\\cite{}', '\\bibliography{A.bib}', '\\end{document}')
        writeTestFile({fixture, fileName: 'B/main.tex'}, '\\documentclass{article}', '\\begin{document}', 'abc\\cite{}', '\\bibliography{B.bib}', '\\end{document}')
        copyTestFile(fixture, '../arsenal/citation/main.bib', 'A/A.bib')
        copyTestFile(fixture, '../arsenal/citation/main.bib', 'B/B.bib')
        await extension.completer.citation.parseBibFile(path.resolve(fixture, 'A/A.bib'))
        await extension.completer.citation.parseBibFile(path.resolve(fixture, 'B/B.bib'))

        const docA = await vscode.workspace.openTextDocument(vscode.Uri.file(path.resolve(fixture, 'A/main.tex')))
        await vscode.window.showTextDocument(docA)
        await extension.manager.findRoot()

        const uri = vscode.window.activeTextEditor?.document.uri
        assert.ok(uri)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
        await vscode.workspace.getConfiguration('latex-workshop', workspaceFolder).update('intellisense.citation.label', 'title', vscode.ConfigurationTarget.WorkspaceFolder)

        const itemsA = getIntellisense(docA, new vscode.Position(2, 9), extension)
        assert.ok(itemsA)
        assert.strictEqual(itemsA.length, 3)
        assert.strictEqual(itemsA[0].label, 'A fake article')
        assert.ok(itemsA[0].filterText)
        assert.ok(itemsA[0].filterText.includes('Journal of CI tests'))
        assert.ok(!itemsA[0].filterText.includes('hintFake'))

        const docB = await vscode.workspace.openTextDocument(vscode.Uri.file(path.resolve(fixture, 'B/main.tex')))
        await vscode.window.showTextDocument(docB)
        await extension.manager.findRoot()
        const cache = extension.manager.getCachedContent(path.resolve(fixture, 'B/main.tex'))
        if (cache) {
            cache.bibs = [path.resolve(fixture, 'B/B.bib')]
        } else {
            return
        }

        const itemsB = getIntellisense(docB, new vscode.Position(2, 9), extension)
        assert.ok(itemsB)
        assert.strictEqual(itemsB.length, 3)
        assert.strictEqual(itemsB[0].label, 'art1')
    })
})

import * as vscode from 'vscode'
import {latexParser} from 'latex-utensils'

import {Extension} from '../../main'
import {IProvider} from './interface'

export interface Suggestion extends vscode.CompletionItem {
    type: 'glossary' | 'acronym'
}

export class Glossary implements IProvider {
    private readonly extension: Extension
    // use object for deduplication
    private readonly glossaries: {[id: string]: Suggestion} = {}
    private readonly acronyms: {[id: string]: Suggestion} = {}

    constructor(extension: Extension) {
        this.extension = extension
    }

    provideFrom(_type: string, result: RegExpMatchArray) {
        return this.provide(result)
    }

    private provide(result: RegExpMatchArray): vscode.CompletionItem[] {
        this.updateAll()
        let suggestions

        if (result[1] && result[1].match(/^[Gg]/)) {
            suggestions = this.glossaries
        } else {
            suggestions = this.acronyms
        }

        // Compile the suggestion object to array
        let keys = Object.keys(suggestions)
        keys = Array.from(new Set(keys))
        const items: vscode.CompletionItem[] = []
        for (const key of keys) {
            const gls = suggestions[key]
            if (gls) {
                items.push(gls)
            } else {
                items.push({label: key})
            }
        }
        return items
    }

    private getGlossaryFromNodeArray(nodes: latexParser.Node[]): Suggestion[] {
        const refs: Suggestion[] = []
        let description: string | undefined

        nodes.forEach(node => {
            if (latexParser.isCommand(node) && node.args.length > 0) {
                if (node.name === 'newglossaryentry' && node.args[0].kind === 'arg.group' && node.args[0].content[0].kind === 'text.string') {
                    const description: string | undefined = this.getGlossaryNodeDescription(node)
                    refs.push({
                        type: 'glossary',
                        label: node.args[0].content[0].content,
                        detail: description,
                        kind: vscode.CompletionItemKind.Reference
                    })
                } else if (node.name === 'newacronym' && node.args[0].kind === 'arg.group' && node.args[0].content[0].kind === 'text.string') {
                    const description: string | undefined = this.getAcronymNodeDetail(node)
                    refs.push({
                        type: 'acronym',
                        label: node.args[0].content[0].content,
                        detail: description,
                        kind: vscode.CompletionItemKind.Reference
                    })
                }
            }
        })
        return refs
    }

    /**
     * Parse the second entry of a \newacronym command
     *
     * Fairly straightforward, a \newacronym command takes the form
     *     \newacronym{lw}{LW}{LaTeX Workshop}
     *
     * Simply turn the third argument into a string.
     *
     * @param node the \newacronym node from the parser
     */
    private getAcronymNodeDetail(node: latexParser.Command): string | undefined {
        const arr: string[] = []
        if (node.args[2]?.kind === 'arg.group') {
            node.args[2].content.forEach(subNode => {
                if (subNode.kind === 'text.string') {
                    arr.push(subNode.content)
                }
            })
        }

        if (arr.length > 0) {
            return arr.join(' ')
        }
        return undefined
    }

    /**
     * Parse the description from a \newglossaryentry
     *
     * Example glossary entries:
     *     \newglossaryentry{lw}{name={LaTeX Workshop}, description={What this extension is}}
     *     \newglossaryentry{vscode}{name=VSCode, description=Editor}
     *
     * Note: descriptions can be single words or a {group of words}
     *
     * @param node the \newglossaryentry node from the parser
     * @returns the value of the description field
     */
    private getGlossaryNodeDescription(node: latexParser.Command): string | undefined {
        const arr: string[] = []
        let result: RegExpExecArray | null
        let lastNodeWasDescription = false

        if (node.args[1]?.kind === 'arg.group') {
            node.args[1].content.forEach(subNode => {
                if (subNode.kind === 'text.string') {
                    // check if we have a description of the form description=single_word
                    if ((result = /description=(.*)/.exec(subNode.content)) !== null) {
                        arr.push(result[1]) // possibly undefined
                        lastNodeWasDescription = true
                    }
                    // otherwise we might have description={group of words}
                } else if (lastNodeWasDescription && subNode.kind === 'arg.group') {
                    subNode.content.forEach(subSubNode => {
                        if (subSubNode.kind === 'text.string') {
                            arr.push(subSubNode.content)
                        }
                    })
                    lastNodeWasDescription = false
                }
            })
        }

        if (arr.length > 0) {
            return arr.join(' ')
        }
        return undefined
    }

    private updateAll() {
        // Extract cached references
        const refList: string[] = []

        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedRefs = this.extension.manager.cachedContent[cachedFile].element.glossary
            if (cachedRefs === undefined) {
                return
            }
            cachedRefs.forEach(ref => {
                if (ref.type === 'glossary') {
                    this.glossaries[ref.label] = ref
                } else {
                    this.acronyms[ref.label] = ref
                }
                refList.push(ref.label)
            })
        })

        // Remove references that has been deleted
        Object.keys(this.glossaries).forEach(key => {
            if (!refList.includes(key)) {
                delete this.glossaries[key]
            }
        })
        Object.keys(this.acronyms).forEach(key => {
            if (!refList.includes(key)) {
                delete this.acronyms[key]
            }
        })
    }

    /**
     * Update the Manager cache for references defined in `file` with `nodes`.
     * If `nodes` is `undefined`, `content` is parsed with regular expressions,
     * and the result is used to update the cache.
     * @param file The path of a LaTeX file.
     * @param nodes AST of a LaTeX file.
     * @param content The content of a LaTeX file.
     */
    update(file: string, nodes?: latexParser.Node[], content?: string) {
        if (nodes !== undefined) {
            this.extension.manager.cachedContent[file].element.glossary = this.getGlossaryFromNodeArray(nodes)
        } else if (content !== undefined) {
            this.extension.manager.cachedContent[file].element.glossary = [] // TODO: implement regex parser
        }
    }
}

import { parse } from "handlebars/compiler/base";
import { Stack, unwrap } from "glimmer-util";
import * as Node from "./builders";
import { Node as INode, isSourceLocation } from "./builders";
import * as syntax from "./syntax";
import * as HBS from "./parser/handlebars-ast"
import EventedTokenizer from "simple-html-tokenizer/evented-tokenizer";
import EntityParser from "simple-html-tokenizer/entity-parser";
import namedCharRefs from "simple-html-tokenizer/html5-named-char-refs";
import { HandlebarsNodeVisitor, PrintableMustache } from "./parser/handlebars-node-visitors";
import { TokenizerEventHandlers, ElementBuilder } from "./parser/tokenizer-event-handlers";

export function preprocess(html, options?): Node.Program {
  let ast = (typeof html === 'object') ? html : parse(html);
  let combined = new Parser(html, options).Program(ast);

  if (options && options.plugins && options.plugins.ast) {
    for (let i = 0, l = options.plugins.ast.length; i < l; i++) {
      let plugin = new options.plugins.ast[i](options);

      plugin.syntax = syntax;

      combined = plugin.transform(combined);
    }
  }

  return combined;
}

export default preprocess;

const entityParser = new EntityParser(namedCharRefs);

export class Parser extends HandlebarsNodeVisitor {
  private source: string[];
  protected elementStack = new Stack<ElementBuilder>();

  constructor(source: string, options: Object) {
    super();

    this.tokenizer = new EventedTokenizer(this, entityParser);

    if (typeof source === 'string') {
      this.source = source.split(/(?:\r\n?|\n)/g);
    }
  }

  acceptNode(node: HBS.Node) {
    this[node.type](node);
  }

  acceptParam<T extends HBS.Param | HBS.Hash>(node: T): T {
    return this[node.type](node);
  }

  currentElement(): ElementBuilder {
    return unwrap(this.elementStack.current);
  }

  sourceForMustache(mustache: PrintableMustache): string {
    let loc = mustache.loc;

    if (!isSourceLocation(loc)) {
      throw new Error('Cannot reconstruct the source for a synthesized mustache');
    } else {
      let firstLine = loc.start.line - 1;
      let lastLine = loc.end.line - 1;
      let currentLine = firstLine - 1;
      let firstColumn = loc.start.column + 2;
      let lastColumn = loc.end.column - 2;
      let string = [];
      let line;

      if (!this.source) {
        return '{{' + mustache.path.original + '}}';
      }

      while (currentLine < lastLine) {
        currentLine++;
        line = this.source[currentLine];

        if (currentLine === firstLine) {
          if (firstLine === lastLine) {
            string.push(line.slice(firstColumn, lastColumn));
          } else {
            string.push(line.slice(firstColumn));
          }
        } else if (currentLine === lastLine) {
          string.push(line.slice(0, lastColumn));
        } else {
          string.push(line);
        }
      }

      return string.join('\n');
    }

  }

}

// for (let key in handlebarsNodeVisitors) {
//   Parser.prototype[key] = handlebarsNodeVisitors[key];
// }

// for (let key in tokenizerEventHandlers) {
//   Parser.prototype[key] = tokenizerEventHandlers[key];
// }

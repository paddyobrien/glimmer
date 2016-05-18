import { Stack, unwrap } from "glimmer-util";
import { fromHBS as hbs, builders as b, Node as INode } from "../builders";
import * as Node from "../builders";
import { TokenizerEventHandlers, AttributeBuilder, ElementBuilder, TagBuilder, StartTagBuilder } from "./tokenizer-event-handlers";
import * as AST from "./handlebars-ast";
import { SYNTHESIZED_LOC, formatLocation, locFromHBS } from '../ast';

class Fragment implements Node.HasChildren {
  constructor(private children: Node.StatementNode[] = []) {}

  appendChild(statement: Node.StatementNode) {
    this.children.push(statement);
  }
}

export type PrintableMustache = Node.CallNode | AST.Call | Node.Mustache | Node.Block;

export abstract class HandlebarsNodeVisitor extends TokenizerEventHandlers {
  protected abstract acceptNode(node: AST.Node): void;
  protected abstract acceptParam<T extends AST.Param | AST.Hash>(node: T): T;
  protected abstract sourceForMustache(mustache: PrintableMustache): string;

  protected parentStack = new Stack<Node.HasChildren>();

  protected currentParent(): Node.HasChildren {
    return unwrap(this.parentStack.current);
  }

  Program(rawProgram: AST.Program): Node.Program {
    if (rawProgram.body.length === 0) { return hbs.program(rawProgram); }

    let program: AST.Program = Object.assign({}, rawProgram, { body: [] });
    let node = hbs.program(program);

    this.parentStack.push(node);

    let topNode = this.elementStack.current;

    rawProgram.body.forEach(n => this.acceptNode(n));

    // Ensure that that the element stack is balanced properly.
    let newTopNode = this.elementStack.current;
    if (topNode !== newTopNode) {
      let element = unwrap(newTopNode as ElementBuilder).toElementNode(this.tokenizer);
      throw new Error(`Unclosed element '${element.tag}' (${formatLocation(element._loc)}).`);
    }

    this.parentStack.pop();

    return node;
  }

  BlockStatement(block: AST.Block) {
    if (this.tokenizer.state === 'comment') {
      this.appendToCommentData('{{' + this.sourceForMustache(block) + '}}');
    }

    if (this.tokenizer.state !== 'comment' && this.tokenizer.state !== 'data' && this.tokenizer.state !== 'beforeData') {
      throw new Error("A block may only be used inside an HTML element or another block.");
    }

    let { path, params, hash } = this.acceptCall(block);

    let program = block.program && this.Program(block.program);
    let inverse = block.inverse && this.Program(block.inverse);

    let node = new Node.Block(hbs.path(path), hbs.args(params, hash), program, inverse, false).hbs(block);

    this.appendChild(node);

    return node;
  }

  MustacheStatement(rawMustache: AST.Mustache): Node.Mustache | null {
    let tokenizer = this.tokenizer;

    if (tokenizer.state === 'comment') {
      this.appendToCommentData('{{' + this.sourceForMustache(rawMustache) + '}}');
      return null;
    }

    let mustache = hbs.mustache(this.acceptCall(rawMustache));

    switch (tokenizer.state) {
      // Tag helpers
      case "tagName":
        unwrap(this.currentNodeAs(StartTagBuilder)).modifier(mustache, this.tokenizer);
        tokenizer.state = "beforeAttributeName";
        break;
      case "beforeAttributeName":
        unwrap(this.currentNodeAs(StartTagBuilder)).modifier(mustache, this.tokenizer);
        break;
      case "attributeName":
      case "afterAttributeName":
        this.beginAttributeValue(false);
        this.finishAttributeValue();
        unwrap(this.currentNodeAs(StartTagBuilder)).modifier(mustache, this.tokenizer);
        tokenizer.state = "beforeAttributeName";
        break;
      case "afterAttributeValueQuoted":
        unwrap(this.currentNodeAs(StartTagBuilder)).modifier(mustache, this.tokenizer);
        tokenizer.state = "beforeAttributeName";
        break;

      // Attribute values
      case "beforeAttributeValue":
        tokenizer.state = 'attributeValueUnquoted';
      /* falls through */
      case "attributeValueDoubleQuoted":
      case "attributeValueSingleQuoted":
      case "attributeValueUnquoted":
        unwrap(this.currentNodeAs(StartTagBuilder)).appendToAttributeValue(mustache, this.tokenizer);
        break;

      // TODO: Only append child when the tokenizer state makes
      // sense to do so, otherwise throw an error.
      default:
        this.appendChild(mustache);
    }

    return mustache;
  }

  ContentStatement(content: AST.Content) {
    let changeLines = 0;

    if (content.rightStripped) {
      changeLines = leadingNewlineDifference(content.original, content.value);
    }

    this.tokenizer.line = content.loc.start.line + changeLines;
    this.tokenizer.column = changeLines ? 0 : content.loc.start.column;

    this.tokenizer.tokenizePart(content.value);
    this.tokenizer.flushData();
  }

  CommentStatement(comment: AST.Comment): Node.SourceComment {
    return hbs.comment(comment);
  }

  PartialStatement(partial: AST.Partial): Node.Partial {
    return this.appendChild(hbs.partial(partial));
  }

  SubExpression(sexpr: AST.SubExpression): Node.Sexpr {
    let e = this.acceptCall(sexpr);
    return hbs.sexpr(e);
  }

  PathExpression(path: AST.Path): AST.Path {
    let { original, data, parts, loc } = path;

    if (original.indexOf('/') !== -1) {
      // TODO add a SyntaxError with loc info
      if (original.slice(0, 2) === './') {
        throw new Error(`Using "./" is not supported in Glimmer and unnecessary: "${path.original}" on line ${loc.start.line}.`);
      }
      if (original.slice(0, 3) === '../') {
        throw new Error(`Changing context using "../" is not supported in Glimmer: "${path.original}" on line ${loc.start.line}.`);
      }
      if (original.indexOf('.') !== -1) {
        throw new Error(`Mixing '.' and '/' in paths is not supported in Glimmer; use only '.' to separate property paths: "${path.original}" on line ${loc.start.line}.`);
      }
      parts = [ path.parts.join('/') ];
    }

    return { type: 'PathExpression', data, original, parts, depth: 0, loc };
  }

  Hash(hash: AST.Hash): AST.Hash {
    let pairs: AST.HashPair[] = hash.pairs.map(pair => {
      let value = this.acceptParam(pair.value);
      return Object.assign({}, pair, { value });
    });

    return Object.assign({}, hash, { pairs });
  }

  StringLiteral(literal: AST.String): AST.String {
    return literal;
  }

  BooleanLiteral(literal: AST.Boolean): AST.Boolean {
    return literal;
  }

  NumberLiteral(literal: AST.Number): AST.Number {
    return literal;
  }

  UndefinedLiteral(literal: AST.Undefined): AST.Undefined {
    return literal;
  }

  NullLiteral(literal: AST.Null): AST.Null {
    return literal;
  }

  private acceptCall<T extends AST.Call>(node: T): T {
    let path = this.PathExpression(node.path);
    let params: AST.Param[], hash: AST.Hash;

    if (node.params) {
      params = node.params.map(p => this.acceptParam(p));
    } else {
      params = [];
    }

    if (node.hash) {
      hash = this.acceptParam(node.hash);
    } else {
      hash = { type: 'Hash', pairs: [], loc: null };
    }

    return Object.assign({}, node, { path, params, hash });
  }

};

function leadingNewlineDifference(original: string, value: string) {
  if (value === '') {
    // if it is empty, just return the count of newlines
    // in original
    return original.split("\n").length - 1;
  }

  // otherwise, return the number of newlines prior to
  // `value`
  let difference = original.split(value)[0];
  let lines = difference.split(/\n/);

  return lines.length - 1;
}


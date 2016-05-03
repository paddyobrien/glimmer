import { Stack, voidMap } from 'glimmer-util';
import { builders as b, StatementNode, ExpressionNode, Node as INode, Location } from "../builders";
import * as Node from "../builders";
import { parseElementBlockParams, unwrapMustache } from "../utils";
import Tokenizer from "simple-html-tokenizer/evented-tokenizer";

type FIXME = any;

enum Parser {
  StartTag,
  EndTag,
  Attribute
}

interface ParserNode extends INode {
  type: Parser;
  loc: Node.Location;
}

export abstract class Tag implements ParserNode {
  abstract type: Parser;

  constructor(
    public name: string,
    public attributes: Node.Attr[],
    public modifiers: Node.Mustache[],
    public selfClosing: boolean,
    public loc: Location
  ) {
  }

  appendModifier(mustache: Node.Mustache) {
    this.modifiers.push(mustache);
  }
}

export class StartTag extends Tag {
  static begin(): StartTag {
    return new StartTag('', [], [], false, null);
  }

  public type = Parser.StartTag;
}

export class EndTag extends Tag {
  static begin(): EndTag {
    return new EndTag('', [], [], false, null);
  }

  public type = Parser.EndTag;
}

export class Attribute implements ParserNode {
  static begin(pos: Node.RawPosition): Attribute {
    return new Attribute("", [], false, false, b.loc(pos, null, null));
  }

  public type = Parser.Attribute;
  private currentText: Node.Text = null;

  constructor(
    public name: string,
    public parts: StatementNode[],
    public isQuoted: boolean,
    public isDynamic: boolean,
    public loc: Location
  ) {
  }

  pushMustache(mustache: Node.Mustache) {
    this.isDynamic = true;
    this.parts.push(mustache);
    this.currentText = null;
  }

  pushChar(char: string) {
    if (this.currentText) {
      this.currentText.chars += char;
    } else {
      let text = this.currentText = b.text(char, null);
      this.parts.push(text);
    }
  }
}

export abstract class TokenizerEventHandlers {
  protected abstract currentElement<T extends Node.Element>(): T;
  protected abstract currentParent(): Node.HasChildren;
  protected abstract elementStack: Stack<Node.Element>;
  protected abstract parentStack: Stack<Node.HasChildren>;

  protected currentNode: StatementNode | ParserNode;
  protected currentAttribute: Attribute;
  protected tokenizer: Tokenizer;

  constructor() {
    this.reset();
  }

  reset() {
    this.currentNode = null;
    this.currentAttribute = null;
  }

  // Utils

  currentNodeAs<T extends StatementNode | ParserNode>(): T {
    return this.currentNode as T;
  }

  pushElement(element: Node.Element) {
    this.elementStack.push(element);
    this.parentStack.push(element);
  }

  popElement(): Node.Element {
    let element = this.elementStack.pop();
    this.parentStack.pop();
    return element;
  }

  appendChild<T extends Node.StatementNode>(child: T): T {
    this.parentStack.current.appendChild(child);
    return child;
  }

  // Comment

  beginComment() {
    this.currentNode = b.comment("", {
      source: null,
      start: b.pos(this.tokenizer),
      end: null
    });
  }

  appendToCommentData(char: string) {
    this.currentNodeAs<Node.Comment>().value += char;
  }

  finishComment() {
    this.currentNode.loc.end = b.pos(this.tokenizer);
    this.appendChild(this.currentNodeAs<Node.Comment>());
  }

  // Data

  beginData() {
    this.currentNode = b.text('', {
      source: null,
      start: b.pos(this.tokenizer),
      end: null
    });
  }

  appendToData(char: string) {
    this.currentNodeAs<Node.Text>().chars += char;
  }

  finishData() {
    this.currentNode.loc.end = b.pos(this.tokenizer);
    this.appendChild(this.currentNodeAs<Node.Text>());
  }

  // Tags - basic

  beginStartTag() {
    this.currentNode = StartTag.begin();
  }

  beginEndTag() {
    this.currentNode = EndTag.begin();
  }

  finishTag() {
    let { tagLine, tagColumn, line, column } = this.tokenizer;

    let tag = this.currentNodeAs<Tag>();
    tag.loc = b.loc({ line: tagLine, column: tagColumn }, this.tokenizer);

    if (tag.type === Parser.StartTag) {
      this.finishStartTag();

      if (voidMap.hasOwnProperty(tag.name) || tag.selfClosing) {
        this.finishEndTag(true);
      }
    } else if (tag.type === Parser.EndTag) {
      this.finishEndTag(false);
    }
  }

  finishStartTag() {
    let { tokenizer } = this;
    let { name, attributes, modifiers } = this.currentNodeAs<StartTag>();

    let start = b.pos({ line: tokenizer.tagLine, column: tokenizer.tagColumn });
    let loc = b.loc(start, null, null);
    let element = b.element(name, attributes, null, modifiers, null, loc);
    this.elementStack.push(element);
  }

  finishEndTag(isVoid: boolean) {
    let tag = this.currentNodeAs<Tag>();

    let element = this.elementStack.pop();

    validateEndTag(tag, element, isVoid);

    element.loc.end = b.pos(this.tokenizer);

    parseElementBlockParams(element);
    this.appendChild(element);
  }

  markTagAsSelfClosing() {
    this.currentNodeAs<StartTag>().selfClosing = true;
  }

  // Tags - name

  appendToTagName(char: string) {
    this.currentNodeAs<Tag>().name += char;
  }

  // Tags - attributes

  beginAttribute() {
    let tag = this.currentNodeAs<EndTag>();
    if (tag.type === Parser.EndTag) {
       throw new Error(
        `Invalid end tag: closing tag must not have attributes, ` +
        `in \`${tag.name}\` (on line ${this.tokenizer.line}).`
      );
    }

    this.currentAttribute = Attribute.begin(this.tokenizer);
  }

  appendToAttributeName(char: string) {
    this.currentAttribute.name += char;
  }

  beginAttributeValue(isQuoted: boolean) {
    this.currentAttribute.isQuoted = isQuoted;
  }

  appendToAttributeValue(char: string) {
    this.currentAttribute.pushChar(char);
  }

  finishAttributeValue() {
    let { name, parts, isQuoted, isDynamic, loc } = this.currentAttribute;
    let value = assembleAttributeValue(parts, isQuoted, isDynamic, this.tokenizer.line);

    loc.end = b.pos(this.tokenizer);

    let attribute = b.attr(name, value, loc);

    this.currentNodeAs<Tag>().attributes.push(attribute);
  }
};

function assembleAttributeValue(parts, isQuoted, isDynamic, line) {
  if (isDynamic) {
    if (isQuoted) {
      return assembleConcatenatedValue(parts);
    } else {
      if (parts.length === 1) {
        return parts[0];
      } else {
        throw new Error(
          `An unquoted attribute value must be a string or a mustache, ` +
          `preceeded by whitespace or a '=' character, and ` +
          `followed by whitespace or a '>' character (on line ${line})`
        );
      }
    }
  } else {
    return b.text((parts.length > 0) ? parts[0] : "", null);
  }
}

export default TokenizerEventHandlers;

function assembleConcatenatedValue(parts: (StatementNode | string)[]) {
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];

    if (typeof part === 'string') {
      parts[i] = b.text(part, null);
    } else {
      if (part.type !== Node.Statement.Mustache) {
        throw new Error("Unsupported node in quoted attribute value: " + part.type);
      }
    }
  }

  return b.concat(parts as StatementNode[]);
}

function validateEndTag(tag: Tag, element: Node.Element, selfClosing: boolean) {
  let error;

  if (voidMap[tag.name] && !selfClosing) {
    // EngTag is also called by StartTag for void and self-closing tags (i.e.
    // <input> or <br />, so we need to check for that here. Otherwise, we would
    // throw an error for those cases.
    error = "Invalid end tag " + formatEndTagInfo(tag) + " (void elements cannot have end tags).";
  } else if (element.tag === undefined) {
    error = "Closing tag " + formatEndTagInfo(tag) + " without an open tag.";
  } else if (element.tag !== tag.name) {
    error = "Closing tag " + formatEndTagInfo(tag) + " did not match last open tag `" + element.tag + "` (on line " +
            element.loc.start.line + ").";
  }

  if (error) { throw new Error(error); }
}

function formatEndTagInfo(tag: Tag) {
  return "`" + tag.name + "` (on line " + tag.loc.end.line + ")";
}

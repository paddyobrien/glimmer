import { Constructor, Option, Stack, unwrap, voidMap } from 'glimmer-util';
import { HbsToLoc, locFromHBS, SourceLocation, Location as GlimmerLocation, SourceFile, Position } from '../ast';
import { parseElementBlockParams, unwrapMustache } from "../utils";
import Tokenizer from "simple-html-tokenizer/evented-tokenizer";

import { builders as b, StatementNode, ExpressionNode, Node as INode, Location } from "../builders";
import * as Node from "../builders";
import { fromHBS as hbs } from "../builders";
import * as HBS from "../parser/handlebars-ast";

enum Parser {
  StartTag,
  EndTag,
  Element,
  Attribute,
  AttributeValue,
  Text,
  Comment
}

interface ParserNode extends INode {
  type: Parser;
}

export class LocationBuilder {
  static start(start: HBS.Position): LocationBuilder {
    let builder = new LocationBuilder();
    builder.start(hbs.position(start));
    return builder;
  }

  static fromTokenizer(tokenizer: Tokenizer): LocationBuilder {
    return LocationBuilder.start(tokenizer);
  }

  static fromHBS(loc: HbsToLoc): LocationBuilder {
    let location = locFromHBS(loc);
    if (location === Node.SYNTHESIZED) {
      return new LocationBuilder();
    } else if (location === Node.UNNEEDED) {
      throw new Error("Don't try to build a location from a non-contiguous node.")
    } else {
      let l = location as SourceLocation;
      let builder = new LocationBuilder();
      builder.source(l.source);
      builder.start(l.start);
      builder.end(l.end);
      return builder;
    }
  }

  private _source: Option<SourceFile> = null;
  private _start: Option<Position> = null;
  private _end: Option<Position> = null;

  source(source: SourceFile): LocationBuilder {
    this._source = source;
    return this;
  }

  fork(): LocationBuilder {
    let b = new LocationBuilder();
    b._source = this._source;
    b._start = this._start;
    return b;
  }

  start(start: Position): LocationBuilder {
    this._start = start;
    return this;
  }

  end(end: HBS.Position): LocationBuilder {
    this._end = hbs.position(end);
    return this;
  }

  toLocation(): GlimmerLocation {
    if (this._start && !this._end) {
      throw new Error(`BUG: Location has a start (${this._start.line}:${this._start.column}) but no end.`);
    }

    if (!this._start && this._end) {
      throw new Error(`BUG: Location has an end (${this._end.line}:${this._end.column}) but no start.`);
    }

    if (this._start && this._end) {
      return new SourceLocation(this._source || Node.SYNTHESIZED_SOURCE, this._start, this._end);
    } else {
      return Node.SYNTHESIZED;
    }
  }
}

class HasChars {
  protected _chars: string = '';

  pushChar(char: string, tokenizer: Tokenizer) {
    if (!this._chars) {
      this._chars = char;
    } else {
      this._chars += char;
    }
  }
}

class CharsBuilder extends HasChars {
  constructor(protected _loc: LocationBuilder) {
    super();
  }

  pushChar(char: string, tokenizer: Tokenizer) {
    super.pushChar(char, tokenizer);
    this._loc.end(tokenizer);
  }
}

abstract class ContentBuilder<T extends INode> extends HasChars implements ParserNode {
  public type: Parser;

  constructor(protected _loc: LocationBuilder = new LocationBuilder()) {
    super();
  }

  start(pos: Position) {
    this._loc.start(pos);
  }

  abstract toContentNode(tokenizer: Tokenizer): T;
}

export class TextBuilder extends ContentBuilder<Node.Text> {
  static fromTokenizer(tokenizer: Tokenizer): TextBuilder {
    return new TextBuilder(LocationBuilder.fromTokenizer(tokenizer));
  }

  toContentNode(tokenizer: Tokenizer): Node.Text {
    this._loc.end(tokenizer);
    return b.text(this._chars).location(this._loc.toLocation());
  }
}

export class CommentBuilder extends ContentBuilder<Node.Comment> {
  static fromTokenizer(tokenizer: Tokenizer): CommentBuilder {
    return new CommentBuilder(LocationBuilder.fromTokenizer(tokenizer));
  }

  toContentNode(tokenizer: Tokenizer): Node.Comment {
    return b.comment(this._chars).location(this._loc.end(tokenizer).toLocation());
  }
}

export class AttributeBuilder implements ParserNode {
  static open(tokenizer: Tokenizer): AttributeBuilder {
    return new AttributeBuilder(LocationBuilder.fromTokenizer(tokenizer));
  }

  public type = Parser.Attribute;
  private isDynamic = false;
  private nameBuilder: TextBuilder;
  private name: Option<Node.Text>;
  private valueBuilder: Option<AttributeValueBuilder> = null;
  private value: Option<Node.Concat> = null;

  constructor(
    private _loc: LocationBuilder,
    private _isQuoted: Option<boolean> = null
  ) {
    this.nameBuilder = new TextBuilder(_loc.fork());
  }

  appendToName(char: string, tokenizer: Tokenizer) {
    this.nameBuilder.pushChar(char, tokenizer);
  }

  finishName(tokenizer: Tokenizer) {
    this.name = this.nameBuilder.toContentNode(tokenizer)
  }

  markAsQuoted(isQuoted: boolean) {
    this._isQuoted = isQuoted;
  }

  appendToValue(part: string | Node.Mustache, tokenizer: Tokenizer) {
    if (typeof part === 'string') {
      this.pushChar(part, tokenizer);
    } else {
      this.pushMustache(part, tokenizer);
    }
  }

  pushMustache(mustache: Node.Mustache, tokenizer: Tokenizer) {
    this.isDynamic = true;

    let valueBuilder: AttributeValueBuilder = this.valueBuilder = this.valueBuilder || new AttributeValueBuilder(LocationBuilder.fromTokenizer(tokenizer));
    valueBuilder.pushMustache(mustache, tokenizer);
  }

  pushChar(char: string, tokenizer: Tokenizer) {
    let valueBuilder: AttributeValueBuilder = this.valueBuilder = this.valueBuilder || new AttributeValueBuilder(LocationBuilder.fromTokenizer(tokenizer));
    valueBuilder.pushChar(char, tokenizer);
  }

  finishValue(line: number, column: number) {
    this.value = unwrap(this.valueBuilder).toValue(tokenizer);
  }

  toAttributeNode(tokenizer: Tokenizer): Node.Attr {
    return b.attr(unwrap(this.name).chars, unwrap(this.value)).location(this._loc.end(tokenizer).toLocation());
  }
};

export class AttributeValueBuilder implements ParserNode {
  public type = Parser.AttributeValue;

  private currentPart: Option<TextBuilder> = null;
  private parts: (Node.Text | Node.Mustache)[] = [];

  constructor(private _loc: LocationBuilder) {}

  pushChar(char: string, tokenizer: Tokenizer) {
    if (this.currentPart) {
      this.currentPart.pushChar(char, tokenizer);
    } else {
      let part = this.currentPart = TextBuilder.fromTokenizer(tokenizer);
      part.pushChar(char, tokenizer);
    }
  }

  pushMustache(part: Node.Mustache, tokenizer: Tokenizer) {
    let current = this.currentPart;

    if (current) {
      this.parts.push(current.toContentNode(tokenizer));
      this.currentPart = null;
    }

    this.parts.push(part);
  }

  toValue({ line, column }: HBS.Position): Node.Concat {
    let loc = this._loc.end({ line, column }).toLocation();
    return b.concat(this.parts).location(loc);
  }
}

export class ElementBuilder implements ParserNode, Node.HasChildren {
  public type = Parser.Element;
  private currentAttribute: Option<AttributeBuilder> = null;

  constructor(
    private _name: string,
    private _attributes: Node.Attr[],
    private _modifiers: Node.Mustache[],
    private _loc: LocationBuilder,
    private _blockParams: string[] = [],
    private _children: Node.StatementNode[] = []
  ) {
  }

  pushModifier(modifier: Node.Mustache) {
    this._modifiers.push(modifier);
  }

  appendChild(statement: Node.StatementNode) {
    this._children.push(statement);
  }

  toElementNode(tokenizer: Tokenizer): Node.Element {
    let loc = this._loc.end(tokenizer).toLocation();
    return b.element(this._name, this._attributes, this._blockParams, this._modifiers, this._children).location(loc);
  }

  debug(): string {
    return `<${this._name}>`
  }
}

export abstract class TagBuilder implements ParserNode {
  public type: Parser;

  constructor(protected _name: string) {}

  appendToName(char: string) {
    this._name += char;
  }

  abstract pushElement(tokenizer: Tokenizer, parser: TokenizerEventHandlers);
  abstract debug(): string;
}

export class StartTagBuilder extends TagBuilder implements ParserNode {
  static open(): StartTagBuilder {
    return new StartTagBuilder('', [], [], null);
  }

  public type = Parser.StartTag;
  private currentAttribute: Option<AttributeBuilder> = null;

  constructor(
    protected _name: string,
    private _attributes: Node.Attr[],
    private _modifiers: Node.Mustache[],
    private _selfClosing: Option<boolean>
  ) {
    super(_name);
  }

  openAttribute(tokenizer: Tokenizer) {
    let attr = AttributeBuilder.open(tokenizer);
    this.currentAttribute = attr;
  }

  appendToAttributeName(char: string, tokenizer: Tokenizer) {
    unwrap(this.currentAttribute).appendToName(char, tokenizer);
  }

  finishAttributeName(tokenizer: Tokenizer) {
    unwrap(this.currentAttribute).finishName(tokenizer);
  }

  appendToAttributeValue(char: string | Node.Mustache, tokenizer: Tokenizer) {
    unwrap(this.currentAttribute).appendToValue(char, tokenizer);
  }

  finishAttributeValue(line: number, column: number, tokenizer: Tokenizer) {
    unwrap(this.currentAttribute).finishValue(tokenizer);
  }

  attributeQuoting(quoting: boolean) {
    unwrap(this.currentAttribute).markAsQuoted(quoting);
  }

  closeAttribute(tokenizer: Tokenizer) {
    let attribute = unwrap(this.currentAttribute).toAttributeNode(tokenizer);
    this._attributes.push(attribute);
    this.currentAttribute = null;
  }

  modifier(mustache: Node.Mustache, tokenizer: Tokenizer) {
    let x: number = NaN;
    this._modifiers.push(mustache);
  }

  markSelfClosing() {
    this._selfClosing = true;
  }

  private isVoid(): boolean {
    return this._selfClosing || voidMap[this._name];
  }

  pushElement(tokenizer: Tokenizer, parser: TokenizerEventHandlers) {
    let loc = LocationBuilder.start({ line: tokenizer.tagLine, column: tokenizer.tagColumn }).end(tokenizer);
    let element = new ElementBuilder(this._name, this._attributes, this._modifiers, loc);

    // TODO: block params in the tokenizer
    if (this.isVoid()) {
      parser.appendChild(element.toElementNode(tokenizer));
    } else {
      parser.pushElement(element);
    }
  }

  debug(): string {
    return `<${this._name}>`;
  }
}

export class EndTagBuilder extends TagBuilder implements ParserNode {
  static open(): EndTagBuilder {
    return new EndTagBuilder('');
  }

  public type = Parser.EndTag;

  constructor(protected _name: string) {
    super(_name);
  }

  pushElement(tokenizer: Tokenizer, parser: TokenizerEventHandlers) {
    // TODO validateEndTag
    debugger;
    let element = unwrap(parser.popElement()).toElementNode(tokenizer);
    parser.appendChild(element);
  }

  debug(): string {
    return `</${this._name}>`;
  }
}

export abstract class TokenizerEventHandlers {
  protected abstract currentElement(): Option<ElementBuilder>;
  protected abstract currentParent(): Node.HasChildren;
  protected abstract elementStack: Stack<ElementBuilder>;
  protected abstract parentStack: Stack<Node.HasChildren>;

  protected currentNode: Option<StatementNode | ParserNode>;
  protected tokenizer: Tokenizer;

  constructor() {
    this.reset();
  }

  reset() {
    this.currentNode = null;
  }

  // Utils

  currentNodeAs<T>(predicate: Constructor<T>): Option<T>;
  currentNodeAs<T>(predicate: (value: any) => value is T): Option<T>;
  currentNodeAs<T>(predicate: any): Option<T>;

  currentNodeAs(predicate) {
    if (this.currentNode instanceof predicate || predicate(this.currentNode)) {
      return this.currentNode;
    } else {
      return null;
    }
  }

  pushElement(element: ElementBuilder) {
    this.elementStack.push(element);
    this.parentStack.push(element);
  }

  popElement(): Option<ElementBuilder> {
    let element = this.elementStack.pop();
    this.parentStack.pop();
    return element;
  }

  appendChild<T extends Node.StatementNode>(child: T): T {
    unwrap(this.parentStack.current).appendChild(child);
    return child;
  }

  // Comment

  beginComment() {
    this.currentNode = CommentBuilder.fromTokenizer(this.tokenizer);
  }

  appendToCommentData(char: string) {
    unwrap(this.currentNodeAs(CommentBuilder)).pushChar(char, this.tokenizer);
  }

  finishComment() {
    let comment = unwrap(this.currentNodeAs(CommentBuilder)).toContentNode(this.tokenizer);
    this.appendChild(comment);
  }

  // Data

  beginData() {
    this.currentNode = TextBuilder.fromTokenizer(this.tokenizer);
  }

  appendToData(char: string) {
    unwrap(this.currentNodeAs(TextBuilder)).pushChar(char, this.tokenizer);
  }

  finishData() {
    let text = unwrap(this.currentNodeAs(TextBuilder)).toContentNode(this.tokenizer);
    this.appendChild(text);
  }

  // Tags - basic

  beginStartTag() {
    this.currentNode = StartTagBuilder.open();
  }

  beginEndTag() {
    this.currentNode = EndTagBuilder.open();
  }

  finishTag() {
    let { tagLine, tagColumn, line, column } = this.tokenizer;

    let tag = unwrap(this.currentNodeAs<TagBuilder>(TagBuilder));
    let node = tag.pushElement(this.tokenizer, this);
  }

  markTagAsSelfClosing() {
    unwrap(this.currentNodeAs(StartTagBuilder)).markSelfClosing();
  }

  // Tags - name

  appendToTagName(char: string) {
    unwrap(this.currentNodeAs<TagBuilder>(TagBuilder)).appendToName(char);
  }

  // Tags - attributes

  private get currentStartTag(): StartTagBuilder {
    let tag = this.currentNodeAs(StartTagBuilder);

    if (tag) {
      return tag;
    } else {
      let tag = unwrap(this.currentNodeAs(EndTagBuilder));

       throw new Error(
        `Invalid end tag: closing tag must not have attributes, ` +
        `in \`${tag.debug()}\` (on line ${this.tokenizer.line}).`
      );
    }
  }

  private get currentTag(): TagBuilder {
    return unwrap(this.currentNodeAs<TagBuilder>(TagBuilder));
  }

  beginAttribute() {
    this.currentStartTag.openAttribute(this.tokenizer);
  }

  appendToAttributeName(char: string) {
    this.currentStartTag.appendToAttributeName(char, this.tokenizer);
  }

  finishAttributeName() {
    this.currentStartTag.finishAttributeName(this.tokenizer);
  }

  beginAttributeValue(isQuoted: boolean) {
    this.currentStartTag.attributeQuoting(isQuoted);
  }

  appendToAttributeValue(char: string) {
    this.currentStartTag.appendToAttributeValue(char, this.tokenizer);
  }

  finishAttributeValue(line: number, column: number) {
    this.currentStartTag.finishAttributeValue(line, column, this.tokenizer);
  }
};

export default TokenizerEventHandlers;

// function validateEndTag(tag: Tag, element: Node.Element, selfClosing: boolean) {
//   let error;

//   if (voidMap[tag.name] && !selfClosing) {
//     // EngTag is also called by StartTag for void and self-closing tags (i.e.
//     // <input> or <br />, so we need to check for that here. Otherwise, we would
//     // throw an error for those cases.
//     error = "Invalid end tag " + formatEndTagInfo(tag) + " (void elements cannot have end tags).";
//   } else if (element.tag === undefined) {
//     error = "Closing tag " + formatEndTagInfo(tag) + " without an open tag.";
//   } else if (element.tag !== tag.name) {
//     error = "Closing tag " + formatEndTagInfo(tag) + " did not match last open tag `" + element.tag + "` (on line " +
//             element.loc.start.line + ").";
//   }

//   if (error) { throw new Error(error); }
// }

// function formatEndTagInfo(tag: Tag) {
//   return "`" + tag.name + "` (on line " + tag.loc.end.line + ")";
// }

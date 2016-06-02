import { DelegateOptions, Delegate, Position, Char } from 'simple-html-tokenizer';
import {
  QUOTE,
  TokenBuilder,
  DataToken,
  DataTokenBuilder,
  CommentToken,
  CommentTokenBuilder,
  OpenedElementBuilder,
  ElementBuilder,
  ElementToken,
  OpenTagBuilder,
  OpenTagToken,
  CloseTagBuilder,
  CloseTagToken,
  TagNameToken,
  TagNameTokenBuilder,
  AttributeBuilder,
  Attribute,
  AttributeNameTokenBuilder,
  AttributeNameToken,
  AttributeValueTokenBuilder,
  AttributeValueToken,
  InnerAttributeValueTokenBuilder,
  InnerAttributeValueToken,
  loc
} from './tokens';
import TreeBuilder from './html-parser';

export abstract class ParserState {
  public name: string;

  beginData(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'beginData');
  }

  appendToData(builder: TreeBuilder, pos: Position, char: Char): void {
    illegal(this.name, 'appendToData');
  }

  finishData(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'finishData');
  }

  openStartTag(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'openStartTag');
  }

  openEndTag(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'openEndTag');
  }

  beginTagName(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'beginTagName');
  }

  appendToTagName(builder: TreeBuilder, pos: Position, char: string): void {
    illegal(this.name, 'appendToTagName');
  }

  finishTagName(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'finishTagName');
  }

  beginAttributeName(builder: TreeBuilder, pos: Position) {
    illegal(this.name, 'beginAttributeName');
  }

  appendToAttributeName(builder: TreeBuilder, pos: Position, data: string) {
    illegal(this.name, 'attributeName');
  }

  finishAttributeName(builder: TreeBuilder, pos: Position) {
    illegal(this.name, 'finishAttributeName');
  }

  voidAttributeValue(builder: TreeBuilder, pos: Position) {
    illegal(this.name, 'voidAttribute');
  }

  beginWholeAttributeValue(builder: TreeBuilder, pos: Position) {
    illegal(this.name, 'beginWholeAttributeValue');
  }

  beginAttributeValue(builder: TreeBuilder, pos: Position, quoted: boolean) {
    illegal(this.name, 'beginAttributeValue');
  }

  appendToAttributeValue(builder: TreeBuilder, pos: Position, char: Char) {
    illegal(this.name, 'appendToAttributeValue');
  }

  finishAttributeValue(builder: TreeBuilder, pos: Position) {
    illegal(this.name, 'finishAttributeValue');
  }

  finishWholeAttributeValue(builder: TreeBuilder, pos: Position) {
    illegal(this.name, 'finishWholeAttributeValue');
  }

  finishTag(builder: TreeBuilder, pos: Position, selfClosing: boolean): void {
    illegal(this.name, 'finishTag');
  }

  whitespace(builder: TreeBuilder, pos: Position, char: string) {
    // by default, whitespace is ignored
  }

  beginComment(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'beginComment');
  }

  appendToCommentData(builder: TreeBuilder, pos: Position, char: string) {
    illegal(this.name, 'appendToCommentData');
  }

  finishComment(builder: TreeBuilder, pos: Position): void {
    illegal(this.name, 'finishComment');
  }
}

function illegal(name: string, event: string) {
  throw new Error(`${event} is illegal in ${name}`);
}

export class ParentNodeState extends ParserState {
  beginData(builder: TreeBuilder, pos: Position) {
    let text = new DataTokenBuilder(loc(pos));
    builder.state = new InDataState(this, text);
  }

  beginComment(builder: TreeBuilder, pos: Position) {
    let comment = new CommentTokenBuilder(loc(pos));
    builder.state = new InCommentState(this, comment);
  }

  openStartTag(builder: TreeBuilder, pos: Position) {
    let element = new ElementBuilder(loc(pos));
    builder.state = new OpenStartTagState(element, pos);
  }
}

export class InDataState extends ParserState {
  public name = 'in-data';

  constructor(private ret: ParserState, private data: DataTokenBuilder) {
    super();
  }

  appendToData(builder: TreeBuilder, pos: Position, char: Char) {
    this.data.appendToData(pos, char);
  }

  finishData(builder: TreeBuilder, pos: Position) {
    let text = this.data.finalize(pos);
    builder.appendLeaf(text);
    builder.state = this.ret;
  }
}

export class InCommentState extends ParserState {
  public name = 'in-data';

  constructor(private ret: ParserState, private comment: CommentTokenBuilder) {
    super();
  }

  appendToCommentData(builder: TreeBuilder, pos: Position, char: Char) {
    this.comment.appendToData(pos, char);
  }

  finishComment(builder: TreeBuilder, pos: Position) {
    let comment = this.comment.finalize(pos);
    builder.appendLeaf(comment);
    builder.state = this.ret;
  }
}

export class InitialState extends ParentNodeState {
  public name = 'initial';

  static INSTANCE = new InitialState();
}

export class OpenStartTagState extends ParserState {
  public name = 'open-start';

  constructor(private element: ElementBuilder, private start: Position) {
    super();
  }

  beginTagName(builder: TreeBuilder, pos: Position) {
    let tagName = new TagNameTokenBuilder(loc(pos));
    builder.state = new OpenTagNameState(this.element, this.start, tagName)
  }
}

export class OpenTagNameState extends ParserState {
  public name = 'open-tag-name';

  constructor(private element: ElementBuilder, private start: Position, private tagName: TagNameTokenBuilder) {
    super();
  }

  appendToTagName(builder: TreeBuilder, pos: Position, char: string) {
    this.tagName.appendToData(pos, char);
  }

  finishTagName(builder: TreeBuilder, pos: Position) {
    let tagName = this.tagName.finalize(pos);
    let openTag = new OpenTagBuilder(loc(this.start), tagName)
    builder.state = new NamedStartTagState(this.element, openTag);
  }
}

export class NamedStartTagState extends ParserState {
  public name = 'named-start-tag';

  constructor(private element: ElementBuilder, private tag: OpenTagBuilder) {
    super();
  }

  beginAttributeName(builder: TreeBuilder, pos: Position) {
    let name = new AttributeNameTokenBuilder(loc(pos));
    let attr = new AttributeBuilder(loc(pos));
    builder.state = new AttributeOpenState(this, this.tag, attr, name);
  }

  finishTag(builder: TreeBuilder, pos: Position, selfClosing: boolean) {
    let openTag = this.tag.finalize(pos);
    let openElement = this.element.finalize(this.tag.finalize(pos));
    builder.appendElement(openElement);
    builder.state = InElement.INSTANCE;
  }
}

export class InElement extends ParentNodeState {
  public name = 'in-element';

  static INSTANCE = new InElement();

  openEndTag(builder: TreeBuilder, pos: Position) {
    builder.state = new OpenEndTagState(this, pos);
  }
}

export class OpenEndTagState extends ParserState {
  public name = 'open-end-tag';

  constructor(private ret: ParentNodeState, private start: Position) {
    super();
  }

  beginTagName(builder: TreeBuilder, pos: Position) {
    let tagName = new TagNameTokenBuilder(loc(pos));
    builder.state = new EndTagNameState(this.ret, this.start, tagName)
  }
}

export class EndTagNameState extends ParserState {
  public name = 'end-tag-name';

  constructor(private ret: ParentNodeState, private start: Position, private tagName: TagNameTokenBuilder) {
    super();
  }

  appendToTagName(builder: TreeBuilder, pos: Position, char: string) {
    this.tagName.appendToData(pos, char);
  }

  finishTagName(builder: TreeBuilder, pos: Position) {
    let tagName = this.tagName.finalize(pos);
    let closeTag = new CloseTagBuilder(loc(this.start), tagName);
    builder.state = new NamedEndTagState(this.ret, closeTag);
  }
}

export class NamedEndTagState extends ParserState {
  public name = 'named-end-tag';

  constructor(private ret: ParentNodeState, private tag: CloseTagBuilder) {
    super();
  }

  finishTag(builder: TreeBuilder, pos: Position) {
    let closeTag = this.tag.finalize(pos);
    builder.closeElement(pos, closeTag);
    builder.state = this.ret;
  }
}

export class AttributeOpenState extends ParserState {
  public name = 'attribute-open';

  constructor(private ret: ParserState, private tag: OpenTagBuilder, private attr: AttributeBuilder, private attrName: AttributeNameTokenBuilder) {
    super();
  }

  appendToAttributeName(builder: TreeBuilder, pos: Position, data: string) {
    this.attrName.appendToAttributeName(pos, data);
  }

  finishAttributeName(builder: TreeBuilder, pos: Position) {
    let name = this.attrName.finalize(pos);
    builder.state = new InAttribute(this.ret, this.tag, this.attr, name);
  }
}

export class InAttribute extends ParserState {
  public name = 'in-attribute';

  constructor(private ret: ParserState, private tag: OpenTagBuilder, private attr: AttributeBuilder, private attrName: AttributeNameToken) {
    super();
  }

  beginWholeAttributeValue(builder: TreeBuilder, pos: Position) {
    let value = new AttributeValueTokenBuilder(loc(pos));
    builder.state = new OuterAttributeValueState(this.ret, this.tag, this.attr, this.attrName, value);
  }

  voidAttributeValue(builder: TreeBuilder, pos: Position) {
    let value = AttributeValueToken.voidValue();
    let attr = this.attr.finalize(pos, this.attrName, value);
    this.tag.attr(attr);
    builder.state = this.ret;
  }
}

export class OuterAttributeValueState extends ParserState {
  public name = 'outer-attribute-value';

  constructor(private ret: ParserState, private tag: OpenTagBuilder, private attr: AttributeBuilder, private attrName: AttributeNameToken, private attrValue: AttributeValueTokenBuilder) {
    super();
  }

  whitespace(builder: TreeBuilder, pos: Position, char: string) {
    this.attr.quote(char as QUOTE);
  }

  beginAttributeValue(builder: TreeBuilder, pos: Position) {
    let inner = this.attrValue.beginInner(pos);
    builder.state = new InnerAttributeValueState(this.ret, this.tag, this.attr, this.attrName, this.attrValue, inner);
  }
}

export class AttributeValueState extends ParserState {
  public name = 'attribute-value';

  constructor(private tag: NamedStartTagState, private attr: AttributeBuilder) {
    super();
  }
}

export class InnerAttributeValueState extends ParserState {
  public name = 'inner-attribute-value';

  constructor(private ret: ParserState, private tag: OpenTagBuilder, private attr: AttributeBuilder, private attrName: AttributeNameToken, private outer: AttributeValueTokenBuilder, private token: InnerAttributeValueTokenBuilder) {
    super();
  }

  appendToAttributeValue(builder: TreeBuilder, pos: Position, char: Char) {
    this.token.appendToAttributeValue(pos, char);
  }

  finishAttributeValue(builder: TreeBuilder, pos: Position) {
    let inner = this.token.finalize(pos);
    builder.state = new FinishingAttributeState(this.ret, this.tag, this.attr, this.attrName, this.outer, inner);
  }
}

export class FinishingAttributeState extends ParserState {
  public name = 'finishing-attribute';

  constructor(private ret: ParserState, private tag: OpenTagBuilder, private attr: AttributeBuilder, private attrName: AttributeNameToken, private token: AttributeValueTokenBuilder, private inner: InnerAttributeValueToken) {
    super();
  }

  finishWholeAttributeValue(builder: TreeBuilder, pos: Position) {
    let outer = this.token.finalize(pos, this.inner);
    let attr = this.attr.finalize(pos, this.attrName, outer);
    this.tag.attr(attr);
    builder.state = this.ret;
  }
}
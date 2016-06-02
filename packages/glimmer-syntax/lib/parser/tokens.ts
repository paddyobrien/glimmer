import { Position, Delegate, Char } from 'simple-html-tokenizer';
import { TokenizerDelegate } from './tokenizer-delegate';
import { Option, unwrap } from 'glimmer-util';
import { HTMLNS, ElementType, TreeElement, TreeToken } from './types';

export interface PhysicalLocation {
  start: Position;
  end: Position;
}

const COLLAPSED: Location = "COLLAPSED [d2a7ffd1-5023-4eeb-935b-ae95f732d836]";

export type Location = PhysicalLocation | "COLLAPSED [d2a7ffd1-5023-4eeb-935b-ae95f732d836]";

export interface SerializedLocation {
  start: { line: number, column: number };
  end: { line: number, column: number };
}

export function locToJSON(l: Location): SerializedLocation {
  if (l === COLLAPSED) {
    throw new Error("Cannot convert a collapsed location to JSON");
  } else {
    let { start, end } = l as PhysicalLocation;
    return { start: { line: start.line, column: start.column }, end: { line: end.line, column: end.column } };
  }
}

interface Constructor<T> {
  new(...args: any[]): T;
}

export class TokenBuilder extends TokenizerDelegate {
  as<T extends TokenBuilder>(type: Constructor<T>): Option<T> {
    if (this instanceof type) {
      return this as any as T;
    } else {
      return null;
    }
  }

  unwrapAs<T extends TokenBuilder>(type: Constructor<T>): T {
    return unwrap(this.as<T>(type));
  }
}

export class LocatableTokenBuilder extends TokenBuilder {
  constructor(public loc: LocationBuilder) {
    super();
  }
}

export class SourceSpan {
  constructor(public start: Position, public end: Position) {}
}

export class LocationBuilder {
  constructor(private start: Position) {}

  fork(): LocationBuilder {
    return new LocationBuilder({ line: this.start.line, column: this.start.column });
  }

  finalize(end: Position): Location {
    return new SourceSpan(this.start, end);
  }
}

export function loc(pos: Position) {
  return new LocationBuilder(pos);
}

export const INITIAL = new TokenBuilder();

export class CharsTokenBuilder<T extends CharsToken> extends LocatableTokenBuilder {
  static start(pos: Position) {
    return new this(new LocationBuilder(pos));
  }

  protected chars: string = '';
  protected TokenType: { new(loc: Location, chars?: string): T };

  appendToData(pos: Position, chars: Char) {
    if (typeof chars === 'string') {
      this.chars += chars;
    } else {
      this.chars += chars.chars;
    }
  }

  finalize(end: Position): T {
    return new this.TokenType(this.loc.finalize(end), this.chars);
  }
}

export interface SerializedLocatableToken {
  type: string;
  loc: SerializedLocation;
}

export class LocatableToken {
  constructor(public loc: Location) {}
}

export class CharsToken extends LocatableToken {
  constructor(loc: Location, public chars: string) {
    super(loc);
  }
}

export class DataTokenBuilder extends CharsTokenBuilder<DataToken> {
  protected TokenType = DataToken;
}

export interface SerializedDataToken extends SerializedLocatableToken {
  type: 'data';
  chars: string;
}

export class DataToken extends CharsToken {
  toJSON(): SerializedDataToken {
    return {
      type: 'data',
      loc: locToJSON(this.loc),
      chars: this.chars
    }
  }
}

export class CommentTokenBuilder extends CharsTokenBuilder<CommentToken> {
  protected TokenType = CommentToken;
}

export interface SerializedCommentToken extends SerializedLocatableToken {
  type: 'comment';
  chars: string;
}

export class CommentToken extends CharsToken {
  toJSON(): SerializedCommentToken {
    return {
      type: 'comment',
      loc: locToJSON(this.loc),
      chars: this.chars
    }
  }
}

export const SELF_CLOSING: TreeChildren = "SELF_CLOSING [b05f9a4e-5713-4177-8aa9-29c08c7cce59]";
export type SELF_CLOSING = "SELF_CLOSING [b05f9a4e-5713-4177-8aa9-29c08c7cce59]";
export type TreeChildren = SELF_CLOSING | TreeToken[];

export class ElementBuilder extends LocatableTokenBuilder {
  finalize(openTag: OpenTagToken): OpenedElementBuilder {
    return new OpenedElementBuilder(this.loc, openTag);
  }
}

export class OpenedElementBuilder extends LocatableTokenBuilder {
  protected children: TreeToken[] = [];

  constructor(loc: LocationBuilder, public openTag: OpenTagToken) {
    super(loc);
  }

  append(child: TreeToken) {
    this.children.push(child);
  }

  finalize(end: Position, closeTag: CloseTagToken): ElementToken {
    let loc = this.loc.finalize(end);
    return new ElementToken(loc, this.openTag, closeTag, this.children);
  }
}

export type SerializedTreeToken = SerializedElementToken | SerializedDataToken | SerializedCommentToken;

export interface SerializedElementToken extends SerializedLocatableToken {
  type: 'element';
  openTag: SerializedOpenTagToken;
  closeTag: SerializedCloseTagToken;
  children: Option<SerializedTreeToken[]>;
}

export class ElementToken extends LocatableToken {
  constructor(loc: Location, public openTag: OpenTagToken, public closeTag: CloseTagToken, public children: TreeChildren) {
    super(loc);
  }

  toJSON(): SerializedElementToken {
    let children: Option<TreeToken[]> = this.children === SELF_CLOSING ? null : this.children as TreeToken[];

    return {
      type: 'element',
      loc: locToJSON(this.loc),
      openTag: this.openTag.toJSON(),
      closeTag: this.closeTag.toJSON(),
      children: children && children.map(c => c.toJSON())
    };
  }
}

export class OpenTagBuilder extends LocatableTokenBuilder implements ElementType {
  private attributes: Attribute[] = [];

  constructor(public loc: LocationBuilder, private tagName: TagNameToken) {
    super(loc);
  }

  get name(): string {
    return this.tagName.chars;
  }

  get namespace(): string {
    return this.tagName.namespace;
  }

  attr(attribute: Attribute) {
    this.attributes.push(attribute);
  }

  matches(target: ElementType): boolean {
    let tagName = this.tagName;
    return this.tagName.name === target.name && this.tagName.namespace === target.namespace;
  }

  finalize(pos: Position): OpenTagToken {
    let loc = this.loc.finalize(pos);
    return new OpenTagToken(loc, this.tagName, this.attributes);
  }
}

export interface SerializedOpenTagToken extends SerializedLocatableToken {
  type: 'open-tag';
  tagName: SerializedTagNameToken;
  attributes: SerializedAttribute[];
}

export class OpenTagToken extends LocatableToken implements ElementType {
  constructor(loc: Location, public tagName: TagNameToken, public attributes: Attribute[]) {
    super(loc);
  }

  get name(): string {
    return this.tagName.chars;
  }

  get namespace(): string {
    return this.tagName.namespace;
  }

  toJSON(): SerializedOpenTagToken {
    return {
      type: 'open-tag',
      loc: locToJSON(this.loc),
      tagName: this.tagName.toJSON(),
      attributes: this.attributes.map(a => a.toJSON())
    }
  }
}

export class CloseTagBuilder extends LocatableTokenBuilder implements ElementType {
  constructor(loc: LocationBuilder, public tagName: TagNameToken) {
    super(loc);
  }

  finalize(pos: Position): CloseTagToken {
    return new CloseTagToken(this.loc.finalize(pos), this.tagName);
  }

  get name(): string {
    return this.tagName.chars;
  }

  get namespace(): string {
    return this.tagName.namespace;
  }
}

export interface SerializedCloseTagToken extends SerializedLocatableToken {
  type: 'close-tag';
  tagName: SerializedTagNameToken;
}

export class CloseTagToken extends LocatableToken implements ElementType {
  constructor(loc: Location, public tagName: TagNameToken) {
    super(loc);
  }

  get name(): string {
    return this.tagName.chars;
  }

  get namespace(): string {
    return this.tagName.namespace;
  }

  toJSON(): SerializedCloseTagToken {
    return {
      type: 'close-tag',
      loc: locToJSON(this.loc),
      tagName: this.tagName.toJSON()
    }
  }
}

export class TagNameTokenBuilder extends CharsTokenBuilder<TagNameToken> {
  protected TokenType = TagNameToken;
}

export interface SerializedTagNameToken extends SerializedLocatableToken {
  type: 'tag-name';
  namespace: Option<string>;
  name: string;
}

export class TagNameToken extends CharsToken implements ElementType {
  public namespace = HTMLNS;

  constructor(loc: Location, chars: string = '') {
    super(loc, chars);
  }

  ns(namespace: string) {
    this.namespace = namespace;
  }

  get name(): string {
    return this.chars;
  }

  toJSON(): SerializedTagNameToken {
    return {
      type: 'tag-name',
      loc: locToJSON(this.loc),
      name: this.name,
      namespace: this.namespace === HTMLNS ? null : this.namespace
    }
  }
}

export type SINGLE_QUOTE = "'";
export type DOUBLE_QUOTE = '"';
export type QUOTE = SINGLE_QUOTE | DOUBLE_QUOTE;

export class AttributeBuilder extends LocatableTokenBuilder {
  private _quote: Option<QUOTE> = null;

  quote(kind: QUOTE) {
    this._quote = kind;
  }

  finalize(end: Position, name: AttributeNameToken, value: AttributeValueToken): Attribute {
    return new Attribute(this.loc.finalize(end), name, value, this._quote);
  }
}

export interface SerializedAttribute extends SerializedLocatableToken {
  type: 'attribute';
  name: SerializedAttributeNameToken;
  value: SerializedAttributeValueToken;
  quote: Option<QUOTE>;
}

export class Attribute extends LocatableToken {
  constructor(loc: Location, public name: AttributeNameToken, public value: AttributeValueToken, public quote: Option<QUOTE>) {
    super(loc);
  }

  toJSON(): SerializedAttribute {
    return {
      type: 'attribute',
      loc: locToJSON(this.loc),
      name: this.name.toJSON(),
      value: this.value.toJSON(),
      quote: this.quote
    }
  }
}

export class AttributeNameTokenBuilder extends CharsTokenBuilder<AttributeNameToken> {
  protected TokenType = AttributeNameToken;
}

export interface SerializedAttributeNameToken extends SerializedLocatableToken {
  type: 'attribute-name';
  chars: string
}

export class AttributeNameToken extends CharsToken {
  toJSON(): SerializedAttributeNameToken {
    return {
      type: 'attribute-name',
      loc: locToJSON(this.loc),
      chars: this.chars
    }
  }
}

export class AttributeValueTokenBuilder extends LocatableTokenBuilder {
  protected TokenType = AttributeValueToken;

  beginInner(pos: Position): InnerAttributeValueTokenBuilder {
    return new InnerAttributeValueTokenBuilder(loc(pos));
  }

  finalize(pos: Position, inner: InnerAttributeValueToken) {
    return new AttributeValueToken(this.loc.finalize(pos), inner);
  }
}

export interface SerializedAttributeValueToken extends SerializedLocatableToken {
  type: 'attribute-value';
  inner: SerializedInnerAttributeValueToken;
}

export class AttributeValueToken extends LocatableToken {
  static voidValue(): AttributeValueToken {
    let inner = new InnerAttributeValueToken(COLLAPSED, '');
    return new AttributeValueToken(COLLAPSED, inner);
  }

  constructor(loc: Location, public inner: InnerAttributeValueToken) {
    super(loc);
  }

  toJSON(): SerializedAttributeValueToken {
    return {
      type: 'attribute-value',
      loc: locToJSON(this.loc),
      inner: this.inner.toJSON()
    }
  }
}

export class InnerAttributeValueTokenBuilder extends CharsTokenBuilder<InnerAttributeValueToken> {
  constructor(loc: LocationBuilder) {
    super(loc);
  }

  finalize(pos: Position): InnerAttributeValueToken {
    return new InnerAttributeValueToken(this.loc.finalize(pos), this.chars);
  }
}

export interface SerializedInnerAttributeValueToken extends SerializedLocatableToken {
  type: 'inner-attribute-value';
  chars: string;
}

export class InnerAttributeValueToken extends CharsToken {
  constructor(loc: Location, chars: string) {
    super(loc, chars);
  }

  toJSON(): SerializedInnerAttributeValueToken {
    return {
      type: 'inner-attribute-value',
      loc: locToJSON(this.loc),
      chars: this.chars
    }
  }
}
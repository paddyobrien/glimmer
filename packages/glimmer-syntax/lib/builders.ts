import * as HBS from './parser/handlebars-ast';
import * as Node from './builders';
import { Opaque, Dict, Option, dict, unwrap } from 'glimmer-util';

export interface Node {
  type: number;
}

export interface JSONObject {
  [index: string]: JSON;
}

export interface JSONArray extends Array<JSON> {
  [index: number]: JSON;
}

export type JSON = JSONObject | JSONArray | number | string | boolean | null;

export interface SerializableTo<T extends JSON> {
  toJSON(): T;
}

export type Serializable = SerializableTo<JSON>;

interface SerializableNode<T extends JSON> extends Node, SerializableTo<T> {}

export interface LocatableNode extends Node{
  _loc: Location
}

export interface CallNode extends LocatableNode, Serializable {
  path: Path | Ident,
  args: Args
}

interface SerializedCall<T extends SerializedPath | string> extends JSONArray {
  [0]: T;
  [1]: SerializedArgs;
  [2]: SerializedLocation | null;
}

export enum Statement {
  Program = 1,
  Element,
  ElementModifier,
  Attr,
  Text,
  Block,
  Partial,
  Comment,
  Mustache
}

export const STATEMENT_NODE: "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]";

export function isStatement(value: any): value is Statement {
  return value && value[STATEMENT_NODE];
}

export interface StatementNode extends SerializableNode<SerializedStatement>, LocatableNode {
  "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]": boolean;
  type: Statement;
  _loc: Location;
}

export enum Expression {
  Ident = 100,
  Path,
  Args,
  Concat,
  Positional,
  Sexpr,
  Named,
  Pair,
  String,
  Boolean,
  Number,
  Null,
  Undefined
}

export enum Internal {
  Args = 200
}

export interface ExpressionNode extends SerializableNode<SerializedExpression>, LocatableNode {
  type: Expression;
  _loc: Location;
}

type SerializedExpression = (SerializedPath | SerializedSexpr | SerializedLiteral) & JSON;

type SerializedStatement  =
    SerializedElement
  | SerializedAttr
  | SerializedText
  | SerializedBlock
  | SerializedPartial
  | SerializedComment
  | SerializedMustache
  | SerializedSourceComment
  ;

// Abstract Classes

abstract class BuildableNode {
  public _loc: Location = SYNTHESIZED;

  location(loc: Location): this;
  location(start: SourceLocation, end: SourceLocation): this;
  location(start: Position, end: Position): this;

  location(start, end?): this {
    if (arguments.length === 2) {
      if (start instanceof SourceLocation) {
        this._loc = SourceLocation.build(start.start, end.end);
      } else {
        this._loc = SourceLocation.build(start, end);
      }
    } else {
      this._loc = start;
    }

    return this;
  }

  loc(start: [number, number], end: [number, number], source?: string): this {
    this._loc = new SourceLocation(source || SYNTHESIZED_SOURCE, new Position(start[0], start[1]), new Position(end[0], end[1]));
    return this;
  }

  hbs(node: HBS.Node): this {
    this._loc = locFromHBS(node.loc);
    return this;
  }
}

// Statements

type FIXME = any;

type SerializedMustache = SerializedCall<SerializedPath>;

export class Mustache extends BuildableNode implements StatementNode, CallNode {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(rawPath: string | Path, positional: ExpressionNode[] = [], named: Dict<ExpressionNode> = dict<ExpressionNode>(), trusting: boolean = false) {
    let path: Path;

    if (typeof rawPath === 'string') {
      path = Path.build(rawPath);
    } else {
      path = rawPath;
    }

    return new Mustache(
      path,
      Args.build(positional, named),
      trusting
    )
  }

  static fromHBS(node: HBS.Mustache): Mustache {
    let path = Path.fromHBS(node.path);
    let args = Args.fromHBS(node.params, node.hash);
    let trusting = !node.escaped;

    return new Mustache(path, args, !node.escaped).hbs(node);
  }

  public type = Statement.Mustache;

  constructor(
    public path: Path,
    public args: Args,
    public trusting: boolean
  ) {
    super();
  }

  toJSON(): SerializedMustache {
    return [
      this.path.toJSON(),
      this.args.withInternal([ literal(this.trusting) ]).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

export type SerializedBlock = SerializedCall<"block">;

export class Block extends BuildableNode implements StatementNode, CallNode, SerializableNode<SerializedBlock> {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(path: string, positional: ExpressionNode[], named: Dict<ExpressionNode>, program: Program, inverse: Program) {
    return new Block(
      Path.build(path),
      Args.build(positional, named),
      program,
      inverse,
      false
    );
  }

  static fromHBS(node: HBS.Block): Block {
    let path = Path.fromHBS(node.path);
    let args = Args.fromHBS(node.params, node.hash);
    let program = Program.fromHBS(node.program);
    let inverse = Program.fromHBS(node.inverse);

    return new Block(path, args, program, inverse, !!node.chained).hbs(node);
  }

  public type = Statement.Block;

  constructor(
    public path: Path,
    public args: Args,
    public program: Program,
    public inverse: Program,
    public chained: boolean
  ) {
    super();
  }

  toJSON(): SerializedBlock {
    return [
      "block" as "block",
      this.args.withInternal([ this.program, this.inverse ]).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

export type SerializedPartial = SerializedCall<"partial">;

export class Partial extends BuildableNode implements StatementNode, CallNode, SerializableNode<SerializedPartial> {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(name: string, args: Args, indent: number) {
    return new Partial(Path.build(name), args, indent);
  }

  static fromHBS(node: HBS.Partial) {
    let args = Args.fromHBS(node.params, node.hash);
    return new Partial(Path.fromHBS(node.name), args, node.indent).hbs(node);
  }

  public type = Statement.Partial;

  constructor(
    public path: Path,
    public args: Args,
    public indent: number
  ) {
    super();
  }

  toJSON(): SerializedPartial {
    return [
      "partial",
      this.args.withInternal(InternalArgs.build([this.path, literal(this.indent)])).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

export type SerializedSourceComment = SerializedCall<"comment">;

export class SourceComment extends BuildableNode implements StatementNode, SerializableNode<SerializedSourceComment> {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(value: string): SourceComment {
    return new SourceComment(value);
  }

  static fromHBS(node: HBS.Comment): SourceComment {
    return new SourceComment(node.value).hbs(node);
  }

  public type = Statement.Comment;

  constructor(public value: string) {
    super();
  }

  toJSON(): SerializedSourceComment {
    return [
      "comment",
      Args.internal(internal(this.value)).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

// DOM

export interface HasChildren {
  appendChild(statement: StatementNode);
}

interface SerializedElement extends JSONArray {
  [0]: "element";
  [1]: SerializedArgs;
  [2]: SerializedStatement[];
  [3]: Option<SerializedLocation>
}

export class Element extends BuildableNode implements StatementNode, HasChildren {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(tag: string, attributes: Attr[] = [], blockParams: string[] = [], modifiers: Mustache[] = [], children: StatementNode[] = []): Element {
    return new Element(tag, attributes, blockParams, modifiers, children);
  }

  public type = Statement.Element;

  constructor(
    public tag: string,
    public attributes: Attr[],
    public blockParams: string[],
    public modifiers: Mustache[],
    public _children: StatementNode[] // TODO: break into Program
  ) {
    super();
  }

  children(nodes: StatementNode[]): this {
    this._children = nodes;
    return this;
  }

  toJSON(): SerializedElement {
    return [
      "element",
      Args.internal([literal(this.tag), InternalArgs.build(this.attributes)]).toJSON(),
      this._children.map(c => c.toJSON()),
      jsonLocation(this._loc)
    ];
  }

  appendChild(statement: StatementNode) {
    this._children.push(statement);
  }

  appendModifier(modifier: Mustache) {
    this.modifiers.push(modifier);
  }
}

export type SerializedAttr = SerializedCall<"attribute">;

export type AttrValue = Text | Concat | Mustache;

export class Attr extends BuildableNode implements StatementNode, SerializableNode<SerializedAttr> {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(name: string, value: AttrValue & Serializable): Attr {
    return new Attr(name, value);
  }

  public type = Statement.Attr;

  constructor(
    public name: string,
    public value: AttrValue & Serializable
  ) {
    super();
  }

  toJSON(): SerializedAttr {
    return [
      "attribute",
      Args.internal([ literal(this.name), this.value ]).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

export type SerializedText = SerializedCall<"text">;

export class Text extends BuildableNode implements StatementNode {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(chars: string): Text {
    return new Text(chars);
  }

  public type = Statement.Text;

  constructor(public chars: string) {
    super();
  }

  toJSON(): SerializedText {
    return [
      "text",
      Args.internal(internal(this.chars)).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

export type SerializedComment = SerializedCall<"comment">;

export class Comment extends BuildableNode implements StatementNode {
  public "STATEMENT [0252bef3-e03e-4bef-80eb-5851a351cbc4]" = true;

  static build(value: string): Comment {
    return new Comment(value);
  }

  public type = Statement.Comment;

  constructor(public value: string) {
    super()
  }

  toJSON(): SerializedComment {
    return [
      "comment",
      Args.internal([literal(this.value)]).toJSON(),
      jsonLocation(this._loc)
    ];
  }
}

export class Concat extends BuildableNode implements Serializable {
  static build(parts: StatementNode[]): Concat {
    return new Concat(parts);
  }

  public type = Expression.Concat;

  constructor(public parts: StatementNode[]) {
    super();
  }

  toJSON(): SerializedStatement[] {
    return this.parts.map(toJSON);
  }
}

// Expressions

export type SerializedSexpr = SerializedCall<SerializedPath>;

export class Sexpr extends BuildableNode implements ExpressionNode, CallNode, SerializableNode<SerializedSexpr> {
  static build(path: string, positional: ExpressionNode[], named: Dict<ExpressionNode>): Sexpr {
    return new Sexpr(
      Path.build(path),
      Args.build(positional, named)
    );
  }

  static fromHBS(node: HBS.SubExpression): Sexpr {
    let path = Path.fromHBS(node.path);
    let args = Args.fromHBS(node.params, node.hash);
    return new Sexpr(path, args).hbs(node);
  }

  type = Expression.Sexpr;

  constructor(
    public path: Path,
    public args: Args
  ) {
    super();
  }

  toJSON(): SerializedSexpr {
    return [ toJSON(this.path), toJSON(this.args), jsonLocation(this._loc) ];
  }
}

export type SerializedIdent = string;

export class Ident implements SerializableNode<SerializedIdent> {
  static build(original: string) {

  }

  public type = Expression.Ident;
  public original: string;

  constructor(public path: string) {
    this.original = path;
  }

  toJSON(): SerializedIdent {
    return this.path;
  }
}

export type SerializedPath = string[];

export class Path extends BuildableNode implements ExpressionNode, SerializableNode<SerializedPath> {
  static build(original: string): Path {
    return new Path(original, original.split('.'), false);
  }

  static fromHBS(path: HBS.Path): Path {
    return new Path(path.original, path.parts, path.data).hbs(path);
  }

  public type = Expression.Path;

  constructor(
    public original: string,
    public parts: string[],
    public data: boolean
  ) {
    super();
  }

  toJSON(): SerializedPath {
    return this.parts;
  }
}

type LiteralType = number | boolean | string | null | undefined;
type SerializedLiteralType = number | boolean | string | null | ['literal', 'undefined'];

type SerializedLiteralValue<T extends SerializedLiteralType> = T;
export type SerializedLiteral = SerializedLiteralValue<SerializedLiteralType>;

abstract class Literal<T extends SerializedLiteralType> extends BuildableNode {
  static fromHBS(node: HBS.Literal): Literal<SerializedLiteralType> {
    if (HBS.isString(node)) {
      return new String(node.value).hbs(node);
    } else if (HBS.isBoolean(node)) {
      return new Boolean(node.value).hbs(node);
    } else if (HBS.isNumber(node)) {
      return new Number(node.value).hbs(node);
    } else if (HBS.isNull(node)) {
      return new Null(node.value).hbs(node);
    } else if (HBS.isUndefined(node)) {
      return new Undefined().hbs(node);
    } else {
      throw new Error("BUG: Passed non-primitive to Literal.fromHBS");
    }
  }

  type: Expression;

  abstract toJSON(): T;
}

type AnyLiteral = Literal<SerializedLiteralType>;

export abstract class ValueLiteral<T extends SerializedLiteralType> extends BuildableNode implements ExpressionNode, SerializableTo<SerializedLiteralValue<T>> {
  public type: Expression;

  constructor(public value: T) {
    super();
  }

  toJSON(): SerializedLiteralValue<T> {
    return this.value;
  }
}

function literal(value: string): String;
function literal(value: number): Number;
function literal(value: boolean): Boolean;
function literal(value: null): Null;
function literal(value: undefined): Undefined;

function literal(value: LiteralType): AnyLiteral {
  if (typeof value === 'string') {
    return new String(value);
  } else if (typeof value === 'boolean') {
    return new Boolean(value);
  } else if (typeof value === 'number') {
    return new Number(value);
  } else if (value === null) {
    return new Null(null);
  } else if (value === undefined) {
    return new Undefined();
  } else {
    throw new Error("BUG: passed non-primitive to Literal.build");
  }
}

export type SerializedString = SerializedLiteralValue<string>;

export class String extends ValueLiteral<string> {
  public type = Expression.String;
}

export type SerializedBoolean = SerializedLiteralValue<boolean>;

export class Boolean extends ValueLiteral<boolean> {
  public type = Expression.Boolean;
}

export type SerializedNumber = SerializedLiteralValue<number>;

export class Number extends ValueLiteral<number> {
  public type = Expression.Number;
}

export type SerializedNull = SerializedLiteralValue<null>;

export class Null extends ValueLiteral<null> {
  public type = Expression.Null;
}

export type SerializedUndefined = ['literal', 'undefined'];

export class Undefined extends BuildableNode implements Literal<SerializedUndefined> {
  public type = Expression.Undefined;

  toJSON(): SerializedUndefined {
    return ['literal', 'undefined'];
  }
}

// Miscellaneous

export type SerializedArgs = [SerializedPositional, SerializedNamed, SerializedInternal];

export class Args implements SerializableNode<SerializedArgs> {
  static build(positional: ExpressionNode[], named: Dict<ExpressionNode>, internal?: Serializable[]): Args {
    return new Args(new Positional(positional), Named.build(named), new InternalArgs(internal || []));
  }

  static internal(internal: InternalArgs): Args;
  static internal(internal: Serializable[]): Args;
  static internal(internal): Args {
    if (Array.isArray(internal)) {
      return new Args(new Positional([]), new Named([]), new InternalArgs(internal));
    } else {
      return new Args(new Positional([]), new Named([]), internal);
    }
  }

  static fromHBS(params?: HBS.Param[], hash?: HBS.Hash): Args {
    return new Args(Positional.fromHBS(params), Named.fromHBS(hash), InternalArgs.empty());
  }

  public type = Expression.Args;

  constructor(
    public positional: Positional,
    public named: Named,
    public internal: InternalArgs
  ) {
  }

  withInternal(internal: InternalArgs): Args;
  withInternal(internal: Serializable[]): Args;

  withInternal(internal): Args {
    if (Array.isArray(internal)) {
      return new Args(this.positional, this.named, new InternalArgs(internal));
    } else {
      return new Args(this.positional, this.named, internal);
    }

  }

  toJSON(): SerializedArgs {
    return [ this.positional.toJSON(), this.named.toJSON(), toJSON(this.internal) ];
  }
}

type SerializedInternal = JSONArray | null;

export class InternalArgs implements SerializableNode<SerializedInternal> {
  static build(params: Serializable[]) {
    return new InternalArgs(params);
  }

  static empty(): InternalArgs {
    return new InternalArgs([]);
  }

  public type = Internal.Args;

  constructor(public params: Serializable[]) {}

  toJSON(): SerializedInternal {
    return this.params.map(e => {
      return toJSON(e);
    });
  }
}

function internal(...args: LiteralType[]): InternalArgs {
  return new InternalArgs(args.map<AnyLiteral>(literal));
}

type SerializedPositional = SerializedExpression[];

export class Positional implements SerializableNode<SerializedPositional> {
  static fromHBS(params?: HBS.Param[]) {
    if (!params) {
      return new Positional([]);
    } else {
      return new Positional(params.map(paramToExpr));
    }
  }

  public type = Expression.Positional;

  constructor(public expressions: ExpressionNode[]) {}

  toJSON(): SerializedPositional {
    return this.expressions.map(e => e.toJSON());
  }
}

export type SerializedNamed = [string[], SerializedExpression[]];

export class Named implements SerializableNode<SerializedNamed> {
  static build(object: Dict<ExpressionNode>): Named {
    let keys = Object.keys(object);
    return new Named(keys.map(k => Pair.build(k, keys[k])));
  }

  static fromHBS(hash?: HBS.Hash): Named {
    if (!hash) {
      return new Named([]);
    } else {
      return new Named(hash.pairs.map(Pair.fromHBS));
    }
  }

  public type = Expression.Named;

  constructor(public pairs: Pair[]) {}

  toJSON(): SerializedNamed {
    let keys = [];
    let values = [];

    this.pairs.forEach(p => {
      keys.push(p.key);
      values.push(p.value.toJSON());
    });

    return [keys, values];
  }
}

type RawPair = [string, ExpressionNode];

export class Pair extends BuildableNode implements LocatableNode {
  static build(key: string, value: ExpressionNode): Pair {
    return new Pair(key, value);
  }

  static fromHBS(pair: HBS.HashPair): Pair {
    return new Pair(pair.key, paramToExpr(pair.value)).hbs(pair);
  }

  public type = Expression.Pair;

  constructor(
    public key: string,
    public value: ExpressionNode
  ) {
    super();
  }
}

export type SerializedProgram = [string[], SerializedStatement[]];

export class Program extends BuildableNode implements SerializableNode<SerializedProgram> {
  static build(blockParams: string[] = []): Program {
    return new Program([], blockParams, false);
  }

  static fromHBS(node: HBS.Program): Program {
    let body = node.body.map(stmtToStatement);
    return new Program(body, node.blockParams || [], !!node.chained).hbs(node);
  }

  public type = Statement.Program;

  constructor(
    public body: StatementNode[],
    public blockParams: string[],
    public chained: boolean
  ) {
    super();
  }

  children(nodes: StatementNode[]): this {
    this.body = nodes;
    return this;
  }

  toJSON(): SerializedProgram {
    return [this.blockParams, this.body.map(s => s.toJSON())]
  }

  appendChild(statement: StatementNode) {
    this.body.push(statement);
  }
}

function buildSource(source?) {
  return source || null;
}

export type RawPosition = { line: number, column: number };

export class Position {
  static build(line: number, column: number) {
    return new Position(line, column);
  }

  static fromHBS({ line, column }: HBS.Position) {
    return new Position(line, column);
  }

  constructor(
    public line: number,
    public column: number
  ) {
  }

  toJSON(): RawPosition {
    return { line: this.line, column: this.column };
  }
}

function paramToExpr(ast: HBS.Param | Node.Sexpr): ExpressionNode {
  if (ast.type === Node.Expression.Sexpr) {
    return ast as Node.Sexpr;
  } else {
    let node = ast as HBS.Param;

    if (HBS.isLiteral(node)) {
      return Literal.fromHBS(node);
    } else if (HBS.isPath(node)) {
      return Path.fromHBS(node);
    } else if (HBS.isSubExpression(node)) {
      return Sexpr.fromHBS(node);
    } else {
      // TO ASK TS: is there a way to tell TS that this is exhaustive?
      throw new Error("BUG: passed non-param to paramToExpr");
    }
  }
}

function stmtToStatement(node: HBS.Statement): StatementNode {
  if (HBS.isMustache(node)) {
    return Mustache.fromHBS(node);
  } else if (HBS.isBlock(node)) {
    return Block.fromHBS(node);
  } else if (HBS.isPartial(node)) {
    return Partial.fromHBS(node);
  } else if (HBS.isComment(node)) {
    return SourceComment.fromHBS(node);
  } else {
    // TO ASK TS: is there a way to tell TS that this is exhaustive?
    throw new Error("BUG: passed non-statement to stmtToStatement");
  }
}

function locForRange(nodes: HBS.Node[]): Location {
  let first = nodes[0];
  let last = nodes[nodes.length - 1];

  if (first && first.loc && last && last.loc) {
    let start = first.loc;
    let end = last.loc;
    let source = start.source;

    return SourceLocation.build(start.start, end.end, source);
  } else {
    return SYNTHESIZED as Location;
  }

}

// export function buildPosition(line: number, column: number): Position {
//   return {
//     line: (typeof line === 'number') ? line : null,
//     column: (typeof column === 'number') ? column : null
//   };
// }

// Handlebars AST allows `undefined`, but the Glimmer wire format requires
// JSON-compatible types; some of this code converts `undefined` to `null`,
// which requires null-aware TypeScript to express (and we aren't yet using
// that).
export interface HandlebarsLocation {
  source: string;
  start: Position;
  end: Position;
}

export class SourceLocation {
  static build(start: RawPosition, end: RawPosition, source: SourceFile = SYNTHESIZED_SOURCE): SourceLocation {
    return new SourceLocation(source, start && Position.fromHBS(start), end && Position.fromHBS(end));
  }

  constructor(
    public source: SourceFile,
    public start: Position,
    public end: Position
  ) {
  }

  toJSON() {
    return jsonLocation(this);
  }
}

export const SYNTHESIZED_SOURCE: SourceFile = "SYNTHESIZED_SOURCE [33851ac4-4863-4811-b841-e7aa12becd89]";
export const SYNTHESIZED: Location = "SYNTHESIZED [1098c603-b6f5-46a2-8171-56f0b2572382]";
export const UNNEEDED: Location = "UNNEEDED [31eb8112-8690-4721-93d0-ccd3d24496d2]";

export type HbsToLoc = SourceLocation | Location | HBS.Location | null | undefined;

export function locFromHBS(loc: HbsToLoc): Location {
  if (loc === null || loc === undefined || loc === SYNTHESIZED) {
    return SYNTHESIZED as Location;
  } else if (loc instanceof SourceLocation || loc === UNNEEDED) {
    return loc as Location;
  } else if (loc && loc['start'] && loc['end']) {
    let l = loc as HBS.Location;
    return SourceLocation.build(l.start, l.end, l.source);
  } else {
    throw new Error(`BUG: Passed ${loc} to locFromHBS instead of a location object`);
  }
}

export type SourceFile =
    string
  | "SYNTHESIZED_SOURCE [33851ac4-4863-4811-b841-e7aa12becd89]"
  ;

export type Location =
    SourceLocation
  | "SYNTHESIZED [1098c603-b6f5-46a2-8171-56f0b2572382]"
  | "UNNEEDED [31eb8112-8690-4721-93d0-ccd3d24496d2]"
  ;

export function isSourceLocation(l: any): l is SourceLocation {
  return l instanceof SourceLocation;
}

interface SerializedLocation extends JSONObject {
  source: string | null;
  start: { line: number, column: number },
  end: { line: number, column: number }
}

export function jsonLocation(location: Location): Option<SerializedLocation> {
  if (location === SYNTHESIZED || location === UNNEEDED) {
    return null;
  } else {
    let { source, start, end } = location as SourceLocation;
    return {
      source: source === SYNTHESIZED_SOURCE ? null : source,
      start: start.toJSON(),
      end: end.toJSON()
    };
  }
}

export function formatLocation(location: Location): string {
  if (location === SYNTHESIZED) {
    return "(synthesized syntax)";
  } else if (location === UNNEEDED) {
    throw new Error("Don't try to print AST nodes that don't represent contiguous spans");
  } else {
    let l = location as SourceLocation;
    return `${l.start.line}:${l.start.column} at ${l.source}`;
  }
}

export type DOMNode = Text | Element | Comment;

export function isDOMNode(node: Node): node is DOMNode {
  return node.type === Statement.Text || node.type === Statement.Element || node.type === Statement.Comment;
}

// export type Serializable = SerializableNode | SerializableNodeArray | string | string[];
// interface SerializableNodeArray extends Array<Serializable> {}

// export interface SerializableNode extends Node {
//   toJSON(): any;
// }

function toJSON(arg: null): null;
function toJSON<T extends JSON>(arg: SerializableTo<T>): T;

function toJSON(arg) {
  return arg ? arg.toJSON() : null;
}


// function buildLoc(loc: Location): Location;
// function buildLoc(startLine, startColumn, endLine?, endColumn?, source?): Location;

// function buildLoc(...args): Location {
//   if (args.length === 1) {
//     let loc = args[0];

//     if (typeof loc === 'object') {
//       return {
//         source: buildSource(loc.source),
//         start: buildPosition(loc.start.line, loc.start.column),
//         end: buildPosition(loc.end.line, loc.end.column)
//       };
//     } else {
//       return null;
//     }
//   } else {
//     let [ startLine, startColumn, endLine, endColumn, source ] = args;
//     return {
//       source: buildSource(source),
//       start: buildPosition(startLine, startColumn),
//       end: buildPosition(endLine, endColumn)
//     };
//   }
// }

export let builders = {
  mustache: Mustache.build,
  block: Block.build,
  partial: Partial.build,
  comment: Comment.build,
  hbsComment: SourceComment.build,
  element: Element.build,
  attr: Attr.build,
  text: Text.build,
  sexpr: Sexpr.build,
  path: Path.build,
  string: literal,
  boolean: literal,
  number: literal,
  undefined: () => literal(undefined),
  null: () => literal(null),
  concat: Concat.build,
  hash: Named.build,
  pair: Pair.build,
  program: Program.build,
  loc: SourceLocation.build,
  pos: Position.build
};

export let fromHBS = {
  mustache: Mustache.fromHBS,
  block: Block.fromHBS,
  args: Args.fromHBS,
  partial: Partial.fromHBS,
  comment: SourceComment.fromHBS,
  sexpr: Sexpr.fromHBS,
  path: Path.fromHBS,
  string: Literal.fromHBS,
  boolean: Literal.fromHBS,
  number: Literal.fromHBS,
  undefined: Literal.fromHBS,
  null: Literal.fromHBS,
  hash: Named.fromHBS,
  pair: Pair.fromHBS,
  program: Program.fromHBS,
  position: Position.fromHBS
};

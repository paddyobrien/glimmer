import * as HBS from './parser/handlebars-ast';
import { Opaque, Dict } from 'glimmer-util';

export interface Node {
  type: number;
}

export type Serializable<T> = SerializableNode<T> | SerializableValue<T>;

export interface SerializableValue<T> {
  toJSON(): T;
}

interface SerializableNode<T> extends Node, SerializableValue<T> {}

export interface LocatableNode extends Node{
  loc: Location
}

interface SerializedCall<T extends SerializedPath | string> {
  [0]: T;
  [1]: SerializedArgs;
}

export enum Statement {
  Program,
  Element,
  ElementModifier,
  Attr,
  Text,
  Block,
  Partial,
  Comment,
  Mustache
}

export interface StatementNode extends SerializableNode<SerializedStatement>, LocatableNode {
  type: Statement;
  loc: Location;
}

export enum Expression {
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
  Args
}

export interface ExpressionNode extends SerializableNode<SerializedExpression>, LocatableNode {
  type: Expression;
  loc: Location;
}

type SerializedExpression = SerializedPath | SerializedSexpr | SerializedLiteral;

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

// Statements

type FIXME = any;

type SerializedMustache = SerializedCall<SerializedPath>;

export class Mustache implements StatementNode {
  static build(path: string, positional: ExpressionNode[], named: Dict<ExpressionNode>, trusting: boolean, loc: Location) {
    return new Mustache(
      Path.build(path, null),
      Args.build(positional, named, null),
      trusting,
      loc
    )
  }

  static fromHBS(node: HBS.Mustache): Mustache {
    let path = Path.fromHBS(node.path);
    let args = Args.fromHBS(node.params, node.hash);
    let trusting = !node.escaped;

    return new Mustache(path, args, !node.escaped, node.loc);
  }

  public type = Statement.Mustache;

  constructor(
    public path: Path,
    public args: Args,
    public trusting: boolean,
    public loc: Location
  ) {
  }

  toJSON(): SerializedMustache {
    return toJSON(
      this.path,
      this.args.withInternal([ Literal.build(this.trusting, null) ])
    );
  }
}

export type SerializedBlock = SerializedCall<"block">;

export class Block implements StatementNode, SerializableNode<SerializedBlock> {
  static build(path: string, positional: ExpressionNode[], named: Dict<ExpressionNode>, program: Program, inverse: Program, loc: Location) {
    return new Block(
      Path.build(path, null),
      Args.build(positional, named, null),
      program,
      inverse,
      loc
    );
  }

  static fromHBS(node: HBS.Block): Block {
    let path = Path.fromHBS(node.path);
    let args = Args.fromHBS(node.params, node.hash);
    let program = Program.fromHBS(node.program);
    let inverse = Program.fromHBS(node.inverse);

    return new Block(path, args, program, inverse, node.loc);
  }

  public type = Statement.Block;

  constructor(
    public path: Path,
    public args: Args,
    public program: Program,
    public inverse: Program,
    public loc: Location
  ) {
  }

  toJSON(): SerializedBlock {
    return toJSON(
      "block" as "block",
      this.args.withInternal([ this.program, this.inverse ])
    );
  }
}

export type SerializedPartial = SerializedCall<"partial">;

export class Partial implements StatementNode, SerializableNode<SerializedPartial> {
  static build(name: string, args: Args, indent: number, loc: Location) {
    return new Partial(name, args, indent, loc);
  }

  static fromHBS(node: HBS.Partial) {
    let args = Args.fromHBS(node.params, node.hash);
    return new Partial(node.name, args, node.indent, node.loc);
  }

  public type = Statement.Partial;

  constructor(
    public name: string,
    public args: Args,
    public indent: number,
    public loc: Location
  ) {
  }

  toJSON(): SerializedPartial {
    return toJSON(
      "partial" as "partial",
      this.args.withInternal([literal(this.name), literal(this.indent)])
    );
  }
}

export type SerializedSourceComment = SerializedCall<"comment">;

export class SourceComment implements StatementNode, SerializableNode<SerializedSourceComment> {
  static build(value: string, loc: Location): SourceComment {
    return new SourceComment(value, loc);
  }

  static fromHBS(node: HBS.Comment): SourceComment {
    return new SourceComment(node.value, node.loc);
  }

  public type = Statement.Comment;

  constructor(
    public value: string,
    public loc: Location
  ) {
  }

  toJSON(): SerializedSourceComment {
    return toJSON(
      "comment" as "comment",
      Args.internal([literal(this.value)])
    );
  }
}

// DOM

export interface HasChildren {
  appendChild(statement: StatementNode);
}

export type SerializedElement = SerializedCall<"element">;

export class Element implements StatementNode, HasChildren {
  static build(tag: string, attributes: Attr[], blockParams: string[], modifiers: Mustache[], children: StatementNode[], loc: Location) {
    return new Element(tag, attributes, blockParams, modifiers, children, loc);
  }

  public type = Statement.Element;

  constructor(
    public tag: string,
    public attributes: Attr[],
    public blockParams: string[],
    public modifiers: Mustache[],
    public children: StatementNode[], // TODO: break into Program
    public loc: Location
  ) {
  }

  toJSON(): SerializedElement {
    return toJSON(
      "element" as "element",
      Args.internal([literal(this.tag), InternalArgs.build(this.attributes)])
    )
  }

  appendChild(statement: StatementNode) {
    this.children.push(statement);
  }

  appendModifier(modifier: Mustache) {
    this.modifiers.push(modifier);
  }
}

export type SerializedAttr = SerializedCall<"attribute">;

export class Attr implements StatementNode, SerializableNode<SerializedAttr> {
  static build(name: string, value: ExpressionNode & SerializableNode<Opaque>, loc: Location): Attr {
    return new Attr(name, value, loc);
  }

  public type = Statement.Attr;

  constructor(
    public name: string,
    public value: ExpressionNode & SerializableNode<Opaque>,
    public loc: Location
  ) {
  }

  toJSON(): SerializedAttr {
    return toJSON(
      "attribute" as "attribute",
      Args.internal([ literal(this.name), this.value ])
    );
  }
}

export type SerializedText = SerializedCall<"text">;

export class Text implements StatementNode {
  static build(chars: string, loc: Location): Text {
    return new Text(chars, loc);
  }

  public type = Statement.Text;

  constructor(
    public chars: string,
    public loc: Location
  ) {
  }

  toJSON(): SerializedText {
    return toJSON(
      "text" as "text",
      Args.internal([literal(this.chars)])
    );
  }
}

export type SerializedComment = SerializedCall<"comment">;

export class Comment implements StatementNode {
  static build(value: string, loc: Location): Comment {
    return new Comment(value, loc);
  }

  public type = Statement.Comment;

  constructor(
    public value: string,
    public loc: Location
  ) {
  }

  toJSON(): SerializedComment {
    return toJSON(
      "comment" as "comment",
      Args.internal([literal(this.value)])
    );
  }
}

export class Concat {
  static build(parts: StatementNode[]): Concat {
    return new Concat(parts);
  }

  public type = Expression.Concat;

  constructor(public parts: StatementNode[]) {}
}

// Expressions

export type SerializedSexpr = SerializedCall<SerializedPath>;

export class Sexpr implements ExpressionNode, SerializableNode<SerializedSexpr> {
  static build(path: string, positional: ExpressionNode[], named: Dict<ExpressionNode>, loc: Location) {
    return new Sexpr(
      Path.build(path, null),
      Args.build(positional, named, null),
      loc
    );
  }

  static fromHBS(node: HBS.SubExpression): Sexpr {
    let path = Path.fromHBS(node.path);
    let args = Args.fromHBS(node.params, node.hash);
    return new Sexpr(path, args, node.loc);
  }

  type = Expression.Sexpr;

  constructor(
    public path: Path,
    public args: Args,
    public loc: Location
  ) {
  }

  toJSON(): SerializedSexpr {
    return toJSON(this.path, this.args);
  }
}

export type SerializedPath = string[];

export class Path implements ExpressionNode, SerializableNode<SerializedPath> {
  static build(original: string, loc: Location) {
    return new Path(original, original.split('.'), false, loc);
  }

  static fromHBS(path: HBS.Path): Path {
    return new Path(path.original, path.parts, path.data, path.loc);
  }

  public type = Expression.Path;

  constructor(
    public original: string,
    public parts: string[],
    public data: boolean,
    public loc: Location
  ) {
  }

  toJSON(): SerializedPath {
    return this.parts;
  }
}

type LiteralType = number | boolean | string | null | undefined;

type SerializedLiteralValue<T extends LiteralType> = T;
export type SerializedLiteral = SerializedLiteralValue<LiteralType>;

export abstract class Literal<T extends LiteralType> implements ExpressionNode, SerializableNode<SerializedLiteralValue<T>> {
  static fromHBS(node: HBS.Literal): Literal<LiteralType> {
    if (HBS.isString(node)) {
      return new String(node.value, node.loc);
    } else if (HBS.isBoolean(node)) {
      return new Boolean(node.value, node.loc);
    } else if (HBS.isNumber(node)) {
      return new Number(node.value, node.loc);
    } else if (HBS.isNull(node)) {
      return new Null(node.value, node.loc);
    } else if (HBS.isUndefined(node)) {
      return new Undefined(node.value, node.loc);
    }
  }

  static build(value: string, loc: Location): String;
  static build(value: number, loc: Location): Number;
  static build(value: boolean, loc: Location): Boolean;
  static build(value: null, loc: Location): Null;
  static build(value: undefined, loc: Location): Undefined;

  static build(value, loc): Literal<LiteralType> {
    if (typeof value === 'string') {
      return new String(value, loc);
    } else if (typeof value === 'boolean') {
      return new Boolean(value, loc);
    } else if (typeof value === 'number') {
      return new Number(value, loc);
    } else if (value === null) {
      return new Null(null, loc);
    } else if (value === undefined) {
      return new Undefined(undefined, loc);
    }
  }

  public type: Expression;

  constructor(public value: T, public loc: Location) {}

  toJSON(): SerializedLiteralValue<T> {
    return this.value;
  }
}

function literal(value: string): String;
function literal(value: number): Number;
function literal(value: boolean): Boolean;
function literal(value: null): Null;
function literal(value: undefined): Undefined;

function literal(value: LiteralType) {
  return Literal.build(value, SYNTHESIZED);
}

export type SerializedString = SerializedLiteralValue<string>;

export class String extends Literal<string> {
  public type = Expression.String;
}

export type SerializedBoolean = SerializedLiteralValue<boolean>;

export class Boolean extends Literal<boolean> {
  public type = Expression.Boolean;
}

export type SerializedNumber = SerializedLiteralValue<number>;

export class Number extends Literal<number> {
  public type = Expression.Number;
}

export type SerializedNull = SerializedLiteralValue<null>;

export class Null extends Literal<null> {
  public type = Expression.Null;
}

export type SerializedUndefined = SerializedLiteralValue<undefined>;

export class Undefined extends Literal<undefined> {
  public type = Expression.Undefined;
}

// Miscellaneous

export type SerializedArgs = [SerializedPositional, SerializedNamed];

export class Args implements SerializableNode<SerializedArgs> {
  static build(positional: ExpressionNode[], named: Dict<ExpressionNode>, internal: SerializableNode<Opaque>[]): Args {
    return new Args(new Positional(positional), Named.build(named), new InternalArgs(internal));
  }

  static internal(internal: SerializableNode<Opaque>[]): Args {
    return new Args(null, null, new InternalArgs(internal));
  }

  static fromHBS(params: HBS.Param[], hash: HBS.Hash): Args {
    return new Args(Positional.fromHBS(params), Named.fromHBS(hash), null);
  }

  public type = Expression.Args;

  constructor(
    public positional: Positional,
    public named: Named,
    public internal: InternalArgs
  ) {
  }

  withInternal(internal: SerializableNode<Opaque>[]) {
    return new Args(this.positional, this.named, new InternalArgs(internal));
  }

  toJSON(): SerializedArgs {
    return toJSON(this.positional, this.named, this.internal);
  }
}

type SerializedInternal = FIXME[];

export class InternalArgs implements SerializableNode<SerializedPositional> {
  static build(params: SerializableNode<FIXME>[]) {
    return new InternalArgs(params);
  }

  public type = Internal.Args;

  constructor(public params: SerializableNode<FIXME>[]) {}

  toJSON(): SerializedPositional {
    return this.params.map(e => toJSON(e));
  }
}

type SerializedPositional = SerializedExpression[];

export class Positional implements SerializableNode<SerializedPositional> {
  static fromHBS(params: HBS.Param[]) {
    return new Positional(params.map(paramToExpr));
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
    return new Named(keys.map(k => Pair.build(k, keys[k], null)));
  }

  static fromHBS(hash: HBS.Hash) {
    return new Named(hash.pairs.map(Pair.fromHBS));
  }

  public type = Expression.Named;

  constructor(public pairs: Pair[]) {}

  toJSON(): [string[], FIXME[]] {
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

export class Pair implements LocatableNode {
  static build(key: string, value: ExpressionNode, loc: Location): Pair {
    return new Pair(key, value, loc);
  }

  static fromHBS(pair: HBS.HashPair): Pair {
    return new Pair(pair.key, paramToExpr(pair.value), pair.loc);
  }

  public type = Expression.Pair;

  constructor(
    public key: string,
    public value: ExpressionNode,
    public loc: Location
  ) {
  }
}

export type SerializedProgram = [string[], SerializedStatement[]];

export class Program implements SerializableNode<SerializedProgram> {
  static build(body: StatementNode[], blockParams: string[], loc: Location): Program {
    return new Program(body, blockParams, loc);
  }

  static fromHBS(node: HBS.Program): Program {
    let body = node.body.map(stmtToStatement);
    return new Program(body, node.blockParams, node.loc);
  }

  public type = Statement.Program;

  constructor(
    public body: StatementNode[],
    public blockParams: string[],
    public loc: Location
  ) {
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
  static build({ line, column }: RawPosition) {
    return new Position(line, column);
  }

  constructor(
    public line: number,
    public column: number
  ) {
  }
}

function paramToExpr(node: HBS.Param): ExpressionNode {
  if (HBS.isLiteral(node)) {
    return Literal.fromHBS(node);
  } else if (HBS.isPath(node)) {
    return Path.fromHBS(node);
  } else if (HBS.isSubExpression(node)) {
    return Sexpr.fromHBS(node);
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
  }
}

function locForRange(nodes: HBS.Node[]): Location {
  let start = nodes[0].loc;
  let end = nodes[nodes.length - 1].loc;
  let source = start.source;

  return new Location(source, start.start, end.end);
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

export class Location {
  static build(start: RawPosition, end: RawPosition, source: string = null): Location {
    return new Location(source, start && Position.build(start), end && Position.build(end));
  }

  constructor(
    public source: string,
    public start: Position,
    public end: Position
  ) {
  }
}

export const SYNTHESIZED: Location = null;

export type DOMNode = Text | Element | Comment;

export function isDOMNode(node: Node): node is DOMNode {
  return node.type === Statement.Text || node.type === Statement.Element || node.type === Statement.Comment;
}

// export type Serializable = SerializableNode | SerializableNodeArray | string | string[];
// interface SerializableNodeArray extends Array<Serializable> {}

// export interface SerializableNode extends Node {
//   toJSON(): any;
// }


function toJSON<T>(t: Serializable<T>): [T];
function toJSON<T extends string>(t: T): [T];
function toJSON<T, U>(t: Serializable<T>, u: Serializable<U>): [T, U];
function toJSON<T extends string, U>(t: T, u: Serializable<U>): [T, U];
function toJSON<T, U, V>(t: Serializable<T>, u: Serializable<U>, v: Serializable<V>): [T, U, V];
function toJSON<T extends string, U, V>(t: T, u: Serializable<U>, v: Serializable<V>): [T, U, V];
function toJSON<T, U, V, W>(t: Serializable<T>, u: Serializable<U>, v: Serializable<V>, w: Serializable<W>): [T, U, V, W];
function toJSON<T extends string, U, V, W>(t: string, u: Serializable<U>, v: Serializable<V>, w: Serializable<W>): [T, U, V, W];

function toJSON(...args) {
  return args.map(a => {
    return a && (typeof a === 'string' ? a : a.toJSON());
  });
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
  string: String.build,
  boolean: Boolean.build,
  number: Number.build,
  undefined: Undefined.build,
  null: Null.build,
  concat: Concat.build,
  hash: Named.build,
  pair: Pair.build,
  program: Program.build,
  loc: Location.build,
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
  string: String.fromHBS,
  boolean: Boolean.fromHBS,
  number: Number.fromHBS,
  undefined: Undefined.fromHBS,
  null: Null.fromHBS,
  hash: Named.fromHBS,
  pair: Pair.fromHBS,
  program: Program.fromHBS,
};

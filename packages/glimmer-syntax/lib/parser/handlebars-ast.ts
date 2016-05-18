import { Opaque, Option } from 'glimmer-util';

export interface Position {
  line: number;
  column: number;
}

export interface Location {
  source: string;
  start: Position;
  end: Position;
}

export type NodeType =
    LiteralType
  | StatementType
  | ExpressionType
  | 'Program'
  | 'Hash'
  | 'HashPair'
  ;

export type StatementType =
    'MustacheStatement'
  | 'BlockStatement'
  | 'PartialStatement'
  | 'ContentStatement'
  | 'CommentStatement'
  ;

export type ExpressionType =
    LiteralType
  | 'SubExpression'
  | 'PathExpression'
  ;

export type LiteralType =
    'StringLiteral'
  | 'NumberLiteral'
  | 'BooleanLiteral'
  | 'UndefinedLiteral'
  | 'NullLiteral'
  ;

export interface Node {
  type: NodeType;
  loc: Location
}

export interface InternalNode {
  type: NodeType;
  loc: Location | null;
}

export interface StripFlags {
  open: boolean;
  close: boolean;
}

export interface Statement extends Node {
  type: StatementType;
}

export interface Expression extends Node {
  type: ExpressionType;
}

export interface Program extends Node {
  type: 'Program';
  body: Statement[];
  blockParams?: string[];
  strip: StripFlags;
  chained: Option<boolean>;
}

export interface Call extends Node {
  path: Path;
  params: Param[];
  hash: Hash;
}

export interface Mustache extends Call, Statement {
  type: 'MustacheStatement';
  path: Path;
  params: Param[];
  hash: Hash;
  escaped: boolean;
  strip: StripFlags;
}

export interface Block extends Call, Statement {
  type: 'BlockStatement';
  path: Path;
  params: Param[];
  hash: Hash;
  program: Program;
  inverse: Program;
  chained: Option<boolean>;
  openStrip: StripFlags;
  inverseStrip: StripFlags;
  closeStrip: StripFlags;
}

export interface SubExpression extends Call, Expression {
  type: 'SubExpression';
  path: Path;
  params: Param[];
  hash: Hash;
}

export interface Path extends Expression {
  type: 'PathExpression';
  loc: Location;
  data: boolean;
  original: string;
  parts: string[];
  depth: number;
}

export interface Comment extends Statement {
  type: 'CommentStatement';
  value: string;
  strip: StripFlags;
}

export interface Content extends Statement {
  type: 'ContentStatement';
  loc: Location;
  original: string;
  value: string;
  leftStripped: boolean;
  rightStripped: boolean;
}

export interface Partial extends Statement {
  type: 'PartialStatement';
  name: Path;
  params?: Param[];
  hash?: Hash;
  indent: number;
  strip: StripFlags;
}

export type Param = SubExpression | Expr;

export interface HashPair extends Node {
  type: 'HashPair';
  key: string;
  value: Param;
}

export interface Hash extends InternalNode {
  type: 'Hash';
  pairs: HashPair[];
}

interface ASTLiteral<T extends LiteralType, U> extends Expression {
  type: T;
  original: U;
  value: U;
}

export type String = ASTLiteral<'StringLiteral', string>;
export type Number = ASTLiteral<'NumberLiteral', number>;
export type Boolean = ASTLiteral<'BooleanLiteral', boolean>;
export type Undefined = ASTLiteral<'UndefinedLiteral', undefined>;
export type Null = ASTLiteral<'NullLiteral', null>;
export type Literal = String | Number | Boolean | Undefined | Null;

function is<T extends Node>(variant: NodeType): (value: Node) => value is T {
  return function(value: Node): value is T {
    return value.type === variant;
  };
}

export const isString         = is<String>('StringLiteral');
export const isNumber         = is<Number>('NumberLiteral');
export const isBoolean        = is<Boolean>('BooleanLiteral');
export const isUndefined      = is<Undefined>('UndefinedLiteral');
export const isNull           = is<Null>('NullLiteral');
export const isPath           = is<Path>('PathExpression');
export const isSubExpression  = is<SubExpression>('SubExpression');

export function isLiteral(node: Node): node is Literal {
  let type = node.type;
  return  type === 'StringLiteral' || type === 'NumberLiteral' ||
          type === 'BooleanLiteral' || type === 'UndefinedLiteral' ||
          type === 'NullLiteral';
}

export const isMustache       = is<Mustache>('MustacheStatement');
export const isBlock          = is<Block>('BlockStatement');
export const isPartial        = is<Partial>('PartialStatement');
export const isContent        = is<Content>('ContentStatement');
export const isComment        = is<Comment>('CommentStatement');

type Expr = Path | String | Number | Boolean | Undefined | Null;

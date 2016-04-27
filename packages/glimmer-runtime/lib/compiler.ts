import { FIXME, Opaque, Slice, LinkedList, InternedString } from 'glimmer-util';
import { OpSeq, Opcode } from './opcodes';

import * as Syntax from './syntax/core';
import { Environment } from './environment';
import SymbolTable from './symbol-table';
import { Block, CompiledBlock, EntryPoint, InlineBlock, Layout } from './compiled/blocks';

import OpcodeBuilder, {
  StaticComponentOptions,
  DynamicComponentOptions
} from './opcode-builder';

import {
  Statement as StatementSyntax,
  Attribute as AttributeSyntax,
  StatementCompilationBuffer,
} from './syntax';

import {
  Expression
} from './syntax';

import {
  FunctionExpression,
  default as makeFunctionExpression
} from './compiled/expressions/function';

import OpcodeBuilderDSL from './compiled/opcodes/builder';

import * as Component from './component/interfaces';
import { CACHED_LAYOUT } from './component/interfaces';

abstract class Compiler {
  public env: Environment;
  protected block: Block;
  protected symbolTable: SymbolTable;
  protected current: StatementSyntax;

  constructor(block: Block, env: Environment) {
    this.block = block;
    this.current = block.program.head();
    this.env = env;
    this.symbolTable = block.symbolTable;
  }

  protected compileStatement(statement: StatementSyntax, ops: OpcodeBuilderDSL) {
    this.env.statement(statement).compile(ops, this.env, this.symbolTable);
  }
}

function compileStatement(env: Environment, statement: StatementSyntax, ops: OpcodeBuilderDSL, symbolTable: SymbolTable) {
  env.statement(statement).compile(ops, env, symbolTable);
}

export default Compiler;

export class EntryPointCompiler extends Compiler {
  private ops: OpcodeBuilderDSL;
  protected block: EntryPoint;

  constructor(template: EntryPoint, env: Environment) {
    super(template, env);
    let list = new CompileIntoList(env, template.symbolTable);
    this.ops = new OpcodeBuilderDSL(list, env);
  }

  compile(): OpSeq {
    let { block, ops } = this;
    let { program } = block;

    let current = program.head();

    while (current) {
      let next = program.nextNode(current);
      this.compileStatement(current, ops);
      current = next;
    }

    return ops.toOpSeq();
  }

  append(op: Opcode) {
    this.ops.append(op);
  }

  getLocalSymbol(name: InternedString): number {
    return this.symbolTable.getLocal(name);
  }

  getNamedSymbol(name: InternedString): number {
    return this.symbolTable.getNamed(name);
  }

  getYieldSymbol(name: InternedString): number {
    return this.symbolTable.getYield(name);
  }
}

export class InlineBlockCompiler extends Compiler {
  private ops: OpcodeBuilderDSL;
  protected block: InlineBlock;
  protected current: StatementSyntax;

  constructor(block: InlineBlock, env: Environment) {
    super(block, env);
    let list = new CompileIntoList(env, block.symbolTable);
    this.ops = new OpcodeBuilderDSL(list, env);
  }

  compile(): OpSeq {
    let { block, ops } = this;
    let { program } = block;

    if (block.hasPositionalParameters()) {
      ops.bindPositionalArgs(block);
    }

    let current = program.head();

    while (current) {
      let next = program.nextNode(current);
      this.compileStatement(current, ops);
      current = next;
    }

    return ops.toOpSeq();
  }
}

export interface ComponentParts {
  tag: InternedString;
  attrs: Slice<AttributeSyntax<Opaque>>;
  body: Slice<StatementSyntax>;
}

export interface CompiledComponentParts {
  tag: InternedString;
  preamble: CompileIntoList;
  main: CompileIntoList;
}

export function layoutFor(definition: Component.ComponentDefinition<any>, env: Environment): CompiledBlock {
  let layout = definition[CACHED_LAYOUT];
  if (layout) return layout;

  let builder = new ComponentLayoutBuilder(env);

  definition['compile'](builder);

  return definition[CACHED_LAYOUT] = builder.compile();
}

class ComponentLayoutBuilder implements Component.ComponentLayoutBuilder {
  public env: Environment;

  private inner: EmptyBuilder | WrappedBuilder | UnwrappedBuilder;

  constructor(env: Environment) {
    this.env = env;
  }

  empty() {
    this.inner = new EmptyBuilder(this.env);
  }

  wrapLayout(layout: Layout) {
    this.inner = new WrappedBuilder(this.env, layout);
  }

  fromLayout(layout: Layout) {
    this.inner = new UnwrappedBuilder(this.env, layout);
  }

  compile(): CompiledBlock {
    return this.inner.compile();
  }

  get tag(): Component.ComponentTagBuilder {
    return this.inner.tag;
  }

  get attrs(): Component.ComponentAttrsBuilder {
    return this.inner.attrs;
  }
}

class EmptyBuilder {
  public env: Environment;

  constructor(env: Environment) {
    this.env = env;
  }

  get tag(): Component.ComponentTagBuilder {
    throw new Error('Nope');
  }

  get attrs(): Component.ComponentAttrsBuilder {
    throw new Error('Nope');
  }

  compile(): CompiledBlock {
    let { env } = this;

    let list = new CompileIntoList(env, null);
    return new CompiledBlock(list, 0);
  }
}

class WrappedBuilder {
  private layout: Layout;
  public env: Environment;

  public tag = new ComponentTagBuilder();
  public attrs = new ComponentAttrsBuilder();

  constructor(env: Environment, layout: Layout) {
    this.env = env;
    this.layout = layout;
  }

  compile(): CompiledBlock {
    //========DYNAMIC
    //        PutValue(TagExpr)
    //        Test
    //        JumpUnless(BODY)
    //        OpenDynamicPrimitiveElement
    //        DidCreateElement
    //        ...attr statements...
    // BODY:  Noop
    //        PutValue(TagExpr)
    //        Test
    //        JumpUnless(END)
    //        CloseElement
    // END:   Noop
    //        Exit
    //
    //========STATIC
    //        OpenPrimitiveElementOpcode
    //        DidCreateElement
    //        ...attr statements...
    //        CloseElement
    //        Exit

    let { env, layout } = this;

    let symbolTable = layout.symbolTable;
    let buffer = new CompileIntoList(env, layout.symbolTable);
    let dsl = new OpcodeBuilderDSL(buffer, env);

    dsl.startLabels();

    if (this.tag.isDynamic) {
      dsl.putValue(this.tag.dynamicTagName);
      dsl.test();
      dsl.jumpUnless('BODY');
      dsl.openDynamicPrimitiveElement();
      dsl.didCreateElement();
      this.attrs['buffer'].forEach(statement => compileStatement(env, statement, dsl, symbolTable));
      dsl.label('BODY');
    } else if (this.tag.isStatic) {
      let tag = this.tag.staticTagName;
      dsl.openPrimitiveElement(tag);
      dsl.didCreateElement();
      this.attrs['buffer'].forEach(statement => compileStatement(env, statement, dsl, symbolTable));
    }

    if (layout.hasNamedParameters()) {
      dsl.bindNamedArgsForLayout(layout);
    }

    if (layout.hasYields()) {
      dsl.bindBlocksForLayout(layout);
    }

    layout.program.forEachNode(statement => compileStatement(env, statement, dsl, layout.symbolTable));

    if (this.tag.isDynamic) {
      dsl.putValue(this.tag.dynamicTagName);
      dsl.test();
      dsl.jumpUnless('END');
      dsl.closeElement();
      dsl.label('END');
    } else if (this.tag.isStatic) {
      dsl.closeElement();
    }

    dsl.stopLabels();

    return new CompiledBlock(dsl.toOpSeq(), symbolTable.size);
  }
}

class UnwrappedBuilder {
  private layout: Layout;
  public env: Environment;

  public attrs = new ComponentAttrsBuilder();

  constructor(env: Environment, layout: Layout) {
    this.env = env;
    this.layout = layout;
  }

  get tag(): Component.ComponentTagBuilder {
    throw new Error('BUG: Cannot call `tag` on an UnwrappedBuilder');
  }

  compile(): CompiledBlock {
    let { env, layout } = this;

    let buffer = new CompileIntoList(env, layout.symbolTable);
    let dsl = new OpcodeBuilderDSL(buffer, env);

    dsl.startLabels();

    if (layout.hasNamedParameters()) {
      dsl.bindNamedArgsForLayout(layout);
    }

    if (layout.hasYields()) {
      dsl.bindBlocksForLayout(layout);
    }

    let attrs = this.attrs['buffer'];
    let attrsInserted = false;

    this.layout.program.forEachNode(statement => {
      compileStatement(env, statement, dsl, layout.symbolTable);

      if (!attrsInserted && isOpenElement(statement)) {
        dsl.didCreateElement();
        dsl.shadowAttributes();
        attrs.forEach(statement => compileStatement(env, statement, dsl, layout.symbolTable));
        attrsInserted = true;
      }
    });

    dsl.stopLabels();

    return new CompiledBlock(dsl.toOpSeq(), layout.symbolTable.size);
  }
}

type OpenElement = Syntax.OpenElement | Syntax.OpenPrimitiveElement;

function isOpenElement(syntax: StatementSyntax): syntax is OpenElement {
  return syntax instanceof Syntax.OpenElement || syntax instanceof Syntax.OpenPrimitiveElement;
}

class ComponentTagBuilder implements Component.ComponentTagBuilder {
  public isDynamic = null;
  public isStatic = null;
  public staticTagName: InternedString = null;
  public dynamicTagName: Expression<string> = null;

  static(tagName: InternedString) {
    this.isStatic = true;
    this.staticTagName = tagName;
  }

  dynamic(tagName: FunctionExpression<string>) {
    this.isDynamic = true;
    this.dynamicTagName = makeFunctionExpression(tagName);
  }
}

class ComponentAttrsBuilder implements Component.ComponentAttrsBuilder {
  private buffer: AttributeSyntax<string>[] = [];

  static(name: string, value: string) {
    this.buffer.push(new Syntax.StaticAttr({ name: name as FIXME<'intern'>, value: value as FIXME<'intern'> }));
  }

  dynamic(name: string, value: FunctionExpression<string>) {
    this.buffer.push(new Syntax.DynamicAttr({ name: name as FIXME<'intern'>, value: makeFunctionExpression(value) }));
  }
}

class ComponentBuilder {
  private env: Environment;

  constructor(private dsl: OpcodeBuilderDSL) {
    this.env = dsl.env;
  }

  static({ definition, args, shadow, templates }: StaticComponentOptions) {
    this.dsl.unit({ templates }, dsl => {
      dsl.putComponentDefinition(args, definition);
      dsl.openComponent(shadow);
      dsl.closeComponent();
    });
  }

  dynamic({ definitionArgs, definition, args, shadow, templates }: DynamicComponentOptions) {
    this.dsl.unit({ templates }, dsl => {
      dsl.enter('BEGIN', 'END');
      dsl.label('BEGIN');
      dsl.putArgs(definitionArgs);
      dsl.putValue(makeFunctionExpression(definition));
      dsl.test();
      dsl.jumpUnless('END');
      dsl.putDynamicComponentDefinition(args);
      dsl.openComponent(shadow);
      dsl.closeComponent();
      dsl.label('END');
      dsl.exit();
    });
  }
}

export class CompileIntoList extends LinkedList<Opcode> implements OpcodeBuilder, StatementCompilationBuffer {
  private env: Environment;
  private symbolTable: SymbolTable;

  public component: ComponentBuilder;

  constructor(env: Environment, symbolTable: SymbolTable) {
    super();
    this.env = env;
    this.symbolTable = symbolTable;

    let dsl = new OpcodeBuilderDSL(this, env);
    this.component = new ComponentBuilder(dsl);
  }

  getLocalSymbol(name: InternedString): number {
    return this.symbolTable.getLocal(name);
  }

  hasLocalSymbol(name: InternedString): boolean {
    return typeof this.symbolTable.getLocal(name) === 'number';
  }

  getNamedSymbol(name: InternedString): number {
    return this.symbolTable.getNamed(name);
  }

  hasNamedSymbol(name: InternedString): boolean {
    return typeof this.symbolTable.getNamed(name) === 'number';
  }

  getBlockSymbol(name: InternedString): number {
    return this.symbolTable.getYield(name);
  }

  hasBlockSymbol(name: InternedString): boolean {
    return typeof this.symbolTable.getYield(name) === 'number';
  }

  hasKeyword(name: InternedString): boolean {
    return this.env.hasKeyword(name);
  }

  toOpSeq(): OpSeq {
    return this;
  }
}

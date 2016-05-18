import * as AST from '../parser/handlebars-ast';
import * as Node from '../builders';
import { Node as INode } from '../builders';
import { Option, Opaque } from 'glimmer-util';

type Intermediate = Node.ExpressionNode | Node.Ident | Node.Args | Node.Positional | Node.Named;

export function buildExpression(ast: Intermediate): string {
  switch(ast.type) {
    case Node.Expression.Path:
      return (ast as Node.Path).original;

    case Node.Expression.Ident:
      return (ast as Node.Ident).path;

    case Node.Expression.Args:
      let args = ast as Node.Args;
      return compactJoin([buildExpression(args.positional), buildExpression(args.named)], ' ');

    case Node.Expression.Positional:
      let positional = ast as Node.Positional;
      return compactJoin(buildIntermediates(positional.expressions), ' ');

    case Node.Expression.Named:
      let named = ast as Node.Named;
      return compactJoin(named.pairs.map(p => `${p.key}=${buildExpression(p.value)}`), ' ');

    case Node.Expression.Sexpr:
      let sexpr = ast as Node.Sexpr;
      let pieces = compactJoin([ buildExpression(sexpr.path), buildExpression(sexpr.args.positional), buildExpression(sexpr.args.named) ], ' ')
      return `(${pieces})`;

    case Node.Expression.Boolean:
    case Node.Expression.Number:
    case Node.Expression.Null:
    case Node.Expression.String:
      return `${JSON.stringify(ast)}`;

    case Node.Expression.Undefined:
      return `undefined`;

    default:
      throw new Error(`BUG: Called buildExpression with ${JSON.stringify(ast)}, which is not an expression`);
  }
}

type TopLevel = Node.StatementNode | Node.Program | Node.Concat;

export default function print(ast: Node.Program): string {
  return buildStatement(ast);
}

export function buildStatement(ast: TopLevel): string {
  if(!ast) {
    return '';
  }

  const output = [];

  switch(ast.type) {
    case Node.Statement.Program: {
      let program = ast as Node.Program;
      let chainBlock = program.chained && program.body[0];
      if (chainBlock && chainBlock instanceof Node.Block) {
        chainBlock.chained = true;
      }

      return buildTopLevels(program.body).join('');
    }

    case Node.Statement.Element:
      let element = ast as Node.Element;
      output.push('<', element.tag);
      if(element.attributes.length) {
        output.push(' ', buildTopLevels(element.attributes).join(' '));
      }
      if(element.modifiers.length) {
        output.push(' ', buildTopLevels(element.modifiers).join(' '));
      }
      output.push('>');
      output.push.apply(output, buildTopLevels(element._children));
      output.push('</', element.tag, '>');
      break;

    case Node.Statement.Attr:
      let attr = ast as Node.Attr;
      output.push(attr.name, '=');
      const value = buildStatement(attr.value);
      if(attr.value.type === Node.Statement.Text) {
        output.push('"', value, '"');
      } else {
        output.push(value);
      }
    break;

    case Node.Expression.Concat:
      let concat = ast as Node.Concat;
      let parts = concat.parts.map(node => {
        if(node.type === Node.Statement.Text) {
          return (node as Node.Text).chars;
        } else {
          return buildStatement(node);
        }
      });
      return `"${parts.join('')}"`

    case Node.Statement.Text:
      return (ast as Node.Text).chars;

    case Node.Statement.Mustache:
      return compactJoin(['{{', pathParams(ast as Node.Mustache), '}}']);

    case Node.Statement.Block:
      let block = ast as Node.Block;

      const lines = [];

      if(block.chained){
        lines.push(['{{else ', pathParams(block), '}}'].join(''));
      } else {
        lines.push(openBlock(block));
      }

      lines.push(buildStatement(block.program));

      if (block.inverse) {
        if(!block.inverse.chained){
          lines.push('{{else}}');
        }
        lines.push(buildStatement(block.inverse));
      }

      if (!block.chained){
        lines.push(closeBlock(block));
      }

      return lines.join('');

    case Node.Statement.Partial:
      return compactJoin(['{{>', pathParams(ast as Node.Partial), '}}']);


    case Node.Statement.Comment:
      return compactJoin(['<!--', (ast as Node.Comment).value, '-->']);

    default:
      throw new Error(`BUG: Called buildStatement with ${JSON.stringify(ast)}, which is not a statement`);
  }

  return output.join('');
}

function compact(array: Option<Opaque>[]) {
  const newArray = [];
  array.forEach(function(a) {
    if(typeof(a) !== 'undefined' && a !== null && a !== '') {
      newArray.push(a);
    }
  });
  return newArray;
}

function buildTopLevels(nodes: TopLevel[]) {
  return nodes.map(buildStatement);
}

function buildIntermediates(nodes: Intermediate[]) {
  return nodes.map(buildExpression);
}

function pathParams(ast: Node.CallNode) {
  let path = buildExpression(ast.path);
  let args = buildExpression(ast.args);

  return compactJoin([path, args], ' ');
}

function compactJoin(array: string[], delimiter?: string): string {
  return compact(array).join(delimiter || '');
}

function blockParams(block: Node.Block): string {
  let params = block.program.blockParams;

  if(params.length) {
    return ` as |${params.join(',')}|`;
  } else {
    return '';
  }
}

function openBlock(block: Node.Block) {
  return ['{{#', pathParams(block), blockParams(block), '}}'].join('');
}

function closeBlock(block: Node.Block) {
  return ['{{/', buildExpression(block.path), '}}'].join('');
}

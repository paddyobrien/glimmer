declare module "handlebars/compiler/base" {
  import * as AST from "glimmer-syntax/lib/parser/handlebars-ast";
  export function parse(html: string): AST.Program;
}

import { AST, parse } from 'glimmer-syntax';

function normalize(program: AST.Program) {
  return {
    body: normalizeStatements(program.body),
    blockParams: program.blockParams,
    loc: normalizeLoc(program._loc)
  }
}

function normalizeStatements(nodes: AST.StatementNode[]) {
  return nodes.map(normalizeStatement);
}

function normalizeStatement(node: AST.StatementNode) {
  return node.toJSON();
}

function normalizeLoc(loc: AST.Location) {
  return AST.jsonLocation(loc);
}

export function astEqual(actual: string | AST.Program, expected: string | AST.Program, message?: string) {
  let actualAST: AST.Program;
  let expectedAST: AST.Program;

  if (typeof actual === 'string') {
    actualAST = parse(actual);
  } else {
    actualAST = actual;
  }

  if (typeof expected === 'string') {
    expectedAST = parse(expected);
  } else {
    expectedAST = expected;
  }

  deepEqual(normalize(actualAST), normalize(expectedAST), message);
}

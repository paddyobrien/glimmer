import { parse, AST } from "glimmer-syntax";
import { Maybe, unwrap } from "glimmer-util";

QUnit.module("[glimmer-syntax] Parser - Location Info");

function locEqual(possibleNode: Maybe<AST.LocatableNode>, startLine: number, startColumn: number, endLine: number, endColumn: number, message?: string) {
  let node = unwrap(possibleNode);

  let expected = {
    source: null,
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn }
  };

  let actual = AST.jsonLocation(node._loc);

  deepEqual(actual, expected, message);
}

test("programs", function() {
  let ast = parse(`
  {{#if foo}}
    {{bar}}
       {{/if}}
    `);

  locEqual(ast, 1, 0, 5, 4, 'outer program');

  // startColumn should be 13 not 2.
  // This should be fixed upstream in Handlebars.
  locEqual((ast.body[1] as AST.Block).program, 2, 2, 4, 7, 'nested program');
});

test("blocks", function() {
  let ast = parse(`
  {{#if foo}}
    {{#if bar}}
        test
        {{else}}
      test
  {{/if    }}
       {{/if
      }}
    `);

  let [,block] = ast.body as [any, AST.Block];
  let [nestedBlock] = block.program.body as [AST.Block];
  let [nestedBlockText] = nestedBlock.program.body;
  let nestedInverse = nestedBlock.inverse;

  debugger;
  locEqual(block, 2, 2, 9, 8, 'outer block');
  locEqual(nestedBlock, 3, 4, 7, 13, 'nested block');
  locEqual(nestedBlockText, 4, 0, 5, 0);
  locEqual(nestedInverse, 5, 8, 7, 2);
});

test("mustache", function() {
  let ast = parse(`
    {{foo}}
    {{#if foo}}
      bar: {{bar
        }}
    {{/if}}
  `);

  let [,foo,,innerBlock] = ast.body as [any, AST.Mustache, any, AST.Block];
  let [path] = unwrap(innerBlock.args.positional.expressions) as [AST.Path];
  let [barText, bar] = innerBlock.program.body;

  locEqual(foo, 2, 4, 2, 11, 'outer mustache');
  locEqual(path, 3, 10, 3, 13, 'positional args');
  locEqual(barText, 4, 0, 4, 11, 'inner text');
  locEqual(bar, 4, 11, 5, 10, 'inner mustache');
});

test("element modifier", function() {
  let ast = parse(`
    <div {{bind-attr
      foo
      bar=wat}}></div>
  `);

  let [,element] = ast.body as [any, AST.Element];
  let [bindAttr] = element.modifiers;
  let [foo] = unwrap(bindAttr).args.positional.expressions;
  let [bar] = unwrap(bindAttr).args.named.pairs;
  let { key: barKey, value: wat } = unwrap(bar);

  locEqual(bindAttr, 2, 9, 4, 15, 'element modifier');
  locEqual(foo, 3, 6, 3, 9, 'modifier positional arg');
  locEqual(bar, 4, 6, 4, 13, 'modifier named arg');
  locEqual(wat, 4, 10, 4, 13, 'modifier named value');
});

test("html elements", function() {
  let ast = parse(`
    <section>
      <br>
      <div>
        <hr />
      </div>
    </section>
  `);

  let [,section] = ast.body as [any, AST.Element];
  let [,br,,div] = section._children as [any, AST.Element, any, AST.Element];
  let [,hr] = div._children as [any, AST.Element];

  locEqual(section, 2, 4, 7, 14, 'section element');
  locEqual(br, 3, 6, 3, 10, 'br element');
  locEqual(div, 4, 6, 6, 12, 'div element');
  locEqual(hr, 5, 8, 5, 14, 'hr element');
});

test("html elements with nested blocks", function() {
  let ast = parse(`
    <div>
      {{#if isSingleError}}
        Single error here!
      {{else if errors}}
        Multiple errors here!
      {{else}}
        No errors found!
      {{/if}} <p>Hi there!</p>
    </div>
  `);

  let [,div] = ast.body as [any, AST.Element];
  let [,ifBlock,,p] = div._children as [any, AST.Block, any, AST.Element];
  let inverseBlock = ifBlock.inverse;
  let [nestedIfBlock] = inverseBlock.body as [AST.Block];
  let nestedIfInverseBlock = nestedIfBlock.inverse;

  locEqual(div, 2, 4, 10, 10, 'div element');
  locEqual(ifBlock, 3, 6, 9, 13, 'outer if block');
  locEqual(inverseBlock, 5, 6, 9, 6, 'inverse block');
  locEqual(nestedIfBlock, 5, 6, 9, 6, 'nested if block');
  locEqual(nestedIfInverseBlock, 7, 6, 9, 6, 'nested inverse block');
  locEqual(p, 9, 14, 9, 30, 'p');
});

test("block + newline + element ", function() {
  var ast = parse(`
    {{#if stuff}}
    {{/if}}
    <p>Hi!</p>
  `);

  let [,ifBlock,,p] = ast.body;

  locEqual(ifBlock, 2, 4, 3, 11, 'if block');
  locEqual(p, 4, 4, 4, 14, 'p element');
});

test("mustache + newline + element ", function() {
  var ast = parse(`
    {{foo}}
    <p>Hi!</p>
  `);

  let [,fooMustache,,p] = ast.body;

  locEqual(fooMustache, 2, 4, 2, 11, 'if block');
  locEqual(p, 3, 4, 3, 14, 'p element');
});

test("blocks with nested html elements", function() {
  let ast = parse(`
    {{#foo-bar}}<div>Foo</div>{{/foo-bar}} <p>Hi!</p>
  `);

  let [,block,text,p] = ast.body as [any, AST.Block, AST.Text, AST.Element];
  let program = block.program;
  let [div] = program.body as [AST.Element];

  locEqual(block, 2, 4, 2, 42, 'block');
  locEqual(p, 2, 43, 2, 53, 'p element');
  locEqual(text, 2, 42, 2, 43, 'text');
  locEqual(div, 2, 16, 2, 30, 'div element');
});

test("html elements after mustache", function() {
  let ast = parse(`
    {{foo-bar}} <p>Hi!</p>
  `);

  let [,mustache,,p] = ast.body;

  locEqual(mustache, 2, 4, 2, 15, '{{foo-bar}}');
  locEqual(p, 2, 16, 2, 26, 'div element');
});

test("text", function() {
  let ast = parse(`
    foo!
    <div>blah</div>
  `);

  let [fooText,div] = ast.body as [AST.Text, AST.Element];
  let [blahText] = div._children as [AST.Text];

  locEqual(fooText, 1, 0, 3, 4);
  locEqual(blahText, 3, 9, 3, 13);
});

test("comment", function() {
  let ast = parse(`
    <div><!-- blah blah blah blah --></div>
  `);

  let [,div] = ast.body as [any, AST.Element];
  let [comment] = div._children as [AST.Comment];

  locEqual(comment, 2, 12, 2, 36);
});

test("element attribute", function() {
  let ast = parse(`
    <div data-foo="blah"
      data-derp="lolol">
      Hi, fivetanley!
    </div>
  `);

  let [,div] = ast.body as [any, AST.Element];
  let [dataFoo, dataDerp] = div.attributes;

  locEqual(dataFoo, 2, 10, 2, 24);
  locEqual(dataDerp, 3, 7, 3, 23);
});

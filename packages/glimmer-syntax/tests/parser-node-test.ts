import { parse as handlebarsParse } from "handlebars/compiler/base";
import { parse, builders as b, AST } from "glimmer-syntax";
import { astEqual } from "./support";

QUnit.jsDump.maxDepth = 100;

QUnit.module("[glimmer-syntax] Parser - AST");

test("a simple piece of content", function() {
  let { template: t, locs: [text] } = build(['some content']);

  astEqual(t, b.program().children([
    b.text('some content').location(text)
  ]).location(text));
});

test("allow simple AST to be passed", function() {
  let { template: ast, locs: [simple] } = build(["simple"]);

  astEqual(ast, b.program().children([
    b.text('simple').location(simple)
  ]).location(simple))
});

test("allow an AST with mustaches to be passed", function() {
  let { template, locs: [h1, some, closeH1, ast, mustacheOpen, fooBar, mustacheClose] } =
    build(["<h1>", "some", "</h1>", " ast ", "{{", "foo.bar", "}}"]);

  astEqual(template, b.program().children([
    b.element('h1').children([
      b.text('some').location(some)
    ]).location(h1, closeH1),

    b.text(" ast ").location(ast),

    b.mustache(b.path('foo.bar').location(fooBar)).location(mustacheOpen, mustacheClose)
  ]).location(h1, mustacheClose))
});

test("self-closed element", function() {
  let { template: t, locs: [g] } = build(['<g />']);

  astEqual(t, b.program().children([
    b.element("g").location(g)
  ]).location(g));
});

test("elements can have empty attributes", function() {
  let { template: t, locs: [openImg, idName, idValue, closeImg] } = build(['<img ', 'id=', '""', '>']);

  astEqual(t, b.program().children([
    b.element('img', [ b.attr('id', b.text('').location(idValue)).location(idName, idValue) ]).location(openImg, closeImg)
  ]).location(openImg, closeImg))
});

test("svg content", function() {
  let t = "<svg></svg>";
  astEqual(t, b.program([
    b.element("svg").loc([1, 0], [1, 11])
  ]).loc([1, 0], [1, 11]));
});

test("html content with html content inline", function() {
  let t = '<div><p></p></div>';

  astEqual(t, b.program([
    b.element("div").children([
      b.element("p").loc([1, 5], [1, 12])
    ]).loc([1, 0], [1, 18])
  ]).loc([1, 0], [1, 18]));
});

test("html content with svg content inline", function() {
  let t = '<div><svg></svg></div>';

  astEqual(t, b.program([
    b.element("div").children([
      b.element("svg").loc([1, 5], [1, 16])
    ]).loc([1, 0], [1, 22])
  ]).loc([1, 0], [1, 22]));
});

let integrationPoints = ['foreignObject', 'desc', 'title'];
function buildIntegrationPointTest(integrationPoint){
  return function integrationPointTest() {
    let t = '<svg><'+integrationPoint+'><div></div></'+integrationPoint+'></svg>';
    let { start, end } = bounds(t);
    let { start: foreignStart, end: foreignEnd } = bounds(t.slice(5, -6), 5);
    let { start: divStart, end: divEnd } = bounds(t.slice(foreignStart + integrationPoint.length + 2, foreignEnd - integrationPoint.length - 3), foreignStart + integrationPoint.length + 2);

    let l = integrationPoint.length;
    astEqual(t, b.program([
      b.element("svg").children([
        b.element(integrationPoint).children([
          b.element("div").loc([1, divStart], [1, divEnd])
        ]).loc([1, foreignStart], [1, foreignEnd])
      ]).loc([1, start], [1, end])
    ]).loc([1, start], [1, end]));
  };
}

for (let i=0, length = integrationPoints.length; i<length; i++) {
  test(
    "svg content with html content inline for "+integrationPoints[i],
    buildIntegrationPointTest(integrationPoints[i])
  );
}

test("a piece of content with HTML", function() {
  let t = 'some <div>content</div> done';
  let { start, end } = bounds(t);

  astEqual(t, b.program([
    b.text("some ").loc([1, start], [1, 5]),
    b.element("div").children([
      b.text("content").loc([1, 10], [1, 17])
    ]).loc([1, 5], [1, 23]),
    b.text(" done").loc([1, 23], [1, end])
  ]).loc([1, start], [1, end]));
});

test("a piece of Handlebars with HTML", function() {
  let t = 'some <div>{{content}}</div> done';
  let { start, end } = bounds(t);

  astEqual(t, b.program([
    b.text("some ").loc([1, start], [1, 5]),
    b.element("div").children([
      b.mustache('content').loc([1, 10], [1, 21])
    ]).loc([1, 5], [1, 27]),
    b.text(" done").loc([1, 27], [1, end])
  ]).loc([1, start], [1, end]));
});

test("Handlebars embedded in an attribute (quoted)", function() {
  let { template, locs: [some, div, className, foo, content, done] } =
    build(['some ', '<div ', 'class="', '{{foo}}', '>', 'content', '</div>', ' done']);



  // let t = 'some <div class="{{foo}}">content</div> done';
  // astEqual(t, b.program([
  //   b.text("some "),
  //   b.element("div", [ b.attr("class", b.concat([ b.mustache('foo') ])) ], [], [
  //     b.text("content")
  //   ]),
  //   b.text(" done")
  // ]));
});

test("Handlebars embedded in an attribute (unquoted)", function() {
  let t = 'some <div class={{foo}}>content</div> done';
  astEqual(t, b.program([
    b.text("some "),
    b.element("div", [ b.attr("class", b.mustache(b.path('foo'))) ], [], [
      b.text("content")
    ]),
    b.text(" done")
  ]));
});

test("Handlebars embedded in an attribute (sexprs)", function() {
  let t = 'some <div class="{{foo (foo "abc")}}">content</div> done';
  astEqual(t, b.program([
    b.text("some "),
    b.element("div", [
      b.attr("class", b.concat([ b.mustache(b.path('foo'), [ b.sexpr(b.path('foo'), [ b.string('abc') ]) ]) ]))
    ], [], [
      b.text("content")
    ]),
    b.text(" done")
  ]));
});

test("Handlebars embedded in an attribute with other content surrounding it", function() {
  let t = 'some <a href="http://{{link}}/">content</a> done';
  astEqual(t, b.program([
    b.text("some "),
    b.element("a", [
      b.attr("href", b.concat([
        b.text("http://"),
        b.mustache('link'),
        b.text("/")
      ]))
    ], [], [
      b.text("content")
    ]),
    b.text(" done")
  ]));
});

test("A more complete embedding example", function() {
  let t = "{{embed}} {{some 'content'}} " +
          "<div class='{{foo}} {{bind-class isEnabled truthy='enabled'}}'>{{ content }}</div>" +
          " {{more 'embed'}}";
  astEqual(t, b.program([
    b.mustache(b.path('embed')),
    b.text(' '),
    b.mustache(b.path('some'), [b.string('content')]),
    b.text(' '),
    b.element("div", [
      b.attr("class", b.concat([
        b.mustache('foo'),
        b.text(' '),
        b.mustache('bind-class', [b.path('isEnabled')], b.hash([b.pair('truthy', b.string('enabled'))]))
      ]))
    ], [], [
      b.mustache(b.path('content'))
    ]),
    b.text(' '),
    b.mustache(b.path('more'), [b.string('embed')])
  ]));
});

test("Simple embedded block helpers", function() {
  let t = "{{#if foo}}<div>{{content}}</div>{{/if}}";
  astEqual(t, b.program([
    b.block(b.path('if'), [b.path('foo')], b.hash(), b.program([
      b.element('div', [], [], [
        b.mustache(b.path('content'))
      ])
    ]))
  ]));
});

test("Involved block helper", function() {
  let t = '<p>hi</p> content {{#testing shouldRender}}<p>Appears!</p>{{/testing}} more <em>content</em> here';
  astEqual(t, b.program([
    b.element('p', [], [], [
      b.text('hi')
    ]),
    b.text(' content '),
    b.block(b.path('testing'), [b.path('shouldRender')], b.hash(), b.program([
      b.element('p', [], [], [
        b.text('Appears!')
      ])
    ])),
    b.text(' more '),
    b.element('em', [], [], [
      b.text('content')
    ]),
    b.text(' here')
  ]));
});

test("Element modifiers", function() {
  let t = "<p {{action 'boom'}} class='bar'>Some content</p>";
  astEqual(t, b.program([
    b.element('p', [ b.attr('class', b.text('bar')) ], [
      b.elementModifier(b.path('action'), [b.string('boom')])
    ], [
      b.text('Some content')
    ])
  ]));
});

test("Tokenizer: MustacheStatement encountered in tagName state", function() {
  let t = "<input{{bar}}>";
  astEqual(t, b.program([
    b.element('input', [], [ b.elementModifier(b.path('bar')) ])
  ]));
});

test("Tokenizer: MustacheStatement encountered in beforeAttributeName state", function() {
  let t = "<input {{bar}}>";
  astEqual(t, b.program([
    b.element('input', [], [ b.elementModifier(b.path('bar')) ])
  ]));
});

test("Tokenizer: MustacheStatement encountered in attributeName state", function() {
  let t = "<input foo{{bar}}>";
  astEqual(t, b.program([
    b.element('input', [ b.attr('foo', b.text('')) ], [ b.elementModifier(b.path('bar')) ])
  ]));
});

test("Tokenizer: MustacheStatement encountered in afterAttributeName state", function() {
  let t = "<input foo {{bar}}>";
  astEqual(t, b.program([
    b.element('input', [ b.attr('foo', b.text('')) ], [ b.elementModifier(b.path('bar')) ])
  ]));
});

test("Tokenizer: MustacheStatement encountered in afterAttributeValue state", function() {
  let t = "<input foo=1 {{bar}}>";
  astEqual(t, b.program([
    b.element('input', [ b.attr('foo', b.text('1')) ], [ b.elementModifier(b.path('bar')) ])
  ]));
});

test("Tokenizer: MustacheStatement encountered in afterAttributeValueQuoted state", function() {
  let t = "<input foo='1'{{bar}}>";
  astEqual(t, b.program([
    b.element('input', [ b.attr('foo', b.text('1')) ], [ b.elementModifier(b.path('bar')) ])
  ]));
});

test("Stripping - mustaches", function() {
  let t = "foo {{~content}} bar";
  astEqual(t, b.program([
    b.text('foo'),
    b.mustache(b.path('content')),
    b.text(' bar')
  ]));

  t = "foo {{content~}} bar";
  astEqual(t, b.program([
    b.text('foo '),
    b.mustache(b.path('content')),
    b.text('bar')
  ]));
});

test("Stripping - blocks", function() {
  let t = "foo {{~#wat}}{{/wat}} bar";
  astEqual(t, b.program([
    b.text('foo'),
    b.block(b.path('wat'), [], b.hash(), b.program()),
    b.text(' bar')
  ]));

  t = "foo {{#wat}}{{/wat~}} bar";
  astEqual(t, b.program([
    b.text('foo '),
    b.block(b.path('wat'), [], b.hash(), b.program()),
    b.text('bar')
  ]));
});

test("Stripping - programs", function() {
  let t = "{{#wat~}} foo {{else}}{{/wat}}";
  astEqual(t, b.program([
    b.block(b.path('wat'), [], b.hash(), b.program([
      b.text('foo ')
    ]), b.program())
  ]));

  t = "{{#wat}} foo {{~else}}{{/wat}}";
  astEqual(t, b.program([
    b.block(b.path('wat'), [], b.hash(), b.program([
      b.text(' foo')
    ]), b.program())
  ]));

  t = "{{#wat}}{{else~}} foo {{/wat}}";
  astEqual(t, b.program([
    b.block(b.path('wat'), [], b.hash(), b.program(), b.program([
      b.text('foo ')
    ]))
  ]));

  t = "{{#wat}}{{else}} foo {{~/wat}}";
  astEqual(t, b.program([
    b.block(b.path('wat'), [], b.hash(), b.program(), b.program([
      b.text(' foo')
    ]))
  ]));
});

test("Stripping - removes unnecessary text nodes", function() {
  let t = "{{#each~}}\n  <li> foo </li>\n{{~/each}}";
  astEqual(t, b.program([
    b.block(b.path('each'), [], b.hash(), b.program([
      b.element('li', [], [], [b.text(' foo ')])
    ]))
  ]));
});

// TODO: Make these throw an error.
//test("Awkward mustache in unquoted attribute value", function() {
//  let t = "<div class=a{{foo}}></div>";
//  astEqual(t, b.program([
//    b.element('div', [ b.attr('class', concat([b.string("a"), b.sexpr([b.path('foo')])])) ])
//  ]));
//
//  t = "<div class=a{{foo}}b></div>";
//  astEqual(t, b.program([
//    b.element('div', [ b.attr('class', concat([b.string("a"), b.sexpr([b.path('foo')]), b.string("b")])) ])
//  ]));
//
//  t = "<div class={{foo}}b></div>";
//  astEqual(t, b.program([
//    b.element('div', [ b.attr('class', concat([b.sexpr([b.path('foo')]), b.string("b")])) ])
//  ]));
//});

test("an HTML comment", function() {
  let t = 'before <!-- some comment --> after';
  astEqual(t, b.program([
    b.text("before "),
    b.comment(" some comment "),
    b.text(" after")
  ]));
});

test("allow {{null}} to be passed as helper name", function() {
  let ast = parse("{{null}}");

  astEqual(ast, b.program([
    b.mustache(b.null())
  ]));
});

test("allow {{null}} to be passed as a param", function() {
  let ast = parse("{{foo null}}");

  astEqual(ast, b.program([
    b.mustache(b.path('foo'), [b.null()])
  ]));
});

test("allow {{undefined}} to be passed as helper name", function() {
  let ast = parse("{{undefined}}");

  astEqual(ast, b.program([
    b.mustache(b.undefined())
  ]));
});

test("allow {{undefined}} to be passed as a param", function() {
  let ast = parse("{{foo undefined}}");

  astEqual(ast, b.program([
    b.mustache(b.path('foo'), [b.undefined()])
  ]));
});


function bounds(fragment: string, start = 0): { start: number, end: number } {
  return {
    start,
    end: start + fragment.length
  };
}

type Loc = AST.SourceLocation;

function build(parts: [string, string, string, string, string, string, string]): { template: AST.Program, locs: [Loc, Loc, Loc, Loc, Loc, Loc, Loc] };
function build(parts: [string, string, string, string, string, string]): { template: AST.Program, locs: [Loc, Loc, Loc, Loc, Loc, Loc] };
function build(parts: [string, string, string, string, string]): { template: AST.Program, locs: [Loc, Loc, Loc, Loc, Loc] };
function build(parts: [string, string, string, string]): { template: AST.Program, locs: [Loc, Loc, Loc, Loc] };
function build(parts: [string, string, string]): { template: AST.Program, locs: [Loc, Loc, Loc] };
function build(parts: [string, string]): { template: AST.Program, locs: [Loc, Loc] };
function build(parts: [string]): { template: AST.Program, locs: [Loc] };

function build(parts: string[]): { template: AST.Program, locs: AST.SourceLocation[] } {
  let { template, locs } = parts.reduce(({ template, locs }, part) => {
    let last = locs[locs.length - 1] || b.loc(b.pos(1, 0), b.pos(1, 0));
    let next = b.loc(b.pos(1, last.end.column), b.pos(1, last.end.column + part.length));
    return {
      template: template + part,
      locs: locs.concat(next)
    };
  }, { template: '', locs: [] } as { template: string, locs: AST.SourceLocation[] })

  return {
    template: parse(handlebarsParse(template)),
    locs
  };
}

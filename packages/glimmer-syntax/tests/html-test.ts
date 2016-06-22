import {
  HTMLParser,
  Token,
  GlimmerPosition,
  SourceLocation,
  TreeElement,
  TemplateContents,
  TemplateContentsToken,
  SerializedTemplateContentsToken,
  SerializedElementToken
} from 'glimmer-syntax';

import {
  Option,
  unwrap,
  isVoidTag
} from 'glimmer-util';

import { EventedTokenizer, EntityParser, Position as HTMLPosition, HTML5NamedCharRefs } from 'simple-html-tokenizer';

QUnit.module("[glimmer-syntax] HTML Parser");

function data(parser: TestBuilder, tokens: ([string, string] | string)[]): Token.DataToken {
  this.finishOpenTag();
  let t = new Token.DataTokenBuilder(new Token.LocationBuilder(this.pos()));

  tokens.forEach(char => {
    if (Array.isArray(tokens)) {
      let c = char as [string, string];
      let l = parser.advance(char[0]);
      t.appendToData(this.pos(), c[1]);
    } else {
      t.appendToData(this.pos(), char as string);
    }
  });

  return t.finalize(this.pos());
}

class TestParser {
  private parser = new HTMLParser();
  private tokenizer = new EventedTokenizer(this.parser, new EntityParser(HTML5NamedCharRefs))

  parse(input: string) {
    this.tokenizer.tokenize(input);
    return this.contents();
  }

  private contents() {
    return this.parser.finalize(this.tokenizer);
  }
}

class TestBuilder {
  public line = 1;
  public column = 0;
  private currentTag: Option<Token.OpenTagBuilder> = null;
  private contents: TemplateContents | Token.OpenedElementBuilder;
  private stack: (TemplateContents | Token.OpenedElementBuilder)[] = [];
  private expectFail = false;
  private logged = false;

  constructor(public input: string) {
    let template = new TemplateContents(new Token.LocationBuilder(this.pos()));
    this.pushElement(template);
  }

  get lastDataToken(): Option<Token.DataToken> {
    let contents = this.contents;
    if (contents instanceof TemplateContents && contents.last instanceof Token.DataToken) {
      return contents.last;
    } else {
      return null;
    }
  }

  updateLoc(l: SourceLocation | HTMLPosition) {
    if (l instanceof SourceLocation) {
      this.line = l.end.line;
      this.column = l.end.column;
    } else {
      this.line = l.line;
      this.column = l.column;
    }
  }

  advance(chars: string | Token.DataToken): SourceLocation {

    if (typeof chars === 'string') {
      let l = loc(this, chars);
      this.updateLoc(l);
      return l;
    } else {
      let l = loc(this);
      this.updateLoc(chars.loc);
      l.end = chars.loc.end;
      return l;
    }
  }

  pos(): GlimmerPosition {
    return GlimmerPosition.build(this.line, this.column);
  }

  pushElement(element: Token.OpenedElementBuilder | TemplateContents) {
    this.stack.push(element);
    this.contents = element;
  }

  popElement(): Token.OpenedElementBuilder {
    let element = this.stack.pop() as Token.OpenedElementBuilder;
    this.contents = this.stack[this.stack.length - 1];
    return element;
  }

  log() {
    this.logged = true;
    return this;
  }

  assert() {
    let current = this.currentTag;
    if (current) {
      if (isVoidTag(current.name)) {
        this.advance('>');
        let tag = current.selfClosing(this.pos());
        this.currentTag = null;

        this.contents.append(tag);
      } else {
        throw new Error(`Unclosed ${current.name} tag in expectation`);
      }
    }
    if (this.expectFail) {
      try {
        let p = new TestParser();
        let contents = p.parse(this.input);
      } catch(e) {
        QUnit.push(true, e, e, `${this.input} was a parse error`);
        return;
      }
      throw new Error(`expected ${this.input} to be a parse error, but it succeeded`);
    } else {
      this.assertSuccess();
    }
  }

  assertSuccess() {
    let p = new TestParser();
    let contents = p.parse(this.input);
    let actual = lines(contents.toJSON());
    let expected = lines(this.toJSON());
    let actualString = '\n' + actual.join('\n') + '\n';
    let expectedString = '\n' + expected.join('\n') + '\n';

    let equiv = QUnit.equiv(contents.toJSON().children, this.toJSON().children);

    if (this.logged) {
      console.log('actual', contents.toJSON().children);
      console.log('expected', this.toJSON().children);
    }

    if (actualString === expectedString) {
      let actual = contents.toJSON().children;
      let expected = this.toJSON().children;
      QUnit.push(equiv, actual, expected, this.input);
    } else {
      QUnit.push(equiv, '\n' + actual.join('\n') + '\n', '\n' + expected.join('\n') + '\n', this.input);
    }
  }

  unbalanced() {
    this.expectFail = true;
    return this;
  }

  whitespace(chars: string) {
    this.advance(chars);
    return this;
  }

  private finishOpenTag() {
    if (this.currentTag) {
      this.advance('>');
      let openTag = this.currentTag.finalize(this.pos());
      let loc = this.currentTag.loc.fork();
      let openElement = new Token.OpenedElementBuilder(loc, openTag);
      this.pushElement(openElement);
      this.currentTag = null;
    }
  }

  private addChars(chars: string, l: SourceLocation) {
    let data = this.lastDataToken;

    if (data) {
      data.loc.end = l.end;
      data.chars += chars;
    } else {
      this.contents.append(new Token.DataToken(l, chars));
    }
  }

  content(chars: string): this {
    this.finishOpenTag();
    let l = this.advance(chars);

    this.addChars(chars, l);

    return this;
  }

  data(token: Token.DataToken): this {
    this.contents.append(token);
    return this;
  }

  entity(entity: string, chars: string): this {
    this.finishOpenTag();

    let l = this.advance(entity);
    this.addChars(chars, l);
    return this;
  }

  comment(chars: string, { closing = true } = { closing: true }): this {
    this.finishOpenTag();

    let { start, end } = this.advance('<!--');
    end = loc(end, chars).end;

    if (closing) {
      end = loc(end, '-->').end;
    } else {
      end = loc(end, '>').end;
    }

    this.updateLoc(end);
    let l = SourceLocation.build(start, end);
    this.contents.append(new Token.CommentToken(l, chars));
    return this;
  }

  openTag(name: string): this {
    this.finishOpenTag();

    let { start } = this.advance('<');
    let l = this.advance(name);
    let elementLoc = new Token.LocationBuilder(start);
    let tagLoc = new Token.LocationBuilder(start);
    let tagName = new Token.TagNameToken(l, name);
    let openTag = new Token.OpenTagBuilder(tagLoc, tagName);
    this.currentTag = openTag;
    return this;
  }

  attr(name: string, value: Option<string | ([string, string] | string)[]>, { quote, ns }: { quote?: 'single' | 'double', ns?: string } = {}) {
    this.advance(' ');
    let attrLocBuilder = new Token.LocationBuilder(this.pos());
    let nameLoc = this.advance(name);
    let attrLoc: Token.Location, attrValue: Token.AttributeValueToken;
    let attrName = new Token.AttributeNameToken(nameLoc, name);

    if (value === null) {
      attrLoc = attrLocBuilder.finalize(this.pos());
      attrValue = new Token.AttributeValueToken(Token.COLLAPSED, null);
    } else {
      let { end: wholeValueStart } = this.advance('=');
      if (quote) this.advance(quote === 'single' ? "'" : '"');

      let innerValueLoc: SourceLocation
      let valueChars = "";

      if (Array.isArray(value)) {
        innerValueLoc = loc(this);
        value.forEach(pair => {
          if (Array.isArray(pair)) {
            let [entity, chars] = pair;
            innerValueLoc.end = this.advance(entity).end;
            valueChars += chars;
          } else {
            innerValueLoc.end = this.advance(pair).end;
            valueChars += pair;
          }
        });
      } else {
        innerValueLoc = this.advance(value);
        valueChars = value;
      }

      if (quote) this.advance(quote === 'single' ? "'" : '"');
      let wholeValueLoc = new Token.LocationBuilder(wholeValueStart).finalize(this.pos());
      attrLoc = attrLocBuilder.finalize(this.pos());

      let innerAttrValue = new Token.InnerAttributeValueToken(innerValueLoc, valueChars);
      attrValue = new Token.AttributeValueToken(wholeValueLoc, innerAttrValue);
    }

    let attr = new Token.Attribute(attrLoc, attrName, attrValue, quote ? QUOTE_NAMES[quote] : null);
    unwrap(this.currentTag).attr(attr);
    return this;
  }

  selfClosing({ whitespace = ' '} = { whitespace: ' ' }) {
    this.advance(whitespace);
    this.advance('/>');
    let element = unwrap(this.currentTag).selfClosing(this.pos());
    this.currentTag = null;

    this.contents.append(element);
    return this;
  }

  closeTag({ whitespace = '' } = { whitespace: '' }) {
    this.finishOpenTag();

    let openElement = this.popElement();
    let openTag = openElement.openTag;

    let name = openTag.tagName.chars;
    let { start: closeStart } = this.advance('</');
    let nameLoc = this.advance(name);
    if (whitespace) this.advance(whitespace);
    let { end: closeEnd } = this.advance('>');
    let closeLoc = new Token.LocationBuilder(closeStart).finalize(closeEnd);
    let close = new Token.CloseTagToken(closeLoc, new Token.TagNameToken(nameLoc, name));

    let element = openElement.finalize(this.pos(), close);
    this.contents.append(element);
    return this;
  }

  then(success: () => void, fail: (r: any) => void) {

  }

  toJSON(): SerializedTemplateContentsToken {
    return (this.contents as TemplateContents).finalize(this).toJSON();
  }
}

const QUOTE_NAMES = {
  single: "'",
  double: '"'
}

interface TestData {
  line: string
}

interface TestElement {
  openTag: string;
  attributes: string[];
  children: TestChild[];
  closeTag: string;
}

type TestChild = string | TestElement;

function lines(input: SerializedTemplateContentsToken): string[] {
  let out: string[] = [];

  input.children.forEach(child => {
    testChild(out, child);
  });

  return out;
}

function testLoc(loc: Token.SerializedLocation) {
  return `${loc.start.line}:${loc.start.column} :: ${loc.end.line}:${loc.end.column}`;
}

function testChild(lines: string[], child: Token.SerializedTreeToken) {
  if (child.type === 'data' || child.type === 'comment') {
    let c = child as Token.SerializedDataToken | Token.SerializedCommentToken;
    lines.push(`<${c.type} ${c.chars} ${testLoc(c.loc)}>`);
  } else {
    let c = child as Token.SerializedElementToken;
    testOpenTag(lines, c.openTag);
    if (c.children) {
      c.children.forEach(child => {
        testChild(lines, child);
      });
    }

    if (c.closeTag) {
      testCloseTag(lines, c.closeTag);
    }
    // return testElement(child as SerializedElementToken);
  }
}

function testElement(lines: string[], el: SerializedElementToken) {
  return JSON.stringify(el);
}

function testAttribute(lines: string[], attr: Token.SerializedAttribute): void {
  let chars = attr.value && attr.value.inner && attr.value.inner.chars;
  let voidAttr = !attr.value || !attr.value.inner;

  if (voidAttr) {
    lines.push(`<attr ${attr.name.chars} ${testLoc(attr.loc)}>`);
  } else {
    let val = `${attr.quote || ''}${chars}${attr.quote || ''}`;
    lines.push(`<attr ${attr.name.chars}=${val} ${testLoc(attr.loc)}>`);
  }
}

function testOpenTag(lines: string[], el: Token.SerializedOpenTagToken): void {
  lines.push(`<open ${testLoc(el.loc)}>`);
  lines.push(`<name ${el.tagName.name} ${testLoc(el.loc)}>`);

  el.attributes.forEach(attr => {
    testAttribute(lines, attr);
  });

  lines.push(`</open>`);
}

function testCloseTag(lines: string[], el: Token.SerializedCloseTagToken): void {
  lines.push(`<close ${testLoc(el.loc)}>`);
  lines.push(`<name ${el.tagName.name} ${testLoc(el.loc)}>`);
  lines.push(`</close>`);
}

function loc(p: HTMLPosition, chars: string = ""): SourceLocation {
  let start = GlimmerPosition.fromHBS(p);
  let end = GlimmerPosition.fromHBS(p);
  for (let i=0; i<chars.length; i++) {
    let char = chars[i];
    if (char === '\n') {
      end.line++;
      end.column = 0;
    } else {
      end.column++;
    }
  }

  return SourceLocation.build(start, end);
}

function expect(name: string, input: string) {
  let builder = new TestBuilder(input);

  QUnit.test(name, assert => {
    builder.assert();
  });

  return builder;
}

expect('text content', 'hello world')
  .content('hello world');

expect('comment content', '<!-- hello world -->')
  .comment(' hello world ');

expect('simple element', '<p>hello</p>')
  .openTag('p')
  .content('hello')
  .closeTag();

expect('simple element with attr', '<p id="simple">hello</p>')
  .openTag('p')
  .attr('id', 'simple', { quote: 'double' })
  .content('hello')
  .closeTag();

expect("A simple tag with trailing spaces", "<div   \t\n></div>")
  .openTag('div')
  .whitespace('  \t\n')
  .closeTag();

expect("An unclosed tag", '<div>')
  .unbalanced();

expect("Nested tags", "<div><p><span>hi</span></p></div>")
  .openTag('div')
  .openTag('p')
  .openTag('span')
  .content('hi')
  .closeTag()
  .closeTag()
  .closeTag();

expect("A simple closing tag with trailing spaces", "<div></div   \t\n>")
  .openTag('div')
  .closeTag({ whitespace: '  \t\n' });

expect("A pair of hyphenated tags", "<x-foo></x-foo>")
  .openTag('x-foo')
  .closeTag();

expect("A tag with a single-quoted attribute", "<div id='foo'></div>")
  .openTag('div')
  .attr('id', 'foo', { quote: 'single' })
  .closeTag();

expect("A tag with a double-quoted attribute", '<div id="foo"></div>')
  .openTag('div')
  .attr('id', 'foo', { quote: 'double' })
  .closeTag();

expect("A tag with a double-quoted empty", '<div id=""></div>')
  .openTag('div')
  .attr('id', '', { quote: 'double' })
  .closeTag();

expect("A tag with unquoted attribute", '<div id=foo></div>')
  .openTag('div')
  .attr('id', 'foo')
  .closeTag();

expect("A tag with valueless attributes", '<div foo bar></div>')
  .openTag('div')
  .attr('foo', null)
  .attr('bar', null)
  .closeTag();

expect("A tag with multiple attributes", `<div id=foo class="bar baz" href='bat'></div>`)
  .openTag('div')
  .attr('id', 'foo')
  .attr('class', 'bar baz', { quote: 'double' })
  .attr('href', 'bat', { quote: 'single' })
  .closeTag();

expect("A tag with capitalization in attributes", '<svg viewBox="0 0 0 0"></svg>')
  .openTag('svg')
  .attr('viewBox', '0 0 0 0', { quote: 'double' })
  .closeTag();

expect("A tag with capitalization in the tag", "<linearGradient></linearGradient>")
  .openTag('linearGradient')
  .closeTag();

expect("DIVERGENCE: A self-closing tag", '<img />')
  .openTag('img')
  .selfClosing();

expect("void tags", '<img>')
  .openTag('img');

expect("DIVERGENCE: A self-closing tag with valueless attributes", '<input disabled />')
  .openTag('input')
  .attr('disabled', null)
  .selfClosing();

expect("DIVERGENCE: A self-closing tag with valueless attributes", '<input disabled/>')
  .openTag('input')
  .attr('disabled', null)
  .selfClosing({ whitespace: '' });


expect("A tag with / in the middle", '<img / src="foo.png">')
  .openTag('img')
  .whitespace(' /')
  .attr('src', 'foo.png', { quote: 'double' });


expect("An opening and closing tag with some content", "<div id='foo' class='{{bar}} baz'>Some content</div>")
  .openTag('div')
  .attr('id', 'foo', { quote: 'single' })
  .attr('class', '{{bar}} baz', { quote: 'single' })
  .content('Some content')
  .closeTag();

expect("A comment", `<!-- hello -->`)
  .comment(' hello ');

expect("A (buggy) comment with no ending --", `<!-->`)
  .comment('', { closing: false });

expect("A comment that immediately closes", `<!---->`)
  .comment('');

expect("A comment that contains a -", `<!-- A perfectly legal - appears -->`)
  .comment(' A perfectly legal - appears ');

expect("A (buggy) comment that contains two --", `<!-- A questionable -- appears -->`)
  .comment(' A questionable -- appears ');

expect("Character references are expanded", "&quot;Foo &amp; Bar&quot; &lt; &#60;&#x3c; &#x3C; &LT; &NotGreaterFullEqual; &Borksnorlax; &nleqq;")
  .entity("&quot;", `"`)
  .content("Foo ")
  .entity("&amp;", "&")
  .content(" Bar")
  .entity("&quot;", `"`)
  .content(" ")
  .entity("&lt;", "<")
  .content(" ")
  .entity("&#60;", "<")
  .entity("&#x3c;", "<")
  .content(" ")
  .entity("&#x3C;", "<")
  .content(" ")
  .entity("&LT;", "<")
  .content(" ")
  .entity("&NotGreaterFullEqual;", "≧̸")
  .content(" &Borksnorlax; ")
  .entity("&nleqq;", "≦̸");

expect("Character refs in attributes", "<div title='&quot;Foo &amp; Bar&quot; &blk12; &lt; &#60;&#x3c; &#x3C; &LT; &NotGreaterFullEqual; &Borksnorlax; &nleqq;'></div>")
  .openTag('div')
  .attr('title', [
    ['&quot;', `"`],
    "Foo ",
    ["&amp;", "&"],
    " Bar",
    ["&quot;", `"`],
    " ",
    ["&blk12;", "▒"],
    " ",
    ["&lt;", "<"],
    " ",
    ["&#60;", "<"],
    ["&#x3c;", "<"],
    " ",
    ["&#x3C;", "<"],
    " ",
    ["&LT;", "<"],
    " ",
    ["&NotGreaterFullEqual;", "≧̸"],
    " &Borksnorlax; ",
    ["&nleqq;", "≦̸"]
  ], { quote: 'single' })
  .closeTag();

// QUnit.module("simple-html-tokenizer - EventedTokenizer - preprocessing", {
//   setup: setup
// });

// QUnit.test("Carriage returns are replaced with line feeds", function(assert) {
//   tokenize("\r\r\n\r\r\n\n");

//   assert.events([
//     e.beginData(),
//     new DataChars("\n\n\n\n\n"),
//     e.finishData()
//   ]);
// });

// QUnit.module("simple-html-tokenizer - EventedTokenizer - location info", {
//   setup: setup
// });

// QUnit.test("tokens: Chars start-tag Chars", function(assert) {
//   tokenize("Chars<div>Chars");

//   assert.events([
//     e.beginData(),
//     new DataChars("Chars"),
//     e.finishData(),
//     e.openTag('start'),
//     new TagName('div'),
//     e.finishTag(),
//     e.beginData(),
//     new DataChars("Chars"),
//     e.finishData()
//   ]);
// });

// QUnit.test("tokens: start-tag start-tag", function(assert) {
//   tokenize("<div><div>");

//   assert.events([
//     e.openTag('start'),
//     new TagName('div'),
//     e.finishTag(),
//     e.openTag('start'),
//     new TagName('div'),
//     e.finishTag(),
//   ]);
// });

// QUnit.test("tokens: html char ref start-tag", function(assert) {
//   tokenize("&gt;<div>");

//   assert.events([
//     e.beginData(),
//     new DataEntity('>', '&gt;'),
//     e.finishData(),
//     e.openTag('start'),
//     new TagName('div'),
//     e.finishTag()
//   ]);
// });

// QUnit.test("tokens: Chars start-tag Chars start-tag", function(assert) {
//   tokenize("Chars\n<div>Chars\n<div>");

//   assert.events([
//     e.beginData(),
//     new DataChars('Chars\n'),
//     e.finishData(),
//     e.openTag('start'),
//     new TagName('div'),
//     e.finishTag(),
//     e.beginData(),
//     new DataChars('Chars\n'),
//     e.finishData(),
//     e.openTag('start'),
//     new TagName('div'),
//     e.finishTag()
//   ]);
// });

// QUnit.test("tokens: comment start-tag Chars end-tag", function(assert) {
//   tokenize("<!-- multline\ncomment --><div foo=bar>Chars\n</div>");

//   assert.events([
//     new Comment(' multline\ncomment '),
//     e.openTag('start'),
//     new TagName('div'),
//     new Whitespace(' '),
//     new AttributeName('foo'),
//     new Whitespace('='),
//     new AttributeValue('bar', null),
//     e.finishTag(),
//     new Data('Chars\n'),
//     e.openTag('end'),
//     new TagName('div'),
//     e.finishTag()
//   ]);
// });

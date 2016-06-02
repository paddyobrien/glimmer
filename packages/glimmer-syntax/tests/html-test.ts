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
  unwrap
} from 'glimmer-util';

import { EventedTokenizer, EntityParser, Position as HTMLPosition, HTML5NamedCharRefs } from 'simple-html-tokenizer';

QUnit.module("[glimmer-syntax] HTML Parser");

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

  constructor(public input: string) {
    let template = new TemplateContents(new Token.LocationBuilder(this.pos()));
    this.pushElement(template);
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

  advance(chars: string): SourceLocation {
    let l = loc(this, chars);
    this.updateLoc(l);
    return l;
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

  assert() {
    let p = new TestParser();
    let contents = p.parse(this.input);
    let actual = lines(contents.toJSON());
    let expected = lines(this.toJSON());
    QUnit.push(QUnit.equiv(contents.toJSON().children, this.toJSON().children), actual, expected, this.input);
  }

  content(chars: string): void {
    if (this.currentTag) {
      this.advance('>');
      let openTag = this.currentTag.finalize(this.pos());
      let loc = this.currentTag.loc.fork();
      let openElement = new Token.OpenedElementBuilder(loc, openTag);
      this.pushElement(openElement);
    }

    let l = this.advance(chars);
    this.contents.append(new Token.DataToken(l, chars));
  }

  comment(chars: string): void {
    let { start, end } = this.advance('<!--');
    end = loc(end, chars).end;
    end = loc(end, '-->').end;
    this.updateLoc(end);
    let l = SourceLocation.build(start, end);
    this.contents.append(new Token.CommentToken(l, chars));
  }

  openTag(name: string) {
    let { start } = this.advance('<');
    let l = this.advance(name);
    let elementLoc = new Token.LocationBuilder(start);
    let tagLoc = new Token.LocationBuilder(start);
    let tagName = new Token.TagNameToken(l, name);
    let openTag = new Token.OpenTagBuilder(tagLoc, tagName);
    this.currentTag = openTag;
  }

  attr(name: string, value: string, { quote, ns }: { quote?: 'single' | 'double', ns?: string }) {
    this.advance(' ');
    let attrLocBuilder = new Token.LocationBuilder(this.pos());
    let nameLoc = this.advance(name);
    let { end: wholeValueStart } = this.advance('=');
    if (quote) this.advance(quote === 'single' ? "'" : '"');
    let innerValueLoc = this.advance(value);
    if (quote) this.advance(quote === 'single' ? "'" : '"');
    let wholeValueLoc = new Token.LocationBuilder(wholeValueStart).finalize(this.pos());
    let attrLoc = attrLocBuilder.finalize(this.pos());

    let attrName = new Token.AttributeNameToken(nameLoc, name);
    let innerAttrValue = new Token.InnerAttributeValueToken(innerValueLoc, value);
    let attrValue = new Token.AttributeValueToken(innerValueLoc, innerAttrValue);
    let attr = new Token.Attribute(attrLoc, attrName, attrValue, quote ? QUOTE_NAMES[quote] : null);
    unwrap(this.currentTag).attr(attr);
  }

  selfClosing() {
    let tag = unwrap(this.currentTag);
    tag.finalize(this.pos());
  }

  closeTag() {
    let openElement = this.popElement();
    let name = openElement.openTag.tagName.chars;
    let { start: closeStart } = this.advance('</');
    let nameLoc = this.advance(name);
    let { end: closeEnd } = this.advance('>');
    let closeLoc = new Token.LocationBuilder(closeStart).finalize(closeEnd);
    let close = new Token.CloseTagToken(closeLoc, new Token.TagNameToken(nameLoc, name));

    let element = openElement.finalize(this.pos(), close);
    this.contents.append(element);
  }

  toJSON(): SerializedTemplateContentsToken {
    return (this.contents as TemplateContents).finalize(this).toJSON();
  }
}

const QUOTE_NAMES = {
  single: "'",
  double: '"'
}

function lines(input: SerializedTemplateContentsToken): string[] {
  return input.children.map(child => {
    if (child.type === 'data' || child.type === 'comment') {
      let c = child as Token.SerializedDataToken | Token.SerializedCommentToken;
      return `<${c.type} "${c.chars}" ${testLoc(c.loc)}>`;
    } else {
      return testElement(child as SerializedElementToken);
    }
  });
}

function testLoc(loc: Token.SerializedLocation) {
  return `${loc.start.line}:${loc.start.column} :: ${loc.end.line}:${loc.end.column}`;
}

function testElement(el: SerializedElementToken): string {
  return JSON.stringify(el);
}

function loc(p: HTMLPosition, chars: string): SourceLocation {
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

QUnit.test('text content', assert => {
  let b = new TestBuilder('hello world');
  b.content('hello world');
  b.assert();
});


QUnit.test('comment content', assert => {
  let b = new TestBuilder('<!-- hello world -->');
  b.comment(' hello world ');
  b.assert();
});

QUnit.test('simple element', assert => {
  let b = new TestBuilder('<p>hello</p>');
  b.openTag('p');
  b.content('hello');
  b.closeTag();
  b.assert();
});
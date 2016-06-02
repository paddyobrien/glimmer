import { Delegate, Position, Char } from 'simple-html-tokenizer';

export class TokenizerDelegate implements Delegate {
  public name: string;

  beginData(pos: Position): void {
    illegal(this.name, 'beginData');
  }

  appendToData(pos: Position, char: Char): void {
    illegal(this.name, 'appendToData');
  }

  finishData(pos: Position): void {
    illegal(this.name, 'finishData');
  }

  finishAttributeName(pos: Position): void {
    illegal(this.name, 'finishAttributeName');
  }

  voidAttributeValue(pos: Position): void {
    illegal(this.name, 'voidAttributeValue');
  }

  whitespace(pos: Position, char: string): void {
    illegal(this.name, 'whitespace');
  }

  appendToCommentData(pos: Position, char: string): void {
    illegal(this.name, 'appendToCommentData');
  }

  openStartTag(pos: Position): void {
    illegal(this.name, 'openTag');
  }

  openEndTag(pos: Position): void {
    illegal(this.name, 'openTag');
  }

  beginTagName(pos: Position): void {
    illegal(this.name, 'beginTagName');
  }

  appendToTagName(pos: Position, char: string): void {
    illegal(this.name, 'appendToTagName');
  }

  beginComment(pos: Position): void {
    illegal(this.name, 'beginComment');
  }

  finishComment(pos: Position): void {
    illegal(this.name, 'finishComment');
  }

  finishTagName(pos: Position): void {
    illegal(this.name, 'finishTagName');
  }

  finishTag(pos: Position, selfClosing: boolean): void {
    illegal(this.name, 'finishTag');
  }

  beginAttributeName(pos: Position): void {
    illegal(this.name, 'beginAttributeName');
  }

  appendToAttributeName(pos: Position, char: string): void {
    illegal(this.name, 'appendToAttributeName');
  }

  beginWholeAttributeValue(pos: Position): void {
    illegal(this.name, 'beginWholeAttributeValue');
  }

  beginAttributeValue(pos: Position, quoted: boolean): void {
    illegal(this.name, 'beginAttributeValue');
  }

  appendToAttributeValue(pos: Position, char: Char): void {
    illegal(this.name, 'appendToAttributeValue');
  }

  finishAttributeValue(pos: Position, quoted: boolean): void {
    illegal(this.name, 'finishAttributeValue');
  }

  finishWholeAttributeValue(pos: Position): void {
    illegal(this.name, 'finishWholeAttributeValue');
  }
}

export default TokenizerDelegate;

function illegal(name: string, event: string) {
  throw new Error(`${event} is illegal in ${name}`);
}
import { Stack, unwrap } from 'glimmer-util';
import {
  OpenTagToken,
  TagNameToken,
  DataToken,
  CommentToken,
  TokenBuilder,
  ElementBuilder,
  OpenedElementBuilder
} from './tokens';

import {
  IN_SCOPE,
  TreeElement,
  TreeToken,
  ToElementType,
  toElementType
} from './types';

import {
  TemplateContents,
  TemplateContentsToken
} from './html-parser';

import {
  Position as HTMLPosition
} from 'simple-html-tokenizer';

export default class ElementStack {
  private stack: (OpenedElementBuilder | TemplateContents)[] = [];
  public current: OpenedElementBuilder | TemplateContents;

  constructor(start: TemplateContents) {
    this.stack.push(start);
    this.current = start;
  }

  finalize(p: HTMLPosition): TemplateContentsToken {
    if (this.stack.length !== 1) {
      throw new Error("can only finalize when stack is empty");
    }

    return this.bottom.finalize(p);
  }

  get bottom(): TemplateContents {
    return this.stack[0] as TemplateContents;
  }

  pushElement(element: OpenedElementBuilder) {
    this.stack.push(element);
    this.current = element;
  }

  popElement(): OpenedElementBuilder {
    if (this.stack.length === 1) {
      // this guarantees that this.current is never template contents
      throw new Error("Unbalanced pop");
    }

    let element = this.stack.pop() as OpenedElementBuilder;
    this.current = this.stack[this.stack.length - 1];
    return element;
  }

  appendText(text: DataToken) {
    this.current.append(text);
  }

  // isInSpecificScope(_target: ToElementType, inScope: IN_SCOPE): boolean {
  //   target = toElementType(_target);
  //   let node = this.current;
  //   let pos = this.currentPosition();

  //   while (true) {
  //     let current = node as ElementBuilder;
  //     if (current.matches(target)) {
  //       return true;
  //     } else if (inScope.some(target => current.matches(target))) {
  //       return false;
  //     }

  //     node = this.previousFrom(pos--);
  //   }
  // }
}

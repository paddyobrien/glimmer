import { DataToken, CommentToken, ElementBuilder, ElementToken, SerializedTreeToken, OpenedElementBuilder } from './tokens';
import { TemplateContents, TemplateContentsToken } from './html-parser';

export type ToElementType = ElementType | string;

export function toElementType(type: ToElementType): ElementType {
  if (typeof type === 'string') {
    return ElementType.for(type);
  } else {
    return type;
  }
}

export type LeafToken = DataToken | CommentToken;
export type TreeElement = DataToken | CommentToken | OpenedElementBuilder;
export type TreeToken = DataToken | CommentToken | ElementToken;

export class ElementType {
  static for(tagName: string) {
    return new ElementType(tagName, HTMLNS);
  }

  constructor(public name: string, public namespace: string = "http://www.w3.org/1999/xhtml") {}
}

export const HTMLNS   = "http://www.w3.org/1999/xhtml";
export const SVGNS    = "http://www.w3.org/2000/svg";
export const MATHMLNS = "http://www.w3.org/1998/Math/MathML";

export const ELEMENT_IN_SCOPE = elementTypes([
  ["applet", HTMLNS],
  ["caption", HTMLNS],
  ["html", HTMLNS],
  ["table", HTMLNS],
  ["td", HTMLNS],
  ["th", HTMLNS],
  ["marquee", HTMLNS],
  ["object", HTMLNS],
  ["template", HTMLNS],
  ["mi", MATHMLNS],
  ["mo", MATHMLNS],
  ["mn", MATHMLNS],
  ["ms", MATHMLNS],
  ["mtext", MATHMLNS],
  ["annotation-xml", MATHMLNS],
  ["foreignObject", SVGNS],
  ["desc", SVGNS],
  ["title", SVGNS]
]);

export const LIST_ITEM_SCOPE = elementTypes([
  ["ol", HTMLNS],
  ["ul", HTMLNS]
]).concat(ELEMENT_IN_SCOPE);

export const BUTTON_SCOPE = elementTypes([
  ["button", HTMLNS]
]).concat(ELEMENT_IN_SCOPE);

export const TABLE_SCOPE = elementTypes([
  ["html", HTMLNS],
  ["table", HTMLNS],
  ["template", HTMLNS]
]);

export const SELECT_SCOPE = elementTypes([
  ["optgroup", HTMLNS],
  ["option", HTMLNS]
]);

export type IN_SCOPE = ElementType[];

export function elementTypes(list: [string, string][]): ElementType[] {
  return list.map(([name, ns]) => new ElementType(name, ns));
}
import { SerializedTemplate } from 'glimmer-wire-format';

export class PartialDefinition {
  name: string;
  spec: SerializedTemplate;

  constructor(name: string, spec: SerializedTemplate) {
    this.name = name;
    this.spec = spec;
  }

}

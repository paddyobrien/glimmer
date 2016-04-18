import { Template, RenderResult } from "glimmer-runtime";
import { BasicComponent, TestEnvironment, TestDynamicScope, equalTokens } from "glimmer-test-helpers";
import { UpdatableReference } from "glimmer-object-reference";
import { Opaque, opaque } from 'glimmer-util';

let env: TestEnvironment, root: Element, result: RenderResult, self: UpdatableReference<Opaque>;

function rootElement() {
  return env.getDOM().createElement('div', document.body);
}

function compile(template: string) {
  return env.compile(template);
}

function commonSetup() {
  env = new TestEnvironment(); // TODO: Support SimpleDOM
  root = rootElement();
}

function render(template: Template, context={}) {
  self = new UpdatableReference(opaque(context));
  result = template.render(self, env, { appendTo: root, dynamicScope: new TestDynamicScope(null) });
  assertInvariants(result);
  return result;
}

function rerender(context: Object={}) {
  self.update(opaque(context));
  result.rerender();
}

function assertInvariants(result) {
  strictEqual(result.firstNode(), root.firstChild, "The firstNode of the result is the same as the root's firstChild");
  strictEqual(result.lastNode(), root.lastChild, "The lastNode of the result is the same as the root's lastChild");
}

QUnit.module("Partials", {
  setup: commonSetup
});

QUnit.test('static partial with static content', assert => {
  let template = compile(`Before {{partial 'test'}} After`);

  env.registerPartial('test', `<div>Testing</div>`);

  render(template);

  equalTokens(root, `Before <div>Testing</div> After`);

  rerender();

  equalTokens(root, `Before <div>Testing</div> After`);
});

QUnit.test('static partial with self reference', assert => {
  let template = compile(`{{partial 'trump'}}`);
  let context = { item: 'partials' };

  env.registerPartial('trump', `I know {{item}}. I have the best {{item}}.`);

  render(template, context);

  equalTokens(root, `I know partials. I have the best partials.`);

  rerender(context);

  equalTokens(root, `I know partials. I have the best partials.`);

  rerender({ item: 'templates' });

  equalTokens(root, `I know templates. I have the best templates.`);

  rerender({ item: 'partials' });

  equalTokens(root, `I know partials. I have the best partials.`);
});

QUnit.test('static partial with local reference', assert => {
  let template = compile(`{{#each fruits key='@primitive' as |name|}}{{partial 'fruit'}} {{/each}}`);
  let context = { fruits: ['apple', 'banana'] };

  env.registerPartial('fruit', `{{name}}!`);

  render(template, context);

  equalTokens(root, `apple! banana! `);

  rerender(context);

  equalTokens(root, `apple! banana! `);

  context.fruits.push('cherry');

  rerender(context);

  equalTokens(root, `apple! banana! cherry! `);

  rerender({ fruits: ['apple', 'banana'] });

  equalTokens(root, `apple! banana! `);
});

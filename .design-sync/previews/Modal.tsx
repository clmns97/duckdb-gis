import * as React from 'react';
import * as S from "@ds-stories/design-system/src/stories/Modal.stories";

// Owned preview for Modal. Modal is a full-viewport overlay (`fixed inset-0`),
// so in a single-mode card the `.ds-single` transform wrapper becomes its
// containing block. With no in-flow content that wrapper is 0px tall, so the
// vertically-centered dialog lands off-frame. The spacer below gives the
// wrapper the capture viewport's height (minus the stable 48px body gutter the
// card template keeps for `?story=` captures) so `fixed inset-0` fills the
// frame and the dialog centers exactly like the storybook reference. The
// shipped <Modal> is unchanged — this only fixes how the card frames it.
function compose(S: any, key: string) {
  const meta: any = S.default ?? {};
  const st: any = S[key];
  const args: any = { ...(meta.args ?? {}), ...(st && st.args ? st.args : {}) };
  const at: any = { ...(meta.argTypes ?? {}), ...(st && st.argTypes ? st.argTypes : {}) };
  for (const k of Object.keys(args)) {
    const m = at[k] && at[k].mapping;
    if (m && typeof m === 'object' && args[k] in m) args[k] = m[args[k]];
  }
  const title: string = typeof meta.title === 'string' ? meta.title : '';
  const ctx: any = {
    args, name: key, title, kind: title, id: '', componentId: '',
    globals: {}, viewMode: 'story',
    parameters: (st && st.parameters) ?? meta.parameters ?? {},
  };
  let render: (() => any) | null = null;
  if (st && typeof st.render === 'function') render = () => st.render(args, ctx);
  else if (typeof st === 'function') render = () => st(args, ctx);
  else if (typeof meta.render === 'function') render = () => meta.render(args, ctx);
  else {
    const C = (st && st.component) || meta.component;
    if (C) render = () => React.createElement(C, args);
  }
  if (!render) return () => null;
  const decorators: any[] = ([] as any[]).concat((st && st.decorators) ?? []).concat(meta.decorators ?? []);
  return decorators.reduce((inner: any, dec: any) => () => {
    const out = dec(inner, ctx);
    return out === undefined ? inner() : out;
  }, render);
}

const Story = compose(S, "Default");

export const Default = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement('div', { style: { minHeight: 'calc(100vh - 48px)' } }),
    React.createElement(Story),
  );

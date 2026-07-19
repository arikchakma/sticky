// @vitest-environment jsdom
import { Editor, type JSONContent } from '@tiptap/react';
import { afterEach, describe, expect, it } from 'vitest';
import { editorExtensions } from './editor-extensions';

let editors: Editor[] = [];

function createEditor(content?: object | string, contentType?: 'markdown') {
  const editor = new Editor({
    extensions: editorExtensions,
    content,
    contentType,
  });
  editors.push(editor);
  return editor;
}

function jsonToMarkdown(doc: JSONContent) {
  return createEditor(doc).getMarkdown();
}

function markdownToJson(markdown: string) {
  return createEditor(markdown, 'markdown').getJSON();
}

function roundTrip(doc: JSONContent) {
  return markdownToJson(jsonToMarkdown(doc));
}

afterEach(() => {
  editors.forEach((editor) => editor.destroy());
  editors = [];
});

function paragraph(text: string): JSONContent {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

const nestedTaskList: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            paragraph('first'),
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: true },
                  content: [paragraph('nested')],
                },
              ],
            },
          ],
        },
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [paragraph('second')],
        },
      ],
    },
  ],
};

describe('markdown round-trip', () => {
  it('keeps headings, marks, and links intact', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'plain ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'bold' },
            { type: 'text', text: ' ' },
            { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
            { type: 'text', text: ' ' },
            { type: 'text', marks: [{ type: 'strike' }], text: 'gone' },
            { type: 'text', text: ' ' },
            { type: 'text', marks: [{ type: 'code' }], text: 'code' },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://example.com',
                    target: '_blank',
                    rel: 'noopener noreferrer nofollow',
                    class: null,
                    title: null,
                  },
                },
              ],
              text: 'a link',
            },
          ],
        },
      ],
    };

    const markdown = jsonToMarkdown(doc);
    expect(markdown).toContain('## Title');
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('~~gone~~');
    expect(markdown).toContain('`code`');
    expect(markdown).toContain('[a link](https://example.com)');
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('keeps nested task lists and checked state intact', () => {
    const markdown = jsonToMarkdown(nestedTaskList);
    expect(markdown).toContain('- [ ] first');
    expect(markdown).toContain('- [x] nested');
    expect(markdown).toContain('- [x] second');
    expect(roundTrip(nestedTaskList)).toEqual(nestedTaskList);
  });

  it('keeps bullet and ordered lists intact', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('one')] },
            { type: 'listItem', content: [paragraph('two')] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 1, type: null },
          content: [
            { type: 'listItem', content: [paragraph('first')] },
            { type: 'listItem', content: [paragraph('second')] },
          ],
        },
      ],
    };

    expect(roundTrip(doc)).toEqual(doc);
  });

  it('keeps code blocks and their language intact', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'rust' },
          content: [{ type: 'text', text: 'fn main() {}\n' }],
        },
      ],
    };

    const markdown = jsonToMarkdown(doc);
    expect(markdown).toContain('```rust');
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('keeps blockquotes and horizontal rules intact', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [paragraph('quoted')] },
        { type: 'horizontalRule' },
        paragraph('after'),
      ],
    };

    expect(roundTrip(doc)).toEqual(doc);
  });

  it('serializes underline as inline <u> html', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'underline' }], text: 'under' },
          ],
        },
      ],
    };

    const markdown = jsonToMarkdown(doc);
    expect(markdown).toContain('<u>under</u>');
    expect(markdown).not.toContain('++');
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('still parses the ++underline++ shorthand', () => {
    const doc = markdownToJson('++under++');
    expect(doc.content?.[0].content?.[0].marks).toEqual([
      { type: 'underline' },
    ]);
  });

  it('round-trips the empty default note', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };

    expect(roundTrip(doc)).toEqual(doc);
  });

  it('serializes markdown to a stable fixed point', () => {
    const markdown = jsonToMarkdown(nestedTaskList);
    const again = createEditor(markdown, 'markdown').getMarkdown();
    expect(again).toEqual(markdown);
  });
});

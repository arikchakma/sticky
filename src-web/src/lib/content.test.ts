// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getTitleFromContent } from './content';
import { markdownToTiptapJson } from './markdown';

function title(markdown: string) {
  return getTitleFromContent(markdownToTiptapJson(markdown));
}

describe('getTitleFromContent', () => {
  it('takes the first text in the document', () => {
    expect(title('Groceries\n\nMore text')).toBe('Groceries');
  });

  it('sees through heading and emphasis syntax', () => {
    expect(title('# **Welcome to Sticky**')).toBe('Welcome to Sticky');
  });

  it('sees through task list markers', () => {
    expect(title('- [x] Buy milk')).toBe('Buy milk');
  });

  it('sees through ordered list markers', () => {
    expect(title('1. First step')).toBe('First step');
  });

  it('uses the link text, not the url', () => {
    expect(title('[Sticky](https://sticky.app) rocks')).toBe('Sticky');
  });

  it('sees through underline html', () => {
    expect(title('<u>Important</u> note')).toBe('Important');
  });

  it('returns empty for empty notes', () => {
    expect(title('')).toBe('');
  });
});

import type { Transaction } from '@tiptap/pm/state';
import { ReplaceAroundStep, ReplaceStep, Step } from '@tiptap/pm/transform';

function isReplaceStep(step: Step) {
  return step instanceof ReplaceStep || step instanceof ReplaceAroundStep;
}

export function getTransactionType(transaction: Transaction) {
  let type: 'delete' | 'insert' | null = null;
  for (const step of transaction.steps) {
    if (!isReplaceStep(step)) {
      continue;
    }

    const slice = step.slice;
    if (!slice) {
      continue;
    }

    const content = slice.content;
    if (content.size === 0) {
      type = 'delete';
      break;
    } else if (content.size > 0) {
      type = 'insert';
      break;
    }
  }

  return type;
}

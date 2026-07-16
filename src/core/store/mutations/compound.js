/**
 * Compound / bulk document operations.
 */
import { replaceBlocks } from './blocks.js';

/**
 * Restore a revision snapshot's blocks.
 * Caller supplies beforeBlocks for the inverse when building the command.
 */
export function restoreRevisionBlocks(project, { blocks }) {
  return replaceBlocks(project, { blocks });
}

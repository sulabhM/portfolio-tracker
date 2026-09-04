import { generateHTML, generateJSON, generateText, type Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';

/**
 * The note document schema. Shared by the editor and by every read-only
 * renderer so that whatever the editor can produce is exactly what gets
 * displayed — nothing more.
 *
 * StarterKit already bundles Underline and Link, so they must not be added
 * again (TipTap warns about duplicate extension names).
 */
export const NOTE_EXTENSIONS: Extensions = [StarterKit, Highlight];

/**
 * Re-serialize stored note HTML through the ProseMirror schema.
 *
 * Note content is user-authored, but it also arrives from the sync file and
 * from imported backups — files the user may not have written. Parsing with
 * `DOMParser` (inert: no script execution, no resource loads) and then
 * re-emitting only schema-known nodes/marks strips `<script>`, `<img
 * onerror>`, inline event handlers and `javascript:` hrefs (the Link
 * extension rejects disallowed protocols in `parseHTML`). Only the output of
 * this function may be passed to `dangerouslySetInnerHTML`.
 */
export function sanitizeNoteHtml(html: string): string {
  if (!html) return '';
  try {
    return generateHTML(generateJSON(html, NOTE_EXTENSIONS), NOTE_EXTENSIONS);
  } catch {
    // Unparseable content: render nothing rather than raw markup.
    return '';
  }
}

/** Plain-text preview of note HTML, without touching the live DOM. */
export function noteHtmlToText(html: string): string {
  if (!html) return '';
  try {
    return generateText(generateJSON(html, NOTE_EXTENSIONS), NOTE_EXTENSIONS, {
      blockSeparator: ' ',
    }).trim();
  } catch {
    return '';
  }
}

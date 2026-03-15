import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Code,
  Highlighter,
  Minus,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useHoldings, updateNote, deleteNote } from '../../db/hooks';
import type { Note } from '../../types';
import { cn } from '../../utils/format';

interface NoteEditorProps {
  note: Note;
  onBack: () => void;
}

export function NoteEditor({ note, onBack }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [tickerLinks, setTickerLinks] = useState<string[]>(note.tickerLinks);
  const [tags, setTags] = useState<string[]>(() => {
    const merged = new Set(note.tags.map((t) => t.toLowerCase()));
    for (const tl of note.tickerLinks) merged.add(tl.toLowerCase());
    return Array.from(merged);
  });
  const [tagInput, setTagInput] = useState('');
  const holdings = useHoldings();
  const saveTimeout = useRef<number>(0);

  function scheduleSave(partial: Partial<Note>) {
    clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(async () => {
      if (note.id) await updateNote(note.id, partial);
    }, 600);
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight,
      Placeholder.configure({
        placeholder: 'Start writing your research notes...',
      }),
    ],
    content: note.content,
    onUpdate: ({ editor: e }) => {
      scheduleSave({ content: e.getHTML() });
    },
  });

  useEffect(() => {
    scheduleSave({ title });
  }, [title]);

  useEffect(() => {
    scheduleSave({ tags });
  }, [tags]);

  useEffect(() => {
    scheduleSave({ tickerLinks });
  }, [tickerLinks]);

  useEffect(() => {
    return () => clearTimeout(saveTimeout.current);
  }, []);

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const tag = tagInput.trim().toLowerCase();
      if (tag && !tags.includes(tag)) {
        setTags([...tags, tag]);
      }
      setTagInput('');
    }
  }

  function handleTickerToggle(ticker: string) {
    const tag = ticker.toLowerCase();
    if (tickerLinks.includes(ticker)) {
      setTickerLinks((prev) => prev.filter((t) => t !== ticker));
      setTags((prev) => prev.filter((t) => t !== tag));
    } else {
      setTickerLinks((prev) => [...prev, ticker]);
      setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    }
  }

  async function handleDelete() {
    if (note.id) await deleteNote(note.id);
    onBack();
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-sm font-medium rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        >
          &larr; Back
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-sm font-medium rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Delete
        </button>
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Note title..."
        className="w-full text-2xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-slate-600 mb-4"
      />

      {/* Tags */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
          Tags
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => {
            const isTickerTag = tickerLinks.some(
              (tl) => tl.toLowerCase() === tag
            );
            return (
              <span
                key={tag}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
                  isTickerTag
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                )}
              >
                {tag}
                {!isTickerTag && (
                  <button
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                    className="hover:text-indigo-900 dark:hover:text-indigo-100"
                  >
                    &times;
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Add tag (press Enter)..."
          className={cn(inputClass, 'text-sm')}
        />
      </div>

      {/* Ticker links */}
      {holdings.length > 0 && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
            Linked Tickers
          </label>
          <div className="flex flex-wrap gap-1.5">
            {holdings.map((h) => (
              <button
                key={h.id}
                onClick={() => handleTickerToggle(h.ticker)}
                className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full transition-colors',
                  tickerLinks.includes(h.ticker)
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                )}
              >
                {h.ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Editor toolbar */}
      {editor && (
        <div className="flex flex-wrap gap-0.5 p-1.5 mb-2 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
          <Btn
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={16} />
          </Btn>
          <Btn
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={16} />
          </Btn>
          <Btn
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon size={16} />
          </Btn>
          <Btn
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={16} />
          </Btn>
          <Sep />
          <Btn
            active={editor.isActive('heading', { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 size={16} />
          </Btn>
          <Btn
            active={editor.isActive('heading', { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 size={16} />
          </Btn>
          <Sep />
          <Btn
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={16} />
          </Btn>
          <Btn
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={16} />
          </Btn>
          <Btn
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={16} />
          </Btn>
          <Btn
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Code size={16} />
          </Btn>
          <Btn
            active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter size={16} />
          </Btn>
          <Btn
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus size={16} />
          </Btn>
        </div>
      )}

      {/* Editor content */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4 min-h-[300px]">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Btn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'p-1.5 rounded transition-colors',
        active
          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
          : 'text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-slate-200'
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-1 self-center" />
  );
}

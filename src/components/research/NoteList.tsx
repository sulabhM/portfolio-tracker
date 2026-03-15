import type { Note } from '../../types';
import { formatDate } from '../../utils/format';

interface NoteListProps {
  notes: Note[];
  onSelect: (id: number) => void;
}

export function NoteList({ notes, onSelect }: NoteListProps) {
  function stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent ?? '';
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => (
        <button
          key={note.id}
          onClick={() => note.id && onSelect(note.id)}
          className="text-left p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1 truncate">
            {note.title || 'Untitled'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2 mb-2">
            {stripHtml(note.content) || 'Empty note'}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
              >
                {tag}
              </span>
            ))}
            {note.tickerLinks.slice(0, 3).map((ticker) => (
              <span
                key={ticker}
                className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
              >
                ${ticker}
              </span>
            ))}
            <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-auto">
              {formatDate(note.updatedAt)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

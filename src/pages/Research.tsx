import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, ChevronDown } from 'lucide-react';
import { useNotes, useAllTags, useNote, addNote, useWatchlist } from '../db/hooks';
import { NoteEditor } from '../components/research/NoteEditor';
import { NoteList } from '../components/research/NoteList';
import { TickerDetailView } from '../components/research/TickerDetailView';
import { EmptyState } from '../components/common/EmptyState';
import { cn } from '../utils/format';

export function Research() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const [selectedTag, setSelectedTag] = useState<string | undefined>();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const notes = useNotes(selectedTag);
  const allTags = useAllTags();
  const watchlist = useWatchlist();
  const editingNote = useNote(noteId ? parseInt(noteId) : undefined);

  async function handleNewNote() {
    const id = await addNote({
      title: '',
      content: '',
      tags: [],
      tickerLinks: [],
    });
    navigate(`/research/${id}`);
  }

  if (noteId) {
    if (!editingNote) {
      return (
        <div className="text-center py-16 text-gray-500 dark:text-slate-400">
          Loading...
        </div>
      );
    }
    return (
      <NoteEditor
        key={editingNote.id}
        note={editingNote}
        onBack={() => navigate('/research')}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Research
        </h1>
        <div className="flex items-center gap-2">
          {/* Ticker lookup dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors',
                selectedTicker
                  ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
              )}
            >
              {selectedTicker ?? 'Ticker Lookup'}
              <ChevronDown
                size={14}
                className={cn(
                  'transition-transform',
                  dropdownOpen && 'rotate-180'
                )}
              />
            </button>
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-72 overflow-y-auto bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 shadow-xl">
                  {selectedTicker && (
                    <button
                      onClick={() => {
                        setSelectedTicker(null);
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-800"
                    >
                      Clear selection
                    </button>
                  )}
                  {watchlist.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-gray-400 dark:text-slate-500 text-center">
                      No tickers in watchlist
                    </p>
                  ) : (
                    watchlist
                      .sort((a, b) => a.ticker.localeCompare(b.ticker))
                      .map((w) => (
                        <button
                          key={w.id}
                          onClick={() => {
                            setSelectedTicker(w.ticker);
                            setDropdownOpen(false);
                          }}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between',
                            w.ticker === selectedTicker
                              ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                              : 'text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
                          )}
                        >
                          <span className="font-medium">{w.ticker}</span>
                          <span className="text-xs text-gray-500 dark:text-slate-400 truncate ml-2 max-w-[120px]">
                            {w.name}
                          </span>
                        </button>
                      ))
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleNewNote}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            New Note
          </button>
        </div>
      </div>

      {/* Ticker detail view */}
      {selectedTicker && (
        <div className="mb-8">
          <TickerDetailView key={selectedTicker} ticker={selectedTicker} />
        </div>
      )}

      {/* Notes section */}
      {notes.length === 0 && !selectedTag && !selectedTicker ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title="No research notes yet"
          description="Start documenting your investment research and thesis."
          action={
            <button
              onClick={handleNewNote}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus size={16} />
              Create your first note
            </button>
          }
        />
      ) : (
        <>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              <button
                onClick={() => setSelectedTag(undefined)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                  !selectedTag
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                )}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setSelectedTag(tag === selectedTag ? undefined : tag)
                  }
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-full transition-colors',
                    selectedTag === tag
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400'
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
          <NoteList
            notes={notes}
            onSelect={(id) => navigate(`/research/${id}`)}
          />
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useStorage } from '../utils/storage';
import { STORAGE_KEYS } from '../utils/storageKeys';
import NotesCalendar from '../components/notes/NotesCalendar';

const NOTE_COLORS = [
  { name: 'Blue', bg: 'from-blue-50 to-blue-100', border: 'border-blue-200', dark: 'dark:from-blue-900/20 dark:to-blue-800/20 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300' },
  { name: 'Green', bg: 'from-green-50 to-green-100', border: 'border-green-200', dark: 'dark:from-green-900/20 dark:to-green-800/20 dark:border-green-800', text: 'text-green-700 dark:text-green-300' },
  { name: 'Yellow', bg: 'from-yellow-50 to-yellow-100', border: 'border-yellow-200', dark: 'dark:from-yellow-900/20 dark:to-yellow-800/20 dark:border-yellow-800', text: 'text-yellow-700 dark:text-yellow-300' },
  { name: 'Purple', bg: 'from-purple-50 to-purple-100', border: 'border-purple-200', dark: 'dark:from-purple-900/20 dark:to-purple-800/20 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-300' },
  { name: 'Pink', bg: 'from-pink-50 to-pink-100', border: 'border-pink-200', dark: 'dark:from-pink-900/20 dark:to-pink-800/20 dark:border-pink-800', text: 'text-pink-700 dark:text-pink-300' },
  { name: 'Indigo', bg: 'from-indigo-50 to-indigo-100', border: 'border-indigo-200', dark: 'dark:from-indigo-900/20 dark:to-indigo-800/20 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300' },
];

function Notes() {
  const { getItem, setItem } = useStorage();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [filterTag, setFilterTag] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [showStats, setShowStats] = useState(true);
  const [activeTab, setActiveTab] = useState('notes');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [selectedDateNotes, setSelectedDateNotes] = useState([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedColor, setSelectedColor] = useState(NOTE_COLORS[0]);
  const [lastSaved, setLastSaved] = useState(null);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const modalRef = useRef(null);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteTags([]);
    setTagInput('');
    setSelectedColor(NOTE_COLORS[0]);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getItem(STORAGE_KEYS.NOTES),
      getItem(STORAGE_KEYS.NOTES_VIEW_PREFS),
    ]).then(([savedNotes, prefs]) => {
      if (cancelled) return;
      setNotes(Array.isArray(savedNotes) ? savedNotes : []);
      if (prefs) {
        if (prefs.sortBy) setSortBy(prefs.sortBy);
        if (prefs.filterTag) setFilterTag(prefs.filterTag);
        if (prefs.viewMode) setViewMode(prefs.viewMode);
        if (typeof prefs.showStats === 'boolean') setShowStats(prefs.showStats);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [getItem]);

  // Escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isModalOpen) handleCloseModal();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isModalOpen, handleCloseModal]);

  // Save notes whenever notes change
  useEffect(() => {
    if (loading) return;
    setItem(STORAGE_KEYS.NOTES, notes)
      .then(() => {
        setLastSaved(new Date());
        setError((prev) => (prev && prev.includes('Storage full') ? null : prev));
      })
      .catch(() => setError('Failed to save notes'));
  }, [notes, setItem, loading]);

  // Save view preferences whenever they change
  useEffect(() => {
    if (loading) return;
    setItem(STORAGE_KEYS.NOTES_VIEW_PREFS, { sortBy, filterTag, viewMode, showStats }).catch(() => {});
  }, [sortBy, filterTag, viewMode, showStats, setItem, loading]);

  // Auto-dismiss error after 5 seconds so UI does not stay in error state
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // Modal focus trap: keep Tab inside modal when open
  useEffect(() => {
    if (!isModalOpen || !modalRef.current) return;
    const el = modalRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = [...el.querySelectorAll(focusableSelector)].filter(
      (node) => node.offsetParent != null
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const handleKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Get all unique tags from notes
  const allTags = useMemo(() => {
    const tags = new Set();
    notes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(tag => tags.add(tag));
      }
    });
    return Array.from(tags).sort();
  }, [notes]);

  // Filtered and sorted notes (pinned always first)
  const filteredNotes = useMemo(() => {
    let filtered = [...notes];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(note =>
        note.title?.toLowerCase().includes(query) ||
        note.content?.toLowerCase().includes(query) ||
        note.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Tag filter
    if (filterTag !== 'all') {
      filtered = filtered.filter(note =>
        note.tags && note.tags.includes(filterTag)
      );
    }

    // Sort: pinned first, then by selected sort
    filtered.sort((a, b) => {
      const aPinned = a.pinned ? 1 : 0;
      const bPinned = b.pinned ? 1 : 0;
      if (bPinned !== aPinned) return bPinned - aPinned;

      switch (sortBy) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '');
        case 'color':
          return (a.color?.name || '').localeCompare(b.color?.name || '');
        case 'date':
        default:
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      }
    });

    return filtered;
  }, [notes, searchQuery, filterTag, sortBy]);

  // Statistics
  const stats = useMemo(() => {
    const total = notes.length;
    const byColor = {};
    NOTE_COLORS.forEach(color => {
      byColor[color.name] = notes.filter(n => n.color?.name === color.name).length;
    });
    const withTags = notes.filter(n => n.tags && n.tags.length > 0).length;
    const withoutTags = total - withTags;
    const totalTags = allTags.length;
    const avgTagsPerNote = total > 0 ? notes.reduce((sum, n) => sum + (n.tags?.length || 0), 0) / total : 0;

    return { total, byColor, withTags, withoutTags, totalTags, avgTagsPerNote };
  }, [notes, allTags.length]);

  const handleAddNote = () => {
    setEditingNote(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteTags([]);
    setTagInput('');
    setSelectedColor(NOTE_COLORS[0]);
    setIsModalOpen(true);
  };

  const handleEditNote = (note) => {
    setEditingNote(note);
    setNoteTitle(note.title || '');
    setNoteContent(note.content || '');
    setNoteTags(note.tags || []);
    setTagInput('');
    setSelectedColor(note.color || NOTE_COLORS[0]);
    setIsModalOpen(true);
  };

  const handleDuplicateNote = (note) => {
    const now = new Date().toISOString();
    const newNote = {
      id: Date.now().toString(),
      title: (note.title || 'Untitled') + ' (Copy)',
      content: note.content || '',
      tags: note.tags ? [...note.tags] : [],
      color: note.color || NOTE_COLORS[0],
      pinned: false,
      createdAt: now,
      updatedAt: now
    };
    setNotes(prev => [newNote, ...prev]);
  };

  const handleTogglePin = (note) => {
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, pinned: !n.pinned } : n
    ));
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        const imported = Array.isArray(data) ? data : (data.notes || [data]);
        const validNotes = imported.filter(n => n && (n.title || n.content));
        const normalized = validNotes.map(n => ({
          id: (n.id || Date.now() + Math.random()).toString(),
          title: n.title || '',
          content: n.content || '',
          tags: Array.isArray(n.tags) ? n.tags : [],
          color: NOTE_COLORS.find(c => c.name === n.color?.name) || NOTE_COLORS[0],
          pinned: Boolean(n.pinned),
          createdAt: n.createdAt || new Date().toISOString(),
          updatedAt: n.updatedAt || new Date().toISOString()
        }));
        setNotes(prev => [...normalized, ...prev]);
        setError(null);
      } catch (err) {
        setError('Invalid file format. Please import a valid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveNote = () => {
    if (!noteTitle.trim() && !noteContent.trim()) {
      setError('Note must have at least a title or content');
      return;
    }

    try {
      const now = new Date().toISOString();
      if (editingNote) {
        // Update existing note
        setNotes(prev => prev.map(note =>
          note.id === editingNote.id
            ? {
                ...note,
                title: noteTitle.trim(),
                content: noteContent.trim(),
                tags: noteTags,
                color: selectedColor,
                updatedAt: now
              }
            : note
        ));
      } else {
        // Create new note
        const newNote = {
          id: Date.now().toString(),
          title: noteTitle.trim(),
          content: noteContent.trim(),
          tags: noteTags,
          color: selectedColor,
          pinned: false,
          createdAt: now,
          updatedAt: now
        };
        setNotes(prev => [newNote, ...prev]);
      }
      setIsModalOpen(false);
      setEditingNote(null);
      setError(null);
    } catch (err) {
      console.error('Failed to save note:', err);
      setError(err.message || 'Failed to save note');
    }
  };

  const handleDeleteNote = (id) => {
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }
    try {
      setNotes(prev => prev.filter(note => note.id !== id));
      setSelectedNotes(prev => prev.filter(n => n !== id));
    } catch (err) {
      console.error('Failed to delete note:', err);
      setError(err.message || 'Failed to delete note');
    }
  };

  const handleBulkDelete = () => {
    if (selectedNotes.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedNotes.length} note(s)?`)) {
      return;
    }
    try {
      setNotes(prev => prev.filter(note => !selectedNotes.includes(note.id)));
      setSelectedNotes([]);
    } catch (err) {
      console.error('Failed to delete notes:', err);
      setError(err.message || 'Failed to delete notes');
    }
  };

  const toggleSelectNote = (id) => {
    setSelectedNotes(prev => 
      prev.includes(id) 
        ? prev.filter(n => n !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedNotes.length === filteredNotes.length) {
      setSelectedNotes([]);
    } else {
      setSelectedNotes(filteredNotes.map(n => n.id));
    }
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !noteTags.includes(tag)) {
      setNoteTags(prev => [...prev, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setNoteTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleTagInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(notes, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `notes-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatLastSaved = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return 'Just now';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const charCount = (noteTitle || '').length + (noteContent || '').length;
  const wordCount = (noteTitle + ' ' + noteContent).trim().split(/\s+/).filter(Boolean).length;

  const handleCalendarDateSelect = useCallback((date, dayNotes) => {
    setSelectedCalendarDate(date);
    setSelectedDateNotes(dayNotes);
  }, []);

  return (
    <div className="w-full max-w-[1800px] mx-auto flex flex-col space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <Link to="/" className="hover:text-sky-400 dark:hover:text-sky-300 transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="font-medium text-gray-900 dark:text-white">Notes</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1">Notes</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create, organize, and manage your notes with tags, colors, and pins
            </p>
            {/* Tab view */}
            <div className="flex gap-1 mt-4">
              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'notes'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-gray-700'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent'
                }`}
              >
                Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === 'calendar'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border border-b-0 border-gray-200 dark:border-gray-700'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent'
                }`}
              >
                Calendar
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {lastSaved ? `Auto-saved at ${formatLastSaved(lastSaved)}` : 'Ready'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={importData}
              className="hidden"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              title="Import from JSON"
              aria-label="Import notes from JSON file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </button>
            <button
              type="button"
              onClick={exportData}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              title="Export to JSON"
              aria-label="Export notes to JSON file"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
            <button
              type="button"
              onClick={handleAddNote}
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Note
            </button>
          </div>
        </div>

        {/* Tab content area */}
        <div className="bg-white dark:bg-gray-800 rounded-b-lg rounded-tr-lg border border-gray-200 dark:border-gray-700 border-t-0 pt-4 -mt-[1px]">
        {activeTab === 'calendar' ? (
          <div className="space-y-6">
            <NotesCalendar
              notes={notes}
              onDateSelect={handleCalendarDateSelect}
              onNoteClick={handleEditNote}
            />
            {selectedCalendarDate && (
              <div className="mt-6 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Notes for {selectedCalendarDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </h3>
                {selectedDateNotes.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No notes on this date. Create a note to see it here.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDateNotes.map((note) => {
                      const color = note.color || NOTE_COLORS[0];
                      return (
                        <li key={note.id}>
                          <button
                            type="button"
                            onClick={() => handleEditNote(note)}
                            className={`w-full text-left p-3 rounded-lg border ${color.border} ${color.dark} hover:opacity-90 transition-opacity bg-gradient-to-br ${color.bg} ${color.dark}`}
                          >
                            <span className="font-medium text-gray-900 dark:text-white">{note.title || 'Untitled'}</span>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{note.content || 'No content'}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Statistics Cards */}
        {showStats && notes.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Total Notes</span>
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-green-700 dark:text-green-300">With Tags</span>
                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.withTags}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Total Tags</span>
                <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{stats.totalTags}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300">Avg Tags</span>
                <svg className="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                {stats.avgTagsPerNote.toFixed(1)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">No Tags</span>
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">{stats.withoutTags}</p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-pink-700 dark:text-pink-300">Filtered</span>
                <svg className="w-4 h-4 text-pink-600 dark:text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-pink-900 dark:text-pink-100">{filteredNotes.length}</p>
            </div>
          </div>
        )}

        {/* Controls Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes by title, content, or tags..."
                className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                aria-label="Search notes by title, content, or tags"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Filters and Controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Tag Filter */}
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="px-3 py-2 pr-9 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm appearance-none bg-no-repeat bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] cursor-pointer [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] dark:[background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%239ca3af%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')]"
                style={{ textDecoration: 'none' }}
                aria-label="Filter by tag"
              >
                <option value="all">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>

              {/* Sort */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 pr-9 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white text-sm appearance-none bg-no-repeat bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] cursor-pointer [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] dark:[background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%239ca3af%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')]"
                style={{ textDecoration: 'none' }}
                aria-label="Sort notes"
              >
                <option value="date">Sort by Date</option>
                <option value="title">Sort by Title</option>
                <option value="color">Sort by Color</option>
              </select>

              {/* View Mode */}
              <div className="flex items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                  title="Grid View"
                  aria-label="Grid view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                  </svg>
                </button>
                <span className="text-gray-800 dark:text-gray-500">|</span>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'text-sky-400' : 'text-black dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                  title="List View"
                  aria-label="List view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>

              {/* Toggle Stats */}
              <button
                type="button"
                onClick={() => setShowStats(!showStats)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title={showStats ? "Hide Statistics" : "Show Statistics"}
                aria-label={showStats ? "Hide statistics" : "Show statistics"}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedNotes.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedNotes.length} note(s) selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                >
                  Delete All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedNotes([])}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-red-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-600 dark:text-red-300 hover:text-red-800 dark:hover:text-red-100"
              aria-label="Dismiss error"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Notes Display */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <svg
            className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {searchQuery || filterTag !== 'all' ? 'No notes found' : 'No notes yet'}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {searchQuery || filterTag !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'Get started by creating your first note'}
          </p>
          {notes.length > 0 && (searchQuery || filterTag !== 'all') && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Showing 0 of {notes.length} notes
            </p>
          )}
          {(!searchQuery && filterTag === 'all') && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleAddNote}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Note
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Import notes
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Select All Checkbox */}
          {filteredNotes.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedNotes.length === filteredNotes.length && filteredNotes.length > 0}
                onChange={toggleSelectAll}
                className="rounded border-gray-300 text-sky-400 focus:ring-sky-500"
              />
              <label className="text-sm text-gray-600 dark:text-gray-400">
                Select all ({filteredNotes.length})
              </label>
            </div>
          )}

          {/* Notes Grid/List View */}
          <div className={viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
            : 'space-y-4'
          }>
            {filteredNotes.map((note) => {
              const color = note.color || NOTE_COLORS[0];
              return (
                <div
                  key={note.id}
                  className="group/card relative"
                >
                  {/* Main Card */}
                  <div
                    className={`relative flex flex-col bg-white dark:bg-gray-800 rounded-lg border ${color.border} ${color.dark} transition-all overflow-hidden cursor-default min-h-[180px] ${
                      viewMode === 'grid' ? '' : 'sm:flex-row'
                    } ${selectedNotes.includes(note.id) ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    {/* Colored Header/Accent */}
                    <div className={`flex-shrink-0 w-full ${viewMode === 'grid' ? 'h-24' : 'sm:w-40 h-28 sm:h-auto'} bg-gradient-to-br ${color.bg} ${color.dark} flex items-center justify-center relative`}>
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedNotes.includes(note.id)}
                          onChange={() => toggleSelectNote(note.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 z-10"
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                          className={`p-1 rounded transition-colors ${note.pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}
                          title={note.pinned ? 'Unpin' : 'Pin to top'}
                        >
                          <svg className="w-4 h-4" fill={note.pinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                      </div>
                      <div className="text-center p-2">
                        <span className={`text-xs font-medium block ${color.text}`}>{color.name}</span>
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="flex-1 p-5 flex flex-col">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 line-clamp-2">
                            {note.title || 'Untitled Note'}
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {formatDate(note.updatedAt || note.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button
                            type="button"
                            onClick={() => handleDuplicateNote(note)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Duplicate"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 10h2a2 2 0 002-2v-2m0 10h-2a2 2 0 01-2-2v-2m0 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditNote(note)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-sky-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2 whitespace-pre-wrap flex-1">
                        {note.content || 'No content'}
                      </p>

                      {note.tags && note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-200 dark:border-gray-700">
                          {note.tags.map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setFilterTag(filterTag === tag ? 'all' : tag)}
                              className={`px-2 py-0.5 text-xs font-medium rounded-full transition-colors ${
                                filterTag === tag
                                  ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Popover - Shows full content on hover (list view only) */}
                  {viewMode === 'list' && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-[90%] max-w-lg opacity-0 invisible group-hover/card:opacity-100 group-hover/card:visible transition-all duration-200 pointer-events-none group-hover/card:pointer-events-auto">
                    {/* Popover Arrow (pointing up) */}
                    <div className={`absolute left-1/2 -translate-x-1/2 -top-2 w-4 h-4 rotate-45 bg-gradient-to-br ${color.bg} ${color.dark} border-l border-t ${color.border}`}></div>
                    
                    <div className={`bg-white dark:bg-gray-800 rounded-lg border ${color.border} ${color.dark} overflow-hidden`}>
                      {/* Popover Header */}
                      <div className={`px-4 py-3 bg-gradient-to-r ${color.bg} ${color.dark} border-b ${color.border}`}>
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                            {note.title || 'Untitled Note'}
                          </h4>
                          <span className={`text-xs font-medium ${color.text} px-2 py-0.5 rounded-full bg-white/50 dark:bg-gray-800/50`}>
                            {color.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {formatDate(note.updatedAt || note.createdAt)}
                        </p>
                      </div>
                      
                      {/* Popover Body - Full Content */}
                      <div className="p-4 max-h-64 overflow-y-auto">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {note.content || 'No content'}
                        </p>
                      </div>

                      {/* Popover Footer - Tags & Actions */}
                      {(note.tags && note.tags.length > 0) && (
                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex flex-wrap gap-1.5">
                            {note.tags.map(tag => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Quick Actions in Popover */}
                      <div className="px-4 py-2 bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDuplicateNote(note)}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m0 10h2a2 2 0 002-2v-2m0 10h-2a2 2 0 01-2-2v-2m0 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2" />
                          </svg>
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditNote(note)}
                          className="px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(note.id)}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Results Count - always show */}
          <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {filteredNotes.length === notes.length
              ? `${notes.length} note${notes.length !== 1 ? 's' : ''}`
              : `Showing ${filteredNotes.length} of ${notes.length} notes`}
          </div>
        </>
      )}
        </>
      ) }
        </div>
        </div>

      {/* Add/Edit Note Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-900/60 backdrop-blur-sm" onClick={handleCloseModal} aria-hidden="true"></div>
            <div ref={modalRef} className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full border border-gray-200 dark:border-gray-700" role="dialog" aria-modal="true" aria-labelledby="notes-modal-title">
              <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 id="notes-modal-title" className="text-xl font-bold text-gray-900 dark:text-white">
                    {editingNote ? 'Edit Note' : 'New Note'}
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Close modal"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="Enter note title..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      autoFocus
                    />
                  </div>

                  {/* Content */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Content
                      </label>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {wordCount} words · {charCount} characters
                      </span>
                    </div>
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Enter note content..."
                      rows={8}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white resize-y min-h-[120px]"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tags
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {noteTags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="hover:text-blue-900 dark:hover:text-blue-100"
                            aria-label={`Remove tag ${tag}`}
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagInputKeyDown}
                        placeholder="Add a tag and press Enter..."
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={addTag}
                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Color Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Color
                    </label>
                    <div className="grid grid-cols-6 gap-2">
                      {NOTE_COLORS.map(color => (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => setSelectedColor(color)}
                          className={`p-3 rounded-lg border-2 transition-all ${
                            selectedColor.name === color.name
                              ? 'border-gray-900 dark:border-white ring-2 ring-blue-500'
                              : 'border-gray-300 dark:border-gray-600'
                          } bg-gradient-to-br ${color.bg} ${color.dark}`}
                          title={color.name}
                        >
                          <div className={`w-full h-4 rounded ${color.bg} ${color.dark}`}></div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  {editingNote ? 'Update' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Notes;


import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useStorage } from '../../utils/storage';
import { STORAGE_KEYS } from '../../utils/storageKeys';

function getInitialUserData(user) {
  const fallback = {
    name: 'John Doe',
    email: 'john.doe@example.com',
    dob: '',
    phone: '',
    location: '',
    bio: '',
  };
  if (!user || typeof user !== 'object') return fallback;
  const nameFromUser =
    user.name ||
    user.full_name ||
    user.fullName ||
    user.username ||
    fallback.name;
  const emailFromUser = user.email || fallback.email;
  return {
    ...fallback,
    name: String(nameFromUser),
    email: String(emailFromUser),
  };
}

function UserProfile({ user, onLogout }) {
  const { getItem, setItem } = useStorage();
  const [userData, setUserData] = useState(() => getInitialUserData(user));

  const [isEditing, setIsEditing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editForm, setEditForm] = useState(userData);
  const [saveError, setSaveError] = useState('');
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const profileRef = useRef(null);
  const hasUserSavedOnceRef = useRef(false);
  const hasLoadedFromStorageRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getItem(STORAGE_KEYS.USER_PROFILE).then((parsed) => {
      if (cancelled) return;
      if (parsed && typeof parsed === 'object') {
        hasLoadedFromStorageRef.current = true;
        hasUserSavedOnceRef.current = true;
        setUserData(parsed);
        setEditForm(parsed);
      } else if (!hasLoadedFromStorageRef.current) {
        const initialFromUser = getInitialUserData(user);
        setUserData(initialFromUser);
        setEditForm(initialFromUser);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getItem, user]);

  useEffect(() => {
    if (hasUserSavedOnceRef.current) {
      setItem(STORAGE_KEYS.USER_PROFILE, userData).catch(() => {});
    }
  }, [userData, setItem]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEYS.USER_PROFILE || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue);
        if (next && typeof next === 'object') {
          hasLoadedFromStorageRef.current = true;
          hasUserSavedOnceRef.current = true;
          setUserData(next);
          setEditForm(next);
        }
      } catch {
        // ignore parse errors
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowProfile(false);
        setIsEditing(false);
      }
    };

    if (showProfile) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = '';
      };
    }
  }, [showProfile]);

  const getInitials = (name) => {
    if (!name) return 'JD';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const handleSave = () => {
    setSaveError('');
    const trimmedName = (editForm.name || '').trim();
    const trimmedEmail = (editForm.email || '').trim();
    if (!trimmedName) {
      setSaveError('Please enter your name.');
      return;
    }
    if (!trimmedEmail) {
      setSaveError('Please enter your email.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setSaveError('Please enter a valid email address.');
      return;
    }
    hasUserSavedOnceRef.current = true;
    setUserData({ ...editForm, name: trimmedName, email: trimmedEmail });
    setIsEditing(false);
    setShowSavedFeedback(true);
    setTimeout(() => {
      setShowProfile(false);
      setShowSavedFeedback(false);
    }, 600);
  };

  const handleCancel = () => {
    setEditForm(userData);
    setIsEditing(false);
    setSaveError('');
  };

  const handleClose = () => {
    setShowProfile(false);
    setIsEditing(false);
    setEditForm(userData);
    setSaveError('');
  };

  const handleInputChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const openProfile = () => {
    setShowProfile(true);
    setIsEditing(false);
    setEditForm(userData);
    setSaveError('');
  };

  const profileModalContent = showProfile && (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={profileRef}
        className="relative w-full min-w-[280px] max-w-sm bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Simple header: title + close */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 id="profile-modal-title" className="text-sm font-semibold text-gray-900 dark:text-white">Profile</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          {showSavedFeedback && (
            <div className="mb-3 py-2 px-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-xs font-medium text-center" role="status">
              Saved
            </div>
          )}
          {saveError && (
            <div className="mb-3 py-2 px-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs font-medium" role="alert">
              {saveError}
            </div>
          )}

          {!isEditing ? (
            <>
              {/* Compact: avatar + name + email in one block */}
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-12 h-12 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium">
                  {getInitials(userData.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{userData.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userData.email}</p>
                </div>
              </div>

              {(userData.dob || userData.phone || userData.location || userData.bio) ? (
                <div className="space-y-2 mb-4">
                  {userData.dob && <InfoRow label="Birthday" value={formatDate(userData.dob)} icon={calendarIcon} />}
                  {userData.phone && <InfoRow label="Phone" value={userData.phone} icon={phoneIcon} />}
                  {userData.location && <InfoRow label="Location" value={userData.location} icon={locationIcon} />}
                  {userData.bio && <InfoRow label="Bio" value={userData.bio} icon={bioIcon} />}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">Add more in Edit.</p>
              )}

              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-full py-2 text-sm font-medium rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
              >
                Edit profile
              </button>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Edit profile</p>
              <div className="space-y-3">
                <FormField label="Name" required>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="form-input"
                    placeholder="Your name"
                  />
                </FormField>
                <FormField label="Email" required>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="form-input"
                    placeholder="you@example.com"
                  />
                </FormField>
                <FormField label="Birthday">
                  <input
                    type="date"
                    value={editForm.dob}
                    onChange={(e) => handleInputChange('dob', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Phone">
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="form-input"
                    placeholder="+1 555 000 0000"
                  />
                </FormField>
                <FormField label="Location">
                  <input
                    type="text"
                    value={editForm.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className="form-input"
                    placeholder="City, Country"
                  />
                </FormField>
                <FormField label="Bio">
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => handleInputChange('bio', e.target.value)}
                    rows={2}
                    className="form-input resize-none"
                    placeholder="Short bio..."
                  />
                </FormField>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!(editForm.name || '').trim() || !(editForm.email || '').trim()}
                  className="flex-1 py-2 text-sm font-medium rounded-md bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar profile widget — 3 columns: icon + small text */}
      <div className="px-3 py-2">
        <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="p-2 flex items-center justify-center gap-6">
            {user?.is_admin && (
              <Link
                to="/admin"
                className="flex flex-col items-center gap-1 min-w-0 shrink-0"
                aria-label="Go to admin portal"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate max-w-full">Admin</span>
              </Link>
            )}
            <button
              type="button"
              onClick={openProfile}
              className="flex flex-col items-center gap-1 min-w-0 shrink-0"
              aria-label="Open profile"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                {getInitials(userData.name)}
              </span>
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate max-w-full" title={userData.name}>{userData.name ? userData.name.split(' ')[0] : 'Profile'}</span>
            </button>
            {user?.username && typeof onLogout === 'function' && (
              <button
                type="button"
                onClick={onLogout}
                className="flex flex-col items-center gap-1 min-w-0 shrink-0"
                aria-label="Logout"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </span>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile modal — rendered in center of viewport via portal */}
      {typeof document !== 'undefined' && profileModalContent && createPortal(profileModalContent, document.body)}

      <style>{`
        .form-input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          line-height: 1.5;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          background: #fff;
          color: #111827;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .form-input:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14,165,233,0.2);
        }
        .dark .form-input {
          border-color: #374151;
          background: #1f2937;
          color: #f3f4f6;
        }
        .dark .form-input:focus {
          border-color: #0ea5e9;
          box-shadow: 0 0 0 2px rgba(14,165,233,0.25);
        }
      `}</style>
    </>
  );
}

/* ---------- Tiny helper components (co-located, not exported) ---------- */

function InfoRow({ label, value, icon }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 text-gray-400 dark:text-gray-500 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium leading-none mb-0.5">{label}</p>
        <p className="text-xs text-gray-800 dark:text-gray-200 break-words">{value}</p>
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ---------- Inline SVG icons (14px) ---------- */
const iconClass = 'w-3.5 h-3.5';

const calendarIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const phoneIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const locationIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const bioIcon = (
  <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);

export default UserProfile;

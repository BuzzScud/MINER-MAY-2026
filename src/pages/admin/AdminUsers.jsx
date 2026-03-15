import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" aria-hidden="false">
      <div className="bg-[#1c1c1c] border border-white/10 rounded-xl max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function AdminUsers({ embedded = false }) {
  const { token } = useAuth();
  const [data, setData] = useState({ users: [], pagination: { page: 1, perPage: 10, total: 0 } });
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addPermission, setAddPermission] = useState('basic');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPermission, setEditPermission] = useState('basic');
  const [editIsActive, setEditIsActive] = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [permUser, setPermUser] = useState(null);
  const [permIsActive, setPermIsActive] = useState(true);
  const [permPermission, setPermPermission] = useState('basic'); // 'basic' | 'admin'
  const [permSubmitting, setPermSubmitting] = useState(false);
  const [permError, setPermError] = useState('');

  const load = () => {
    if (!token) return;
    fetch(`/api/admin/users?page=${page}&per_page=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(load, [token, page]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          username: addUsername.trim(),
          password: addPassword,
          is_admin: addPermission === 'admin',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setShowAdd(false);
      setAddUsername('');
      setAddPassword('');
      setAddPermission('basic');
      load();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleEditOpen = (u) => {
    setEditUser(u);
    setEditUsername(u.username);
    setEditPassword('');
    setEditPermission(u.is_admin ? 'admin' : 'basic');
    setEditIsActive(u.is_active !== false);
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError('');
    setEditSubmitting(true);
    try {
      const body = {
        username: editUsername.trim(),
        is_admin: editPermission === 'admin',
        is_active: editIsActive,
      };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setEditUser(null);
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handlePermOpen = (u) => {
    setPermUser(u);
    setPermIsActive(u.is_active !== false);
    setPermPermission(u.is_admin ? 'admin' : 'basic');
    setPermError('');
  };

  const handlePermSubmit = async (e) => {
    e.preventDefault();
    if (!permUser) return;
    setPermError('');
    setPermSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${permUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          is_active: permIsActive,
          is_admin: permPermission === 'admin',
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setPermUser(null);
      load();
    } catch (err) {
      setPermError(err.message);
    } finally {
      setPermSubmitting(false);
    }
  };

  const handleDelete = async (id, username) => {
    if (username === 'admin') return;
    if (!window.confirm(`Delete user "${username}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const { users, pagination } = data;
  const totalPages = Math.ceil(pagination.total / pagination.perPage) || 1;

  return (
    <div className={embedded ? 'space-y-6' : 'w-full max-w-4xl mx-auto space-y-6'}>
      {!embedded && (
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">/admin/users</p>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        {!embedded && <h1 className="text-2xl font-bold text-gray-100">User Management</h1>}
        {embedded && <div className="flex-1" aria-hidden />}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!token) return;
              fetch('/api/admin/export/users?format=csv', { headers: { Authorization: `Bearer ${token}` } })
                .then((r) => {
                  if (!r.ok) throw new Error('Export failed');
                  return r.blob();
                })
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'users.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                })
                .catch((e) => setError(e.message));
            }}
            className="px-4 py-2 border border-white/20 hover:bg-white/5 text-gray-200 text-sm font-medium rounded-lg"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg"
          >
            Add User
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="rounded-lg border border-white/10 overflow-hidden bg-[#1c1c1c]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Username</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Permission</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Created</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 px-4 text-gray-200">{u.username}</td>
                <td className="py-3 px-4">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${u.is_admin ? 'bg-sky-500/20 text-sky-400' : 'bg-gray-500/20 text-gray-400'}`}>
                    {u.is_admin ? 'Admin' : 'Basic'}
                  </span>
                </td>
                <td className="py-3 px-4 text-gray-400">
                  {u.created_at ? new Date(u.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' EST' : '—'}
                </td>
                <td className="py-3 px-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleEditOpen(u)}
                    className="text-sky-400 hover:text-sky-300 text-xs border border-sky-500/50 px-2 py-1 rounded"
                  >
                    Edit
                  </button>
                  {u.username !== 'admin' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePermOpen(u)}
                        className="text-gray-400 hover:text-gray-300 text-xs border border-white/20 px-2 py-1 rounded"
                      >
                        Permissions
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id, u.username)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {u.username === 'admin' && (
                    <span className="text-xs text-gray-500 bg-white/10 px-2 py-0.5 rounded">Admin</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.total > 0 && totalPages > 1 && (
        <div className="mt-4 flex items-center gap-4 text-sm text-gray-400">
          <span>Page {pagination.page} of {totalPages}</span>
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-sky-400 hover:underline disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={pagination.page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-sky-400 hover:underline disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      <Modal open={showAdd} onClose={() => { setShowAdd(false); setAddError(''); }} title="Add User">
        {addError && <p className="text-sm text-red-400 mb-3">{addError}</p>}
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              required
              minLength={3}
              className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-gray-100"
              placeholder="Enter username"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-gray-100"
              placeholder="Enter password"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Permission</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="addPerm" value="basic" checked={addPermission === 'basic'} onChange={() => setAddPermission('basic')} />
                <span className="text-sm text-gray-300">Basic</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="addPerm" value="admin" checked={addPermission === 'admin'} onChange={() => setAddPermission('admin')} />
                <span className="text-sm text-gray-300">Admin</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={addSubmitting} className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">
              Create User
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setAddError(''); }} className="px-4 py-2 border border-white/20 text-gray-300 rounded hover:bg-white/5">
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit User: ${editUser?.username ?? ''}`}>
        {editUser && (
          <>
            {editError && <p className="text-sm text-red-400 mb-3">{editError}</p>}
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                  minLength={3}
                  className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-gray-100"
                  readOnly={editUser.username === 'admin'}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">New Password</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-black/40 border border-white/20 rounded text-gray-100"
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Permission</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 p-3 hover:bg-white/5 transition-colors">
                    <input
                      type="radio"
                      name="editPerm"
                      value="basic"
                      checked={editPermission === 'basic'}
                      onChange={() => setEditPermission('basic')}
                      disabled={editUser.username === 'admin'}
                      className="text-sky-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-200">Basic</span>
                      <p className="text-xs text-gray-500 mt-0.5">Full app access. No admin portal or API keys.</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 p-3 hover:bg-white/5 transition-colors">
                    <input
                      type="radio"
                      name="editPerm"
                      value="admin"
                      checked={editPermission === 'admin'}
                      onChange={() => setEditPermission('admin')}
                      disabled={editUser.username === 'admin'}
                      className="text-sky-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-200">Admin</span>
                      <p className="text-xs text-gray-500 mt-0.5">Full access including admin portal and API keys.</p>
                    </div>
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editIsActive}
                  onChange={(e) => setEditIsActive(e.target.checked)}
                  disabled={editUser.username === 'admin'}
                  className="rounded"
                />
                <span className="text-sm text-gray-300">Active (account enabled)</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={editSubmitting} className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">
                  Save Changes
                </button>
                <button type="button" onClick={() => setEditUser(null)} className="px-4 py-2 border border-white/20 text-gray-300 rounded hover:bg-white/5">
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>

      <Modal open={!!permUser} onClose={() => setPermUser(null)} title={`Permissions: ${permUser?.username ?? ''}`}>
        {permUser && (
          <>
            {permError && <p className="text-sm text-red-400 mb-3">{permError}</p>}
            <form onSubmit={handlePermSubmit} className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Permission level</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 p-3 hover:bg-white/5 transition-colors">
                    <input
                      type="radio"
                      name="perm"
                      value="basic"
                      checked={permPermission === 'basic'}
                      onChange={() => setPermPermission('basic')}
                      className="text-sky-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-200">Basic</span>
                      <p className="text-xs text-gray-500 mt-0.5">Access to the entire web app. No access to admin portal or API keys on the Settings page.</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-white/10 p-3 hover:bg-white/5 transition-colors">
                    <input
                      type="radio"
                      name="perm"
                      value="admin"
                      checked={permPermission === 'admin'}
                      onChange={() => setPermPermission('admin')}
                      className="text-sky-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-200">Admin</span>
                      <p className="text-xs text-gray-500 mt-0.5">Full access including admin portal and API keys on the Settings page.</p>
                    </div>
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={permIsActive} onChange={(e) => setPermIsActive(e.target.checked)} className="rounded" />
                <span className="text-sm text-gray-300">Active (account enabled)</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={permSubmitting} className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50">
                  Save Permissions
                </button>
                <button type="button" onClick={() => setPermUser(null)} className="px-4 py-2 border border-white/20 text-gray-300 rounded hover:bg-white/5">
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </Modal>
    </div>
  );
}

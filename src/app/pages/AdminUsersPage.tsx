import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Role, User } from '../../shared/types';
import { apiRequest } from '../api/client';
import { Button } from '../components/Button';
import { DataTable, type DataTableColumn } from '../components/DataTable';

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [error, setError] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (passwordTarget) {
      dialogRef.current?.showModal?.();
    } else {
      dialogRef.current?.close?.();
      setNewPassword('');
      setPasswordError(null);
    }
  }, [passwordTarget]);

  async function loadUsers() {
    try {
      const response = await apiRequest<{ users: User[] }>('/api/users');
      setUsers(response.users);
    } catch {
      setUsers([]);
    }
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const response = await apiRequest<{ user: User }>('/api/users', {
        method: 'POST',
        body: { username, password, role, defaultCurrency: 'USD' }
      });
      setUsers((current) => [...current, response.user]);
      setUsername('');
      setPassword('');
      setRole('user');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'User could not be created.');
    }
  }

  async function deleteUser(user: User) {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await apiRequest(`/api/users/${user.id}`, { method: 'DELETE' });
      setUsers((current) => current.filter((u) => u.id !== user.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'User could not be deleted.');
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordTarget) return;
    setPasswordError(null);
    try {
      await apiRequest(`/api/users/${passwordTarget.id}/password`, {
        method: 'PATCH',
        body: { password: newPassword }
      });
      setPasswordTarget(null);
    } catch (changeError) {
      setPasswordError(changeError instanceof Error ? changeError.message : 'Password could not be changed.');
    }
  }

  const columns: DataTableColumn<User>[] = [
    { key: 'username', header: 'Username', render: (user) => user.username },
    { key: 'role', header: 'Role', render: (user) => user.role === 'admin' ? 'Admin' : 'User' },
    { key: 'currency', header: 'Currency', render: (user) => user.defaultCurrency },
    { key: 'created', header: 'Created', render: (user) => user.createdAt.slice(0, 10) },
    {
      key: 'actions',
      header: '',
      render: (user) => (
        <span style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button icon={<KeyRound size={14} />} variant="secondary" onClick={() => setPasswordTarget(user)}>
            Set password
          </Button>
          <Button icon={<Trash2 size={14} />} variant="secondary" onClick={() => deleteUser(user)}>
            Delete
          </Button>
        </span>
      )
    }
  ];

  return (
    <section className="workspace-page" aria-labelledby="admin-users-heading">
      <div className="page-header">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="admin-users-heading">Admin users</h1>
        </div>
      </div>

      <form className="inline-form" onSubmit={createUser}>
        <label>
          <span>Username</span>
          <input required value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <Button icon={<UserPlus size={16} />} type="submit" variant="primary">
          Create user
        </Button>
      </form>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <DataTable columns={columns} emptyMessage={<p>No users returned.</p>} getRowKey={(user) => user.id} rows={users} />

      <dialog ref={dialogRef} onClose={() => setPasswordTarget(null)} style={{ padding: '1.5rem', borderRadius: '0.5rem', minWidth: '20rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1rem' }}>
          Set password for <strong>{passwordTarget?.username}</strong>
        </h2>
        <form onSubmit={changePassword}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '1rem' }}>
            <span>New password</span>
            <input
              autoFocus
              required
              minLength={8}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {passwordError ? <p className="form-error" role="alert">{passwordError}</p> : null}
          <span style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={() => setPasswordTarget(null)}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </span>
        </form>
      </dialog>
    </section>
  );
}

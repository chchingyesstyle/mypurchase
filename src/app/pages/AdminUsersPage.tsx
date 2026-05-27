import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
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

  useEffect(() => {
    loadUsers();
  }, []);

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

  const columns: DataTableColumn<User>[] = [
    { key: 'username', header: 'Username', render: (user) => user.username },
    { key: 'role', header: 'Role', render: (user) => user.role === 'admin' ? 'Admin' : 'User' },
    { key: 'currency', header: 'Currency', render: (user) => user.defaultCurrency },
    { key: 'created', header: 'Created', render: (user) => user.createdAt.slice(0, 10) }
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
    </section>
  );
}

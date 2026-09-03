import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Role, StaffUser } from "../lib/types";
import { Badge, Button, Card, PageHeader, inputClass } from "../components/ui";

export default function Staff() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    api
      .get<StaffUser[]>("/users")
      .then(setUsers)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Manage who can log in"
        action={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "New staff member"}</Button>}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {showForm && (
        <NewStaffForm
          onCreated={() => {
            setShowForm(false);
            load();
          }}
          onError={setError}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{u.name}</td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge status={u.role} />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  No staff yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function NewStaffForm({ onCreated, onError }: { onCreated: () => void; onError: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("STAFF");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users", { name, email, password, role });
      onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to create staff member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-5 mb-8">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
          <input
            type="password"
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="ADMIN">Admin</option>
            <option value="STAFF">Staff</option>
          </select>
        </div>
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Add staff"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

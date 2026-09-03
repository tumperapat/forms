import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../lib/types";

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Forms" },
  { to: "/staff", label: "Staff", roles: ["ADMIN"] },
];

function roleLabel(role: Role) {
  return { ADMIN: "Admin", STAFF: "Staff" }[role];
}

export default function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950">
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">Form Builder</h1>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role))).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-800">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</p>
            <p className="text-xs text-slate-500 mb-3">{roleLabel(user.role)}</p>
            <button
              onClick={logout}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="flex-1 min-w-0 p-8 overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
}

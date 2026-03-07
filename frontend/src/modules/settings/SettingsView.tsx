import { useEffect } from 'react';
import { useUserStore } from '../../store/user';
import { User as UserIcon, Shield, Mail, Calendar, Trash2, LogOut } from 'lucide-react';

export function SettingsView() {
  const { currentUser, allUsers, fetchMe, fetchAllUsers, updateRole, deleteUser } = useUserStore();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchAllUsers();
    }
  }, [currentUser, fetchAllUsers]);

  const handleLogout = async () => {
    await fetch('/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-neutral-900/30">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Settings</h1>
          <p className="text-sm text-neutral-500">Manage your profile and system preferences.</p>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-semibold transition-all border border-neutral-700"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Profile Card */}
        <section className="space-y-4 xl:col-span-1">
          <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
            <UserIcon className="w-3 h-3" />
            My Profile
          </h2>
          <div className="p-6 bg-neutral-800/20 border border-neutral-800 rounded-2xl space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-orange-500" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-neutral-200 truncate">{currentUser?.displayName || currentUser?.username}</h3>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-[10px] font-bold text-orange-500 uppercase tracking-wider">
                  {currentUser?.role}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-neutral-600" />
                <span className="text-neutral-400">{currentUser?.email || 'No email provided'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-neutral-600" />
                <span className="text-neutral-400">Joined {currentUser?.createdAt ? new Date(currentUser.createdAt * 1000).toLocaleDateString() : '—'}</span>
              </div>
            </div>
          </div>
        </section>

        {/* User Management (Admin Only) */}
        {currentUser?.role === 'admin' && (
          <section className="space-y-4 xl:col-span-2">
            <h2 className="text-[10px] text-neutral-500 uppercase font-bold tracking-[0.1em] flex items-center gap-2">
              <Shield className="w-3 h-3" />
              User Management
            </h2>
            <div className="bg-neutral-800/20 border border-neutral-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] text-neutral-500 uppercase font-bold tracking-wider">
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {allUsers.map((user) => (
                    <tr key={user.username} className="hover:bg-neutral-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-neutral-200">{user.displayName || user.username}</span>
                          <span className="text-[10px] text-neutral-600 font-mono">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select 
                          value={user.role}
                          disabled={user.username === currentUser.username}
                          onChange={(e) => updateRole(user.username, e.target.value)}
                          className="bg-neutral-900 border border-neutral-700 rounded-lg text-xs text-neutral-300 py-1 px-2 focus:ring-0 focus:border-orange-500 transition-all disabled:opacity-50"
                        >
                          <option value="admin">Admin</option>
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => deleteUser(user.username)}
                          disabled={user.username === currentUser.username}
                          className="p-1.5 text-neutral-600 hover:text-red-500 transition-colors disabled:opacity-30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

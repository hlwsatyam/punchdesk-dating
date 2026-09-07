// Punch Desk Admin — single-file React app served without a build step.
// Uses React 18 UMD + htm for tagged-template templates.
import { h, render } from "https://esm.sh/preact@10.22.0";
import { useState, useEffect, useMemo, useCallback } from "https://esm.sh/preact@10.22.0/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

const BACKEND_URL =
  (window.PUNCH_DESK_BACKEND_URL || "").replace(/\/$/, "") ||
  "https://gay-dating-engine.preview.emergentagent.com";
const KEY_STORAGE = "punch-desk-admin-key";

/* ------------------------- API helpers ------------------------- */
async function apiCall(path, options = {}) {
  const adminKey = localStorage.getItem(KEY_STORAGE) || "";
  const response = await fetch(`${BACKEND_URL}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.detail || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

/* ------------------------- Small components ------------------------- */
function Icon({ name, size = 20 }) {
  const paths = {
    dashboard: html`<path d="M3 12l9-9 9 9M5 10v10h14V10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    users: html`<circle cx="9" cy="8" r="4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M17 11a3 3 0 100-6 3 3 0 000 6zM2 21v-2a5 5 0 015-5h4a5 5 0 015 5v2M22 21v-1a4 4 0 00-3-3.87" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    flag: html`<path d="M4 22V4M4 4h11l1 3h5v10h-6l-1-3H4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    support: html`<path d="M21 12a9 9 0 10-9 9M8 12a4 4 0 118 0M14 12v3a2 2 0 002 2M8 12v3a2 2 0 01-2 2" stroke="currentColor" stroke-width="2" fill="none"/>`,
    settings: html`<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19.4 15a1.7 1.7 0 00.4 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.4 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.4-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.4H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.4l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.4 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" stroke="currentColor" stroke-width="2" fill="none"/>`,
    diamond: html`<path d="m12 3 3 6 6 1-5 5 1 7-5-3-5 3 1-7-5-5 6-1z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>`,
    audit: html`<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M9 13h6M9 17h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    logout: html`<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    search: html`<circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    chart: html`<path d="M3 3v18h18M7 14l4-4 4 4 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  return html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none">${paths[name] || null}</svg>`;
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(onClose, 3500);
    return () => clearTimeout(timeout);
  }, [toast]);
  if (!toast) return null;
  return html`
    <div class="fixed bottom-6 right-6 z-50 glass-strong px-4 py-3 rounded-2xl shadow-2xl max-w-sm flex items-center gap-3">
      <div class="w-2 h-2 rounded-full ${toast.type === "error" ? "bg-red-400" : "bg-emerald-400"}"></div>
      <div class="text-sm">${toast.message}</div>
      <button class="ml-2 text-white/40 hover:text-white" onClick=${onClose}>✕</button>
    </div>`;
}

/* ------------------------- Login gate ------------------------- */
function LoginGate({ onSubmit }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      localStorage.setItem(KEY_STORAGE, key);
      await apiCall("/admin/overview");
      onSubmit();
    } catch (err) {
      localStorage.removeItem(KEY_STORAGE);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`
    <div class="min-h-screen flex items-center justify-center px-6">
      <div class="glass-strong max-w-md w-full p-10 rounded-3xl">
        <div class="flex items-center gap-3 mb-8">
          <img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_8f5fb822-33ca-4f37-ba3f-b57a06b6bad6/artifacts/tliorn2v_ChatGPT%20Image%20Sep%207%2C%202026%2C%2001_58_08%20PM.png" class="w-12 h-12 rounded-xl object-cover" alt="Punch Desk" />
          <div>
            <div class="text-xs text-gold tracking-widest font-bold">PUNCH DESK</div>
            <div class="font-display font-extrabold text-xl">Admin</div>
          </div>
        </div>
        <h1 class="text-2xl font-display font-extrabold mb-2">Sign in with your admin key.</h1>
        <p class="text-white/60 text-sm mb-6">Set <code class="text-gold">ADMIN_API_KEY</code> in your backend .env, then paste it here. Keys are stored only in this browser.</p>
        <form onSubmit=${submit} class="space-y-4">
          <input type="password" required value=${key} onInput=${(e) => setKey(e.target.value)} class="input" placeholder="ADMIN_API_KEY value" />
          ${error ? html`<div class="text-red-400 text-sm">${error}</div>` : null}
          <button class="btn btn-primary w-full justify-center" disabled=${busy}>${busy ? "Verifying…" : "Enter admin"}</button>
        </form>
      </div>
    </div>`;
}

/* ------------------------- Layout ------------------------- */
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "users", label: "Users", icon: "users" },
  { id: "reports", label: "Reports", icon: "flag" },
  { id: "support", label: "Support", icon: "support" },
  { id: "config", label: "App configuration", icon: "settings" },
  { id: "plans", label: "Plans", icon: "diamond" },
  { id: "analytics", label: "Analytics", icon: "chart" },
  { id: "audit", label: "Audit logs", icon: "audit" },
];

function Shell({ active, onNavigate, onLogout, children }) {
  return html`
    <div class="flex min-h-screen">
      <aside class="w-64 flex-shrink-0 border-r border-white/5 p-5 hidden md:block">
        <div class="flex items-center gap-3 mb-8">
          <img src="https://customer-assets-lxgj4vgw.emergentagent.net/job_8f5fb822-33ca-4f37-ba3f-b57a06b6bad6/artifacts/tliorn2v_ChatGPT%20Image%20Sep%207%2C%202026%2C%2001_58_08%20PM.png" class="w-10 h-10 rounded-xl object-cover" alt="logo" />
          <div>
            <div class="text-xs text-gold tracking-widest font-bold">PUNCH DESK</div>
            <div class="font-display font-extrabold text-lg">Admin</div>
          </div>
        </div>
        <nav class="space-y-1">
          ${NAV.map((item) => html`
            <div class="nav-item ${item.id === active ? "is-active" : ""}" onClick=${() => onNavigate(item.id)}>
              <${Icon} name=${item.icon} size=${18} />
              <span>${item.label}</span>
            </div>`)}
        </nav>
        <div class="mt-8 pt-6 border-t border-white/5">
          <div class="nav-item" onClick=${onLogout}>
            <${Icon} name="logout" size=${18} />
            <span>Sign out</span>
          </div>
        </div>
      </aside>
      <main class="flex-1 min-w-0">
        <div class="p-6 md:p-10">${children}</div>
      </main>
    </div>`;
}

/* ------------------------- Pages ------------------------- */
function Dashboard({ notify }) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    apiCall("/admin/overview")
      .then((data) => setState({ loading: false, data, error: "" }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  }, []);
  if (state.loading) return html`<${LoadingBlock} />`;
  if (state.error) return html`<${ErrorBlock} message=${state.error} />`;
  const { metrics, config } = state.data;
  return html`
    <div>
      <${PageHeader} eyebrow="Overview" title="Welcome back."
        subtitle=${`Running mode: ${config.datingMode} · ${config.appName}`} />
      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <${MetricCard} label="Total users" value=${metrics.users} />
        <${MetricCard} label="Active · 24h" value=${metrics.activeUsers24h} />
        <${MetricCard} label="Active · 7d" value=${metrics.activeUsers7d} />
        <${MetricCard} label="Matches" value=${metrics.matches} />
        <${MetricCard} label="Messages" value=${metrics.messages} />
        <${MetricCard} label="Active subs" value=${metrics.activeSubscriptions} />
        <${MetricCard} label="Open reports" value=${metrics.openReports} accent=${metrics.openReports > 0 ? "danger" : ""} />
        <${MetricCard} label="Open tickets" value=${metrics.openTickets} accent=${metrics.openTickets > 0 ? "gold" : ""} />
      </div>
      <div class="grid md:grid-cols-3 gap-4 mt-8">
        <div class="glass p-6 md:col-span-2">
          <div class="text-sm text-white/60 font-semibold mb-2">Configuration snapshot</div>
          <div class="grid grid-cols-2 gap-3 mt-4 text-sm">
            <${ConfigRow} label="Dating mode" value=${config.datingMode} />
            <${ConfigRow} label="Radius (default)" value=${`${config.location.defaultRadius} km`} />
            <${ConfigRow} label="Radius (max)" value=${`${config.location.maxRadius} km`} />
            <${ConfigRow} label="Location required" value=${config.permissions.locationRequired ? "Yes" : "No"} />
            <${ConfigRow} label="Interests" value=${(config.interests || []).length} />
            <${ConfigRow} label="Report categories" value=${(config.reportCategories || []).length} />
          </div>
        </div>
        <div class="glass p-6">
          <div class="text-sm text-white/60 font-semibold mb-2">Feature flags</div>
          <div class="space-y-2 mt-4">
            ${Object.entries(config.features || {}).map(([key, on]) => html`
              <div class="flex items-center justify-between text-sm">
                <span class="capitalize">${key}</span>
                <span class="badge ${on ? "active" : "muted"}">${on ? "On" : "Off"}</span>
              </div>`)}
          </div>
        </div>
      </div>
    </div>`;
}

function Users({ notify }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [state, setState] = useState({ loading: true, users: [], error: "" });
  const load = useCallback(() => {
    setState({ loading: true, users: [], error: "" });
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (status) params.set("status", status);
    apiCall(`/admin/users?${params.toString()}`)
      .then((data) => setState({ loading: false, users: data.users, error: "" }))
      .catch((err) => setState({ loading: false, users: [], error: err.message }));
  }, [query, status]);
  useEffect(() => { load(); }, []);

  const setUserStatus = async (id, newStatus) => {
    try {
      await apiCall(`/admin/users/${id}/status?status=${newStatus}`, { method: "POST" });
      notify(`User ${newStatus}.`);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  return html`
    <div>
      <${PageHeader} eyebrow="Members" title="Users" subtitle="Search, moderate, and manage accounts." />
      <div class="flex flex-wrap gap-3 mt-6">
        <div class="relative flex-1 min-w-[240px]">
          <div class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"><${Icon} name="search" size=${16} /></div>
          <input class="input pl-10" placeholder="Search phone number…" value=${query} onInput=${(e) => setQuery(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && load()} />
        </div>
        <select class="input max-w-[200px]" value=${status} onChange=${(e) => { setStatus(e.target.value); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="deleted">Deleted</option>
        </select>
        <button class="btn btn-primary" onClick=${load}>Apply</button>
      </div>
      ${state.loading ? html`<${LoadingBlock} />` : state.error ? html`<${ErrorBlock} message=${state.error} />` : html`
        <div class="glass mt-6 overflow-hidden">
          <table class="table">
            <thead><tr><th>User</th><th>Phone</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>
              ${state.users.map((user) => html`
                <tr key=${user.id}>
                  <td>
                    <div class="flex items-center gap-3">
                      <div class="avatar">${(user.profile?.displayName || user.phone || "?").charAt(0).toUpperCase()}</div>
                      <div>
                        <div class="font-semibold">${user.profile?.displayName || "—"}</div>
                        <div class="text-xs text-white/40">${user.id}</div>
                      </div>
                    </div>
                  </td>
                  <td class="text-white/70">${user.phone}</td>
                  <td><span class="badge ${user.status === "active" ? "active" : user.status === "banned" || user.status === "deleted" ? "danger" : "pending"}">${user.status}</span></td>
                  <td class="text-white/50 text-xs">${new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div class="flex gap-2">
                      ${user.status !== "active" ? html`<button class="btn btn-secondary" onClick=${() => setUserStatus(user.id, "active")}>Reactivate</button>` : null}
                      ${user.status === "active" ? html`<button class="btn btn-secondary" onClick=${() => setUserStatus(user.id, "suspended")}>Suspend</button>` : null}
                      ${user.status !== "banned" ? html`<button class="btn btn-danger" onClick=${() => setUserStatus(user.id, "banned")}>Ban</button>` : null}
                    </div>
                  </td>
                </tr>`)}
              ${state.users.length === 0 ? html`<tr><td colspan="5" class="text-center py-10 text-white/40">No users match.</td></tr>` : null}
            </tbody>
          </table>
        </div>`}
    </div>`;
}

function Reports({ notify }) {
  const [status, setStatus] = useState("open");
  const [state, setState] = useState({ loading: true, reports: [], error: "" });
  const load = useCallback(() => {
    setState({ loading: true, reports: [], error: "" });
    const query = status ? `?status=${status}` : "";
    apiCall(`/admin/reports${query}`)
      .then((data) => setState({ loading: false, reports: data.reports, error: "" }))
      .catch((err) => setState({ loading: false, reports: [], error: err.message }));
  }, [status]);
  useEffect(() => { load(); }, [status]);

  const act = async (report, action) => {
    try {
      await apiCall(`/admin/reports/${report.id}/action`, {
        method: "POST",
        body: JSON.stringify({ action, note: `Handled via admin dashboard` }),
      });
      notify(`Report ${action}.`);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  return html`
    <div>
      <${PageHeader} eyebrow="Moderation" title="Reports" subtitle="Review flagged accounts and take action." />
      <div class="flex gap-2 mt-6">
        ${["open", "in_review", "dismissed", "closed", ""].map((option) => html`
          <button class="btn ${status === option ? "btn-primary" : "btn-secondary"}" onClick=${() => setStatus(option)}>
            ${option || "All"}
          </button>`)}
      </div>
      ${state.loading ? html`<${LoadingBlock} />` : state.error ? html`<${ErrorBlock} message=${state.error} />` : html`
        <div class="glass mt-6 overflow-hidden">
          <table class="table">
            <thead><tr><th>Reporter</th><th>Target</th><th>Category</th><th>Status</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>
              ${state.reports.map((report) => html`
                <tr key=${report.id}>
                  <td class="text-white/70">${report.reporterId.slice(-8)}</td>
                  <td class="text-white/70">${report.targetUserId.slice(-8)}</td>
                  <td>${report.category}</td>
                  <td><span class="badge ${report.status === "open" ? "pending" : report.status === "closed" ? "danger" : "muted"}">${report.status}</span></td>
                  <td class="text-white/60 text-xs max-w-xs truncate">${report.description || "—"}</td>
                  <td>
                    <div class="flex gap-2">
                      <button class="btn btn-secondary" onClick=${() => act(report, "dismiss")}>Dismiss</button>
                      <button class="btn btn-secondary" onClick=${() => act(report, "warn")}>Warn</button>
                      <button class="btn btn-danger" onClick=${() => act(report, "suspend")}>Suspend</button>
                      <button class="btn btn-danger" onClick=${() => act(report, "ban")}>Ban</button>
                    </div>
                  </td>
                </tr>`)}
              ${state.reports.length === 0 ? html`<tr><td colspan="6" class="text-center py-10 text-white/40">Nothing to review.</td></tr>` : null}
            </tbody>
          </table>
        </div>`}
    </div>`;
}

function Support({ notify }) {
  const [status, setStatus] = useState("");
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    apiCall(`/admin/support/tickets${status ? `?status=${status}` : ""}`)
      .then((data) => { setTickets(data.tickets); setLoading(false); })
      .catch((err) => { notify(err.message, "error"); setLoading(false); });
  }, [status]);
  useEffect(() => { load(); }, [status]);

  const openTicket = async (ticket) => {
    setSelected(ticket);
    setDetail(null);
    try {
      const data = await apiCall(`/admin/support/tickets/${ticket.id}`);
      setDetail(data);
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selected) return;
    try {
      await apiCall(`/admin/support/tickets/${selected.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      notify("Reply sent.");
      openTicket(selected);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const changeStatus = async (newStatus) => {
    if (!selected) return;
    try {
      await apiCall(`/admin/support/tickets/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      notify(`Ticket ${newStatus.replace("_", " ")}.`);
      openTicket(selected);
      load();
    } catch (err) {
      notify(err.message, "error");
    }
  };

  return html`
    <div>
      <${PageHeader} eyebrow="Care" title="Support inbox" subtitle="Answer every ticket like a human." />
      <div class="flex gap-2 mt-6">
        ${["", "open", "in_progress", "waiting_user", "resolved", "closed"].map((option) => html`
          <button class="btn ${status === option ? "btn-primary" : "btn-secondary"}" onClick=${() => setStatus(option)}>
            ${option ? option.replace("_", " ") : "All"}
          </button>`)}
      </div>
      <div class="grid md:grid-cols-3 gap-4 mt-6">
        <div class="glass p-4 md:col-span-1 max-h-[600px] overflow-y-auto">
          ${loading ? html`<${LoadingBlock} />` : tickets.length === 0 ? html`<div class="text-center py-10 text-white/40">No tickets.</div>` :
            tickets.map((ticket) => html`
              <div class="p-3 rounded-xl cursor-pointer transition ${selected?.id === ticket.id ? "bg-white/5 border border-gold/40" : "hover:bg-white/5"} mb-2"
                   onClick=${() => openTicket(ticket)}>
                <div class="flex items-center justify-between">
                  <div class="font-semibold text-sm truncate">${ticket.subject}</div>
                  <span class="badge ${ticket.status === "open" ? "pending" : "muted"}">${ticket.status}</span>
                </div>
                <div class="text-xs text-white/50 mt-1">${ticket.category} · ${new Date(ticket.createdAt).toLocaleDateString()}</div>
              </div>`)}
        </div>
        <div class="glass p-6 md:col-span-2">
          ${!selected ? html`<div class="text-center py-10 text-white/40">Select a ticket to view.</div>` : !detail ? html`<${LoadingBlock} />` : html`
            <div class="flex items-start justify-between mb-4">
              <div>
                <div class="text-xs text-gold font-bold tracking-widest">${detail.ticket.category.toUpperCase()}</div>
                <div class="font-display font-extrabold text-2xl mt-1">${detail.ticket.subject}</div>
                <div class="text-xs text-white/40 mt-1">${detail.ticket.id} · from user ${detail.ticket.userId.slice(-8)}</div>
              </div>
              <select class="input max-w-[180px]" value=${detail.ticket.status} onChange=${(e) => changeStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="waiting_user">Waiting user</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div class="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              ${detail.messages.map((message) => html`
                <div class="p-3 rounded-xl ${message.authorRole === "admin" ? "bg-gold/10 border border-gold/30 ml-8" : "bg-white/5 mr-8"}">
                  <div class="text-xs text-white/50 mb-1">${message.authorRole} · ${new Date(message.createdAt).toLocaleString()}</div>
                  <div class="text-sm whitespace-pre-wrap">${message.body}</div>
                </div>`)}
            </div>
            <div class="mt-4 pt-4 border-t border-white/5">
              <textarea class="input" rows="3" placeholder="Write a helpful reply…" value=${reply} onInput=${(e) => setReply(e.target.value)}></textarea>
              <div class="flex justify-end mt-3">
                <button class="btn btn-primary" onClick=${sendReply} disabled=${!reply.trim()}>Send reply</button>
              </div>
            </div>`}
        </div>
      </div>
    </div>`;
}

function ConfigEditor({ notify }) {
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiCall("/admin/overview").then((data) => setConfig(data.config)).catch((err) => notify(err.message, "error"));
  }, []);
  if (!config) return html`<${LoadingBlock} />`;

  const set = (path, value) => {
    setConfig((current) => {
      const next = JSON.parse(JSON.stringify(current));
      const keys = path.split(".");
      let node = next;
      for (let i = 0; i < keys.length - 1; i++) node = node[keys[i]];
      node[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await apiCall("/admin/config", {
        method: "PATCH",
        body: JSON.stringify({
          appName: config.appName,
          tagline: config.tagline,
          datingMode: config.datingMode,
          location: config.location,
          permissions: config.permissions,
          features: config.features,
          reportCategories: config.reportCategories,
          supportCategories: config.supportCategories,
          genderOptions: config.genderOptions,
          orientationOptions: config.orientationOptions,
          relationshipOptions: config.relationshipOptions,
        }),
      });
      notify("Configuration saved. Mobile app will refresh on next launch.");
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return html`
    <div>
      <${PageHeader} eyebrow="Settings" title="App configuration" subtitle="Everything mobile users see, sourced from here." />
      <div class="grid md:grid-cols-2 gap-4 mt-8">
        <div class="glass p-6 space-y-4">
          <div class="text-sm font-semibold text-white/60">Branding</div>
          <${LabelField} label="App name"><input class="input" value=${config.appName || ""} onInput=${(e) => set("appName", e.target.value)} /></${LabelField}>
          <${LabelField} label="Tagline"><input class="input" value=${config.tagline || ""} onInput=${(e) => set("tagline", e.target.value)} /></${LabelField}>
          <${LabelField} label="Dating mode"><input class="input" value=${config.datingMode || ""} onInput=${(e) => set("datingMode", e.target.value)} /></${LabelField}>
        </div>
        <div class="glass p-6 space-y-4">
          <div class="text-sm font-semibold text-white/60">Discovery radius (km)</div>
          <div class="grid grid-cols-3 gap-3">
            <${LabelField} label="Min"><input class="input" type="number" value=${config.location.minRadius} onInput=${(e) => set("location.minRadius", parseInt(e.target.value || "0", 10))} /></${LabelField}>
            <${LabelField} label="Default"><input class="input" type="number" value=${config.location.defaultRadius} onInput=${(e) => set("location.defaultRadius", parseInt(e.target.value || "0", 10))} /></${LabelField}>
            <${LabelField} label="Max"><input class="input" type="number" value=${config.location.maxRadius} onInput=${(e) => set("location.maxRadius", parseInt(e.target.value || "0", 10))} /></${LabelField}>
          </div>
          <div class="text-sm font-semibold text-white/60 mt-4">Permissions</div>
          <div class="flex items-center gap-4">
            <label class="flex items-center gap-2"><input type="checkbox" checked=${config.permissions.locationRequired} onChange=${(e) => set("permissions.locationRequired", e.target.checked)} /> <span class="text-sm">Location required</span></label>
            <label class="flex items-center gap-2"><input type="checkbox" checked=${config.permissions.notificationsRequired} onChange=${(e) => set("permissions.notificationsRequired", e.target.checked)} /> <span class="text-sm">Notifications required</span></label>
          </div>
        </div>
        <div class="glass p-6 space-y-4">
          <div class="text-sm font-semibold text-white/60">Feature flags</div>
          <div class="grid grid-cols-2 gap-3">
            ${Object.entries(config.features || {}).map(([key, on]) => html`
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" checked=${on} onChange=${(e) => set(`features.${key}`, e.target.checked)} />
                <span class="capitalize">${key}</span>
              </label>`)}
          </div>
        </div>
        <div class="glass p-6 space-y-4">
          <div class="text-sm font-semibold text-white/60">Options (comma separated)</div>
          <${LabelField} label="Gender options"><input class="input" value=${(config.genderOptions || []).join(", ")} onInput=${(e) => set("genderOptions", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></${LabelField}>
          <${LabelField} label="Orientation options"><input class="input" value=${(config.orientationOptions || []).join(", ")} onInput=${(e) => set("orientationOptions", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></${LabelField}>
          <${LabelField} label="Relationship options"><input class="input" value=${(config.relationshipOptions || []).join(", ")} onInput=${(e) => set("relationshipOptions", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></${LabelField}>
          <${LabelField} label="Report categories"><input class="input" value=${(config.reportCategories || []).join(", ")} onInput=${(e) => set("reportCategories", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></${LabelField}>
          <${LabelField} label="Support categories"><input class="input" value=${(config.supportCategories || []).join(", ")} onInput=${(e) => set("supportCategories", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></${LabelField}>
        </div>
      </div>
      <div class="flex justify-end mt-6">
        <button class="btn btn-primary" onClick=${save} disabled=${busy}>${busy ? "Saving…" : "Save configuration"}</button>
      </div>
    </div>`;
}

function Plans({ notify }) {
  const [plans, setPlans] = useState([]);
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/subscriptions/plans`).then((r) => r.json()).then((data) => setPlans(data.plans || []));
  }, []);
  return html`
    <div>
      <${PageHeader} eyebrow="Monetization" title="Subscription plans" subtitle="What users see when they upgrade." />
      <div class="grid md:grid-cols-2 gap-4 mt-8">
        ${plans.map((plan) => html`
          <div class="glass p-6" key=${plan.id}>
            <div class="text-xs text-gold font-bold tracking-widest">${plan.id.toUpperCase()}</div>
            <div class="font-display font-extrabold text-3xl mt-2">${plan.name}</div>
            <div class="text-white/70 text-lg mt-2">₹${plan.price} <span class="text-white/40 text-sm">/ ${plan.period}</span></div>
            <div class="text-white/60 text-sm mt-4">${plan.description}</div>
            <ul class="mt-4 space-y-2 text-sm text-white/70">
              ${(plan.features || []).map((feature) => html`<li>✓ ${feature}</li>`)}
            </ul>
          </div>`)}
      </div>
      <div class="glass mt-6 p-6 text-sm text-white/60">
        Plans are seeded on startup and can be extended in <code class="text-gold">app/services/config_service.py::seed_demo_data</code>. Razorpay integration is server-side signature verified.
      </div>
    </div>`;
}

function Analytics({ notify }) {
  const [range, setRange] = useState(30);
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    apiCall(`/admin/analytics?range_days=${range}`).then(setData).catch((err) => notify(err.message, "error"));
  }, [range]);
  return html`
    <div>
      <${PageHeader} eyebrow="Insight" title="Analytics" subtitle="Last ${range} days." />
      <div class="flex gap-2 mt-6">
        ${[7, 30, 90].map((option) => html`
          <button class="btn ${range === option ? "btn-primary" : "btn-secondary"}" onClick=${() => setRange(option)}>Last ${option} days</button>`)}
      </div>
      ${!data ? html`<${LoadingBlock} />` : html`
        <div class="grid md:grid-cols-2 gap-4 mt-6">
          <${ChartCard} title="New users per day" rows=${data.usersByDay} formatter=${(row) => row.count} />
          <${ChartCard} title="Matches per day" rows=${data.matchesByDay} formatter=${(row) => row.count} />
          <${ChartCard} title="Revenue (₹) per day" rows=${data.revenueByDay} formatter=${(row) => Math.round(row.amount)} />
        </div>`}
    </div>`;
}

function AuditLogs({ notify }) {
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    apiCall("/admin/audit-logs?limit=100").then((data) => setLogs(data.logs)).catch((err) => notify(err.message, "error"));
  }, []);
  return html`
    <div>
      <${PageHeader} eyebrow="History" title="Audit logs" subtitle="Every admin action, timestamped." />
      ${!logs ? html`<${LoadingBlock} />` : html`
        <div class="glass mt-8 overflow-hidden">
          <table class="table">
            <thead><tr><th>Action</th><th>Target</th><th>Note</th><th>When</th></tr></thead>
            <tbody>
              ${logs.map((log) => html`
                <tr key=${log.id}>
                  <td class="font-mono text-xs">${log.action}</td>
                  <td class="text-white/70">${log.target || "—"}</td>
                  <td class="text-white/50">${log.note || log.value || "—"}</td>
                  <td class="text-white/40 text-xs">${new Date(log.createdAt).toLocaleString()}</td>
                </tr>`)}
              ${logs.length === 0 ? html`<tr><td colspan="4" class="text-center py-10 text-white/40">No admin activity yet.</td></tr>` : null}
            </tbody>
          </table>
        </div>`}
    </div>`;
}

/* ------------------------- Reusable UI ------------------------- */
function PageHeader({ eyebrow, title, subtitle }) {
  return html`
    <div>
      <div class="text-xs text-gold font-bold tracking-widest">${eyebrow?.toUpperCase()}</div>
      <h1 class="font-display font-extrabold text-3xl md:text-4xl mt-1">${title}</h1>
      ${subtitle ? html`<div class="text-white/60 mt-2">${subtitle}</div>` : null}
    </div>`;
}

function MetricCard({ label, value, accent }) {
  const trendColor = accent === "danger" ? "text-red-400" : accent === "gold" ? "text-gold" : "";
  return html`
    <div class="metric">
      <div class="label">${label}</div>
      <div class="value ${trendColor}">${value ?? 0}</div>
    </div>`;
}

function ConfigRow({ label, value }) {
  return html`
    <div class="flex flex-col rounded-xl bg-white/5 p-3 border border-white/5">
      <span class="text-xs text-white/50">${label}</span>
      <span class="text-white font-semibold mt-1">${value}</span>
    </div>`;
}

function LabelField({ label, children }) {
  return html`<label class="block"><div class="text-xs text-white/60 font-semibold mb-1">${label}</div>${children}</label>`;
}

function LoadingBlock() {
  return html`<div class="flex items-center justify-center py-16"><div class="spinner"></div></div>`;
}

function ErrorBlock({ message }) {
  return html`<div class="glass p-6 mt-6 text-red-400">${message}</div>`;
}

function ChartCard({ title, rows, formatter }) {
  const values = rows.map(formatter);
  const max = Math.max(1, ...values);
  return html`
    <div class="glass p-6">
      <div class="text-sm text-white/60 font-semibold mb-2">${title}</div>
      <div class="bar-chart">
        ${rows.length === 0 ? html`<div class="text-white/40 text-sm">No data.</div>` : rows.map((row) => {
          const value = formatter(row);
          const height = Math.max(4, (value / max) * 100);
          return html`<div class="bar" style="height: ${height}%" title="${row.date}: ${value}"></div>`;
        })}
      </div>
      <div class="flex justify-between text-xs text-white/40 mt-2">
        <span>${rows[0]?.date || ""}</span>
        <span>${rows[rows.length - 1]?.date || ""}</span>
      </div>
    </div>`;
}

/* ------------------------- Root ------------------------- */
function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem(KEY_STORAGE));
  const [active, setActive] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, type = "success") => setToast({ message, type }), []);

  const logout = () => {
    localStorage.removeItem(KEY_STORAGE);
    setAuthed(false);
  };

  if (!authed) return html`<${LoginGate} onSubmit=${() => setAuthed(true)} />`;

  const props = { notify };
  const view = {
    dashboard: html`<${Dashboard} ...${props} />`,
    users: html`<${Users} ...${props} />`,
    reports: html`<${Reports} ...${props} />`,
    support: html`<${Support} ...${props} />`,
    config: html`<${ConfigEditor} ...${props} />`,
    plans: html`<${Plans} ...${props} />`,
    analytics: html`<${Analytics} ...${props} />`,
    audit: html`<${AuditLogs} ...${props} />`,
  }[active];

  return html`
    <${Shell} active=${active} onNavigate=${setActive} onLogout=${logout}>${view}</${Shell}>
    <${Toast} toast=${toast} onClose=${() => setToast(null)} />`;
}

render(html`<${App} />`, document.getElementById("root"));

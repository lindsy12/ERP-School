import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Bell, CreditCard, DollarSign, FileText, LayoutDashboard,
  Menu, Receipt, RefreshCw, Search, Settings, Wallet, X, Users,
  TrendingDown, TrendingUp, Plus, Smartphone, Megaphone
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { financeApi, session } from "./api";

const ROLE_LABELS = { SUPER_ADMIN: "Super Admin", ADMIN: "Admin", STAFF: "Staff", STUDENT: "Student" };

function useMe() {
  const [me, setMe] = useState(null);
  useEffect(() => {
    session().then(({ api }) => api("/api/v1/auth/me")).then(setMe).catch(() => setMe(null));
  }, []);
  return me;
}

async function signOut() {
  const { signOut: end } = await session();
  await end();
  window.location.assign("/auth/");
}

const money = (value) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value || 0)) + " FCFA";

const today = new Date().toISOString().slice(0, 10);

function App() {
  const [page, setPage] = useState("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const me = useMe();
  const initials = (me?.email || "?").slice(0, 2).toUpperCase();

  const nav = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["invoices", "Invoices", FileText],
    ["payments", "Payments", CreditCard],
    ["expenses", "Expenses", Receipt],
    ["campaigns", "Campaigns", Megaphone],
    ["reports", "Reports", BarChart3],
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>ERP School</strong>
            <span>Finance</span>
          </div>
          <button className="icon-btn mobile-close" onClick={() => setMobileOpen(false)}><X size={20}/></button>
        </div>

        <div className="section-label">FINANCE MODULE</div>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={`nav-item ${page === key ? "active" : ""}`}
              onClick={() => { setPage(key); setMobileOpen(false); }}
            >
              <Icon size={19}/><span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <a className="nav-item" href="/auth/#/home"><LayoutDashboard size={19}/><span>ERP home</span></a>
          <button className={`nav-item ${page === "notifications" ? "active" : ""}`} onClick={() => { setPage("notifications"); setMobileOpen(false); }}><Bell size={19}/><span>Finance activity</span></button>
          <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => { setPage("settings"); setMobileOpen(false); }}><Settings size={19}/><span>Settings</span></button>
          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div><strong>{me?.email || "Signed in"}</strong><span>{ROLE_LABELS[me?.role] || me?.role || ""}</span></div>
          </div>
          <button className="nav-item" onClick={signOut}><X size={19}/><span>Sign out</span></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMobileOpen(true)}><Menu size={22}/></button>
          <div className="crumbs"><span>ERP School</span><b>/</b><strong>Finance</strong></div>
          <div className="top-actions">
            <button className="icon-btn" title="Refresh" onClick={() => setRefresh(v => v + 1)}><RefreshCw size={18}/></button>
            <div className="top-avatar" title={me?.email}>{initials}</div>
          </div>
        </header>

        <div className="content">
          {page === "dashboard" && <Dashboard key={refresh} go={setPage} />}
          {page === "invoices" && <Invoices key={refresh} />}
          {page === "payments" && <Payments key={refresh} />}
          {page === "expenses" && <Expenses key={refresh} />}
          {page === "campaigns" && <Campaigns key={refresh} />}
          {page === "reports" && <Reports key={refresh} />}
          {page === "notifications" && <Notifications key={refresh} />}
          {page === "settings" && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}

function PageTitle({ title, subtitle, action }) {
  return (
    <div className="page-title">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      {action}
    </div>
  );
}

function Dashboard({ go }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([financeApi.invoices(), financeApi.payments(), financeApi.expenses()])
      .then(([i, p, e]) => { setInvoices(i || []); setPayments(p || []); setExpenses(e || []); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const billed = invoices.reduce((s, x) => s + Number(x.amount || 0), 0);
    const paid = payments.reduce((s, x) => s + Number(x.amount || 0), 0);
    const spent = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
    return { billed, paid, spent, outstanding: Math.max(0, billed - paid) };
  }, [invoices, payments, expenses]);

  const chart = [
    { name: "Billed", amount: stats.billed },
    { name: "Paid", amount: stats.paid },
    { name: "Expenses", amount: stats.spent },
    { name: "Balance", amount: stats.outstanding }
  ];

  return <>
    <PageTitle title="Finance Dashboard" subtitle="Overview of school financial activity."
      action={<button className="primary" onClick={() => go("invoices")}><Plus size={18}/> New Invoice</button>} />
    {error && <div className="alert error">{error}</div>}
    <div className="stats-grid">
      <Stat icon={DollarSign} label="Total Billed" value={money(stats.billed)} tone="blue"/>
      <Stat icon={TrendingUp} label="Payments Received" value={money(stats.paid)} tone="green"/>
      <Stat icon={TrendingDown} label="Expenses" value={money(stats.spent)} tone="orange"/>
      <Stat icon={Wallet} label="Outstanding" value={money(stats.outstanding)} tone="purple"/>
    </div>
    <div className="dashboard-grid">
      <section className="card chart-card">
        <div className="card-head"><div><h2>Financial Overview</h2><p>Current data from the Finance API</p></div></div>
        {loading ? <Loading/> : <div className="chart"><ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart}><XAxis dataKey="name"/><YAxis tickFormatter={(v) => `${Math.round(v/1000)}k`}/><Tooltip formatter={(v) => money(v)}/><Bar dataKey="amount" radius={[8,8,0,0]}/></BarChart>
        </ResponsiveContainer></div>}
      </section>
      <section className="card">
        <div className="card-head"><div><h2>Recent Invoices</h2><p>Latest billing records</p></div><button className="link-btn" onClick={() => go("invoices")}>View all</button></div>
        {loading ? <Loading/> : invoices.slice(0,5).map(i => <div className="list-row" key={i.id}>
          <div className="row-icon"><FileText size={17}/></div><div className="row-main"><strong>Invoice #{i.invoice_number || i.id}</strong><span>Student {i.student_id}</span></div><div className="row-value">{money(i.amount)}</div>
        </div>)}
        {!loading && invoices.length === 0 && <Empty text="No invoices found."/>}
      </section>
    </div>
  </>;
}

function Stat({ icon: Icon, label, value, tone }) {
  return <div className={`stat-card ${tone}`}><div className="stat-icon"><Icon size={20}/></div><span>{label}</span><strong>{value}</strong></div>;
}

function Invoices() {
  const [data, setData] = useState([]);
  const [status, setStatus] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const load = () => financeApi.invoices(status ? `?status=${encodeURIComponent(status)}` : "").then(setData).catch(e => setError(e.message));
  useEffect(() => { load(); }, [status]);

  return <>
    <PageTitle title="Invoices" subtitle="Create and manage student invoices."
      action={<button className="primary" onClick={() => setShow(true)}><Plus size={18}/> Create Invoice</button>} />
    {error && <div className="alert error">{error}</div>}
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Filter by student ID..." onChange={e => {
      const v = e.target.value.trim(); if (!v) load(); else financeApi.invoices(`?studentId=${encodeURIComponent(v)}`).then(setData).catch(x=>setError(x.message));
    }}/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option>PENDING</option><option>PARTIALLY_PAID</option><option>PAID</option></select></div>
    <div className="card table-card"><Table headers={["Invoice","Student","Academic Year","Amount","Due Date","Status"]} rows={data.map(i => [
      `#${i.invoice_number || i.id}`, i.student_id, i.academic_year, money(i.amount), i.due_date, <Status value={i.status}/>
    ])}/></div>
    {show && <Modal title="Create Invoice" close={() => setShow(false)}><InvoiceForm onDone={() => {setShow(false); load();}}/></Modal>}
  </>;
}

function InvoiceForm({ onDone }) {
  const [form, setForm] = useState({studentId:"", academicYear:"2026/2027", amount:"", dueDate:today});
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async e => { e.preventDefault(); setBusy(true); setError(""); try { await financeApi.createInvoice(form); onDone(); } catch(x){setError(x.message)} finally{setBusy(false)} };
  return <form onSubmit={submit} className="form-grid">
    {error && <div className="alert error full">{error}</div>}
    <Field label="Student ID"><input required value={form.studentId} onChange={e=>setForm({...form,studentId:e.target.value})}/></Field>
    <Field label="Academic Year"><input required value={form.academicYear} onChange={e=>setForm({...form,academicYear:e.target.value})}/></Field>
    <Field label="Amount (FCFA)"><input required type="number" min="1" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></Field>
    <Field label="Due Date"><input required type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})}/></Field>
    <div className="modal-actions full"><button type="button" className="secondary" onClick={onDone}>Cancel</button><button className="primary" disabled={busy}>{busy?"Creating...":"Create Invoice"}</button></div>
  </form>;
}

function Payments() {
  const [data,setData]=useState([]); const [show,setShow]=useState(false); const [momo,setMomo]=useState(false); const [error,setError]=useState("");
  const load=()=>financeApi.payments().then(setData).catch(e=>setError(e.message)); useEffect(()=>{load()},[]);
  return <>
    <PageTitle title="Payments" subtitle="Track received payments and mobile-money transactions."
      action={<div className="button-row"><button className="secondary" onClick={()=>setMomo(true)}><Smartphone size={17}/> Mock MoMo</button><button className="primary" onClick={()=>setShow(true)}><Plus size={18}/> Record Payment</button></div>} />
    {error&&<div className="alert error">{error}</div>}
    <div className="card table-card"><Table headers={["Payment","Invoice","Amount","Method","Transaction Ref","Date"]} rows={data.map(p=>[
      `#${p.id}`, p.invoice_id, money(p.amount), <span className="pill">{p.method}</span>, p.transaction_ref || "—", p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"
    ])}/></div>
    {show&&<Modal title="Record Payment" close={()=>setShow(false)}><PaymentForm onDone={()=>{setShow(false);load()}}/></Modal>}
    {momo&&<Modal title="Mock Mobile Money" close={()=>setMomo(false)}><MomoForm onDone={()=>{setMomo(false);load()}}/></Modal>}
  </>;
}

function PaymentForm({onDone}) {
  const [f,setF]=useState({invoiceId:"",amount:"",method:"BANK_TRANSFER",transactionRef:""}); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const submit=async e=>{e.preventDefault();setBusy(true);try{await financeApi.createPayment(f);onDone()}catch(x){setError(x.message)}finally{setBusy(false)}};
  return <form onSubmit={submit} className="form-grid">{error&&<div className="alert error full">{error}</div>}
    <Field label="Invoice ID"><input required type="number" value={f.invoiceId} onChange={e=>setF({...f,invoiceId:e.target.value})}/></Field>
    <Field label="Amount (FCFA)"><input required type="number" min="1" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></Field>
    <Field label="Method"><select value={f.method} onChange={e=>setF({...f,method:e.target.value})}><option>CASH</option><option>BANK_TRANSFER</option><option>MOBILE_MONEY</option></select></Field>
    <Field label="Transaction Reference"><input value={f.transactionRef} onChange={e=>setF({...f,transactionRef:e.target.value})}/></Field>
    <div className="modal-actions full"><button type="button" className="secondary" onClick={onDone}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving...":"Record Payment"}</button></div>
  </form>
}

function MomoForm({onDone}) {
  const [f,setF]=useState({invoiceId:"",amount:"",phoneNumber:""}); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const submit=async e=>{e.preventDefault();setBusy(true);try{await financeApi.momo(f);onDone()}catch(x){setError(x.message)}finally{setBusy(false)}};
  return <form onSubmit={submit} className="form-grid">{error&&<div className="alert error full">{error}</div>}
    <Field label="Invoice ID"><input required type="number" value={f.invoiceId} onChange={e=>setF({...f,invoiceId:e.target.value})}/></Field>
    <Field label="Amount (FCFA)"><input required type="number" min="1" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></Field>
    <Field label="Phone Number"><input required placeholder="6XXXXXXXX" value={f.phoneNumber} onChange={e=>setF({...f,phoneNumber:e.target.value})}/></Field>
    <div className="modal-actions full"><button type="button" className="secondary" onClick={onDone}>Cancel</button><button className="primary" disabled={busy}>{busy?"Processing...":"Process Mock MoMo"}</button></div>
  </form>
}

function Expenses() {
  const [data,setData]=useState([]);const[show,setShow]=useState(false);const[error,setError]=useState("");
  const load=()=>financeApi.expenses().then(setData).catch(e=>setError(e.message));useEffect(()=>{load()},[]);
  return <><PageTitle title="Expenses" subtitle="Monitor school operating expenses." action={<button className="primary" onClick={()=>setShow(true)}><Plus size={18}/> Add Expense</button>}/>{error&&<div className="alert error">{error}</div>}
    <div className="card table-card"><Table headers={["Description","Category","Amount","Expense Date"]} rows={data.map(x=>[x.description,x.category,money(x.amount),x.expense_date])}/></div>
    {show&&<Modal title="Add Expense" close={()=>setShow(false)}><ExpenseForm onDone={()=>{setShow(false);load()}}/></Modal>}</>
}

function ExpenseForm({onDone}) {
  const[f,setF]=useState({description:"",category:"OTHER",amount:"",expenseDate:today});const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  const submit=async e=>{e.preventDefault();setBusy(true);try{await financeApi.createExpense(f);onDone()}catch(x){setError(x.message)}finally{setBusy(false)}};
  return <form onSubmit={submit} className="form-grid">{error&&<div className="alert error full">{error}</div>}
    <Field label="Description"><input required value={f.description} onChange={e=>setF({...f,description:e.target.value})}/></Field><Field label="Category"><select value={f.category} onChange={e=>setF({...f,category:e.target.value})}><option>OTHER</option><option>UTILITIES</option><option>SALARIES</option><option>SUPPLIES</option><option>MAINTENANCE</option></select></Field><Field label="Amount (FCFA)"><input required type="number" min="1" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})}/></Field><Field label="Expense Date"><input required type="date" value={f.expenseDate} onChange={e=>setF({...f,expenseDate:e.target.value})}/></Field>
    <div className="modal-actions full"><button type="button" className="secondary" onClick={onDone}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving...":"Save Expense"}</button></div></form>
}

function Campaigns() {
  const[data,setData]=useState([]);const[show,setShow]=useState(false);const[error,setError]=useState("");
  const load=()=>financeApi.campaigns().then(setData).catch(e=>setError(e.message));useEffect(()=>{load()},[]);
  return <><PageTitle title="Campaigns" subtitle="Track campaign budgets, leads, conversions and revenue." action={<button className="primary" onClick={()=>setShow(true)}><Plus size={18}/> New Campaign</button>}/>{error&&<div className="alert error">{error}</div>}
    <div className="card table-card"><Table headers={["Campaign","Budget","Leads","Conversions","Revenue","Dates"]} rows={data.map(x=>[x.name,money(x.budget),x.leads,x.conversions,money(x.revenue),`${x.start_date} → ${x.end_date}`])}/></div>
    {show&&<Modal title="Create Campaign" close={()=>setShow(false)}><CampaignForm onDone={()=>{setShow(false);load()}}/></Modal>}</>
}
function CampaignForm({onDone}) {
  const[f,setF]=useState({name:"",budget:"",startDate:today,endDate:today,leads:"0",conversions:"0",revenue:"0"});const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  const submit=async e=>{e.preventDefault();setBusy(true);try{await financeApi.createCampaign(f);onDone()}catch(x){setError(x.message)}finally{setBusy(false)}};
  return <form onSubmit={submit} className="form-grid">{error&&<div className="alert error full">{error}</div>}
    <Field label="Campaign Name"><input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></Field><Field label="Budget (FCFA)"><input required type="number" min="1" value={f.budget} onChange={e=>setF({...f,budget:e.target.value})}/></Field><Field label="Start Date"><input required type="date" value={f.startDate} onChange={e=>setF({...f,startDate:e.target.value})}/></Field><Field label="End Date"><input required type="date" value={f.endDate} onChange={e=>setF({...f,endDate:e.target.value})}/></Field>
    <Field label="Leads"><input type="number" min="0" value={f.leads} onChange={e=>setF({...f,leads:e.target.value})}/></Field><Field label="Conversions"><input type="number" min="0" value={f.conversions} onChange={e=>setF({...f,conversions:e.target.value})}/></Field><Field label="Revenue (FCFA)"><input type="number" min="0" value={f.revenue} onChange={e=>setF({...f,revenue:e.target.value})}/></Field>
    <div className="modal-actions full"><button type="button" className="secondary" onClick={onDone}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving...":"Create Campaign"}</button></div></form>
}

function Reports() {
  const now=new Date();const[month,setMonth]=useState(now.getMonth()+1);const[year,setYear]=useState(now.getFullYear());const[data,setData]=useState(null);const[error,setError]=useState("");
  const load=()=>financeApi.report(month,year).then(setData).catch(e=>setError(e.message));useEffect(()=>{load()},[month,year]);
  return <><PageTitle title="Monthly Reports" subtitle="Financial summary generated by the Finance service." action={<button className="secondary" onClick={load}><RefreshCw size={17}/> Refresh</button>}/>
    <div className="toolbar"><select value={month} onChange={e=>setMonth(Number(e.target.value))}>{["January","February","March","April","May","June","July","August","September","October","November","December"].map((name,i)=><option key={i} value={i+1}>{name}</option>)}</select><input className="year-input" type="number" value={year} onChange={e=>setYear(e.target.value)}/></div>
    {error&&<div className="alert error">{error}</div>}{data?<div className="report-grid">{Object.entries(data).map(([k,v])=><div className="card report-card" key={k}><span>{k.replaceAll("_"," ")}</span><strong>{typeof v==="number" ? money(v) : String(v)}</strong></div>)}</div>:<Loading/>}
  </>;
}

function Notifications() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([financeApi.invoices(), financeApi.payments(), financeApi.expenses()])
      .then(([invoices, payments, expenses]) => {
        const next = [];
        (invoices || []).slice(0, 3).forEach(i => next.push({ title: "Invoice created", text: `Invoice #${i.invoice_number || i.id} for ${money(i.amount)}`, type: "invoice" }));
        (payments || []).slice(0, 3).forEach(p => next.push({ title: "Payment received", text: `${money(p.amount)} received for invoice #${p.invoice_id}`, type: "payment" }));
        (expenses || []).slice(0, 2).forEach(x => next.push({ title: "Expense recorded", text: `${x.description} — ${money(x.amount)}`, type: "expense" }));
        setItems(next.slice(0, 8));
      }).catch(e => setError(e.message));
  }, []);
  return <>
    <PageTitle title="Notifications" subtitle="Recent Finance activity and important events." />
    {error && <div className="alert error">{error}</div>}
    <div className="card notification-list">
      {items.length ? items.map((n, i) => <div className="notification-row" key={i}>
        <div className={`notification-icon ${n.type}`}><Bell size={17}/></div>
        <div><strong>{n.title}</strong><p>{n.text}</p></div>
      </div>) : <Empty text="No recent finance notifications." />}
    </div>
  </>;
}

function SettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [compact, setCompact] = useState(false);
  return <>
    <PageTitle title="Settings" subtitle="Configure your Finance dashboard preferences." />
    <div className="settings-grid">
      <section className="card settings-card"><h2>Finance preferences</h2><p>These settings control this Finance dashboard.</p>
        <SettingRow title="Payment notifications" text="Show notifications when payments are recorded." checked={emailAlerts} setChecked={setEmailAlerts}/>
        <SettingRow title="Auto refresh" text="Refresh Finance data when you revisit a module." checked={autoRefresh} setChecked={setAutoRefresh}/>
        <SettingRow title="Compact tables" text="Use a denser table layout." checked={compact} setChecked={setCompact}/>
      </section>
      <section className="card settings-card"><h2>System connection</h2><p>Finance API is accessed through the ERP gateway.</p><div className="connection-row"><span>Finance API</span><span className="status paid">Connected when backend is running</span></div><div className="connection-row"><span>Currency</span><strong>FCFA</strong></div></section>
    </div>
  </>;
}

function SettingRow({title,text,checked,setChecked}) {
  return <div className="setting-row"><div><strong>{title}</strong><p>{text}</p></div><button type="button" className={`switch ${checked ? "on" : ""}`} onClick={() => setChecked(!checked)} aria-label={title}><span /></button></div>;
}

function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
function Status({value}){return <span className={`status ${String(value||"").toLowerCase()}`}>{value||"—"}</span>}
function Loading(){return <div className="loading">Loading finance data…</div>}
function Empty({text}){return <div className="empty">{text}</div>}
function Table({headers,rows}){return rows.length?<div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody></table></div>:<Empty text="No records found."/>}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={19}/></button></div>{children}</div></div>}

export default App;
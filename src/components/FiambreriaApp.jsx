'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

// ============ HELPERS ============
const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n || 0);
const fDate = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fDateTime = (d) => new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const UNITS = [
  { value: 'kg', label: 'Kilogramo' },
  { value: 'g', label: 'Gramo' },
  { value: 'und', label: 'Unidad' },
  { value: 'lt', label: 'Litro' },
];
const unitLabel = (v) => UNITS.find(u => u.value === v)?.label || v;

const EXP_CATS = ['Alquiler', 'Expensas', 'Luz', 'Gas', 'Agua', 'Internet', 'Teléfono', 'Sueldos', 'Impuestos', 'Seguros', 'Mantenimiento', 'Limpieza', 'Transporte', 'Publicidad', 'Otros'];
const EXP_FREQ = [{ value: 'unico', label: 'Único' }, { value: 'mensual', label: 'Mensual' }, { value: 'semanal', label: 'Semanal' }];
const EXP_TYPE = [{ value: 'fijo', label: 'Fijo' }, { value: 'variable', label: 'Variable' }];

// ============ ICONS ============
const I = {
  dashboard: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  box: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></svg>,
  cart: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>,
  bag: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  chart: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
  plus: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>,
  trash: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  edit: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  search: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  x: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  menu: <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M3 12h18M3 6h18M3 18h18"/></svg>,
  eye: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  warn: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
  arrow: <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>,
  check: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>,
  wallet: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4h4v-4z"/></svg>,
  brain: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a5 5 0 015 5c0 .8-.2 1.5-.5 2.2A5 5 0 0120 14a5 5 0 01-3 4.6V22h-2v-2h-6v2H7v-3.4A5 5 0 014 14a5 5 0 013.5-4.8A5 5 0 017 7a5 5 0 015-5z"/><path d="M12 2v8"/><path d="M8 8h8"/></svg>,
};

// ============ DATABASE OPERATIONS ============
const db = {
  // Categories
  async getCategories() {
    const { data } = await supabase.from('categories').select('*').order('name');
    return data || [];
  },

  // Articles
  async getArticles() {
    const { data } = await supabase.from('v_articles').select('*');
    return data || [];
  },
  async insertArticle(article) {
    const { data, error } = await supabase.from('articles').insert(article).select().single();
    if (error) throw error;
    return data;
  },
  async updateArticle(id, updates) {
    const { data, error } = await supabase.from('articles').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteArticle(id) {
    const { error } = await supabase.from('articles').update({ active: false }).eq('id', id);
    if (error) throw error;
  },

  // Purchases
  async getPurchases() {
    const { data } = await supabase.from('purchase_invoices').select('*, purchase_invoice_items(*)').order('date', { ascending: false });
    return data || [];
  },
  async insertPurchase(invoice, items) {
    const { data: inv, error: invErr } = await supabase.from('purchase_invoices').insert(invoice).select().single();
    if (invErr) throw invErr;
    const itemsWithId = items.map(i => ({ ...i, purchase_invoice_id: inv.id }));
    const { error: itemErr } = await supabase.from('purchase_invoice_items').insert(itemsWithId);
    if (itemErr) throw itemErr;
    return inv;
  },
  async deletePurchase(id) {
    const { error } = await supabase.from('purchase_invoices').delete().eq('id', id);
    if (error) throw error;
  },

  // Sales
  async getSales() {
    const { data } = await supabase.from('sale_tickets').select('*, sale_ticket_items(*)').order('date', { ascending: false });
    return data || [];
  },
  async insertSale(ticket, items) {
    const { data: sale, error: saleErr } = await supabase.from('sale_tickets').insert(ticket).select().single();
    if (saleErr) throw saleErr;
    const itemsWithId = items.map(i => ({ ...i, sale_ticket_id: sale.id }));
    const { error: itemErr } = await supabase.from('sale_ticket_items').insert(itemsWithId);
    if (itemErr) throw itemErr;
    return sale;
  },
  async deleteSale(id) {
    const { error } = await supabase.from('sale_tickets').delete().eq('id', id);
    if (error) throw error;
  },

  // Reports
  async getSalesByArticle() {
    const { data } = await supabase.from('v_sales_by_article').select('*');
    return data || [];
  },
  async getPurchasesByArticle() {
    const { data } = await supabase.from('v_purchases_by_article').select('*');
    return data || [];
  },
  async getLowStock() {
    const { data } = await supabase.from('v_low_stock').select('*');
    return data || [];
  },

  // Expenses
  async getExpenses() {
    const { data } = await supabase.from('expenses').select('*').eq('active', true).order('date', { ascending: false });
    return data || [];
  },
  async insertExpense(expense) {
    const { data, error } = await supabase.from('expenses').insert(expense).select().single();
    if (error) throw error;
    return data;
  },
  async updateExpense(id, updates) {
    const { data, error } = await supabase.from('expenses').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteExpense(id) {
    const { error } = await supabase.from('expenses').update({ active: false }).eq('id', id);
    if (error) throw error;
  },
};

// ============ MAIN APP ============
export default function FiambreriaApp() {
  const [pg, setPg] = useState('dashboard');
  const [sOpen, setSOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [cats, arts, sls, prs, exps] = await Promise.all([
        db.getCategories(),
        db.getArticles(),
        db.getSales(),
        db.getPurchases(),
        db.getExpenses(),
      ]);
      setCategories(cats);
      setArticles(arts);
      setSales(sls);
      setPurchases(prs);
      setExpenses(exps);
    } catch (e) {
      console.error('Error loading data:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const refresh = useCallback(async () => {
    const [arts, sls, prs, exps] = await Promise.all([db.getArticles(), db.getSales(), db.getPurchases(), db.getExpenses()]);
    setArticles(arts); setSales(sls); setPurchases(prs); setExpenses(exps);
  }, []);

  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: I.dashboard },
    { id: 'inventory', label: 'Inventario', icon: I.box },
    { id: 'purchases', label: 'Compras', icon: I.bag },
    { id: 'sales', label: 'Ventas', icon: I.cart },
    { id: 'expenses', label: 'Gastos', icon: I.wallet },
    { id: 'reports', label: 'Reportes', icon: I.chart },
    { id: 'advisor', label: 'Asesor IA', icon: I.brain },
  ];

  const lowStock = articles.filter(a => a.stock > 0 && a.stock <= (a.min_stock || 5));
  const outStock = articles.filter(a => a.stock <= 0 && a.purchase_price > 0);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 30, fontWeight: 800, color: '#BF4A2A' }}>La Fiambrería</div>
        <div style={{ color: '#A3937F', fontSize: 13, marginTop: 6 }}>Conectando con la base de datos...</div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <div className={`overlay ${sOpen ? 'open' : ''}`} onClick={() => setSOpen(false)} />
      <aside className={`side ${sOpen ? 'open' : ''}`}>
        <div className="side-hd">
          <div className="side-logo">La Fiambrería</div>
          <div className="side-sub">Sistema de Gestión</div>
        </div>
        <nav className="side-nav">
          {nav.map(n => (
            <div key={n.id} className={`nav-i ${pg === n.id ? 'on' : ''}`} onClick={() => { setPg(n.id); setSOpen(false); }}>
              {n.icon}{n.label}
              {n.id === 'inventory' && (lowStock.length + outStock.length > 0) && (
                <span style={{ marginLeft: 'auto', background: '#C43030', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                  {lowStock.length + outStock.length}
                </span>
              )}
            </div>
          ))}
        </nav>
        <div className="side-ft">v3.0 Cloud · Supabase + Vercel</div>
      </aside>

      <main className="main">
        <header className="top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="mob-btn" onClick={() => setSOpen(true)}>{I.menu}</button>
            <h1>{nav.find(n => n.id === pg)?.label}</h1>
          </div>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{fDate(new Date())}</span>
        </header>
        <div className="page">
          {pg === 'dashboard' && <Dashboard articles={articles} sales={sales} purchases={purchases} expenses={expenses} setPg={setPg} lowStock={lowStock} outStock={outStock} />}
          {pg === 'inventory' && <InventoryPage articles={articles} categories={categories} refresh={refresh} notify={notify} />}
          {pg === 'purchases' && <PurchasesPage articles={articles} purchases={purchases} refresh={refresh} notify={notify} />}
          {pg === 'sales' && <SalesPage articles={articles} sales={sales} refresh={refresh} notify={notify} />}
          {pg === 'expenses' && <ExpensesPage expenses={expenses} refresh={refresh} notify={notify} />}
          {pg === 'reports' && <ReportsPage articles={articles} sales={sales} purchases={purchases} expenses={expenses} />}
          {pg === 'advisor' && <AIAdvisorPage articles={articles} sales={sales} purchases={purchases} expenses={expenses} />}
        </div>
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ============ DASHBOARD ============
function Dashboard({ articles, sales, purchases, expenses, setPg, lowStock, outStock }) {
  const today = new Date().toDateString();
  const tSales = sales.filter(s => new Date(s.date).toDateString() === today);
  const tRev = tSales.reduce((a, s) => a + Number(s.total), 0);
  const tProfit = tSales.reduce((a, s) => a + Number(s.profit), 0);
  const allRev = sales.reduce((a, s) => a + Number(s.total), 0);
  const allProfit = sales.reduce((a, s) => a + Number(s.profit), 0);
  const allExpense = purchases.reduce((a, p) => a + Number(p.total), 0);
  const allGastos = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
  const netResult = allProfit - allGastos;
  const recent5 = sales.slice(0, 5);
  const recentP = purchases.slice(0, 5);

  return (
    <div>
      {(lowStock.length > 0 || outStock.length > 0) && (
        <div className={`alert-banner ${outStock.length > 0 ? 'alert-r' : 'alert-y'}`}>
          {I.warn}
          <span>
            {outStock.length > 0 && <strong>{outStock.length} sin stock. </strong>}
            {lowStock.length > 0 && <span>{lowStock.length} con stock bajo: {lowStock.slice(0, 3).map(a => a.name).join(', ')}{lowStock.length > 3 ? '...' : ''}</span>}
          </span>
          <button className="btn btn-sm btn-s" style={{ marginLeft: 'auto' }} onClick={() => setPg('inventory')}>Ver inventario</button>
        </div>
      )}
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Ventas Hoy</div><div className="kpi-val" style={{ color: 'var(--ac)' }}>{money(tRev)}</div><div className="kpi-s">{tSales.length} ticket(s)</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Ganancia Hoy</div><div className="kpi-val" style={{ color: 'var(--gn)' }}>{money(tProfit)}</div><div className="kpi-s">margen {tRev > 0 ? ((tProfit / tRev) * 100).toFixed(1) : 0}%</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Ganancia Total</div><div className="kpi-val" style={{ color: 'var(--gn)' }}>{money(allProfit)}</div><div className="kpi-s">de {money(allRev)} en ventas</div></div>
        <div className="kpi kpi-r"><div className="kpi-l">Gastos Operativos</div><div className="kpi-val" style={{ color: 'var(--rd)' }}>{money(allGastos)}</div><div className="kpi-s">{expenses.length} gastos</div></div>
        <div className={`kpi ${netResult >= 0 ? 'kpi-v' : 'kpi-r'}`}><div className="kpi-l">Resultado Neto</div><div className="kpi-val" style={{ color: netResult >= 0 ? 'var(--gn)' : 'var(--rd)' }}>{money(netResult)}</div><div className="kpi-s">Bruta - Gastos</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card">
          <div className="card-h"><h3>Últimas Ventas</h3><button className="btn btn-sm btn-s" onClick={() => setPg('sales')}>Ver todas {I.arrow}</button></div>
          <div style={{ padding: 0 }}>
            {recent5.length === 0 ? <div className="empty"><p>Sin ventas aún</p></div> : (
              <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Ganancia</th></tr></thead>
                <tbody>{recent5.map(s => (
                  <tr key={s.id}><td style={{ fontSize: 12 }}>{fDateTime(s.date)}</td><td>{s.client_name || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{money(s.total)}</td><td><span className="badge b-gn">{money(s.profit)}</span></td></tr>
                ))}</tbody></table>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Últimas Compras</h3><button className="btn btn-sm btn-s" onClick={() => setPg('purchases')}>Ver todas {I.arrow}</button></div>
          <div style={{ padding: 0 }}>
            {recentP.length === 0 ? <div className="empty"><p>Sin compras aún</p></div> : (
              <table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Total</th></tr></thead>
                <tbody>{recentP.map(p => (
                  <tr key={p.id}><td style={{ fontSize: 12 }}>{fDateTime(p.date)}</td><td>{p.supplier_name}</td>
                    <td>{p.invoice_number || '—'}</td><td style={{ fontWeight: 600 }}>{money(p.total)}</td></tr>
                ))}</tbody></table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ INVENTORY ============
function InventoryPage({ articles, categories, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [catF, setCatF] = useState('');
  const [sort, setSort] = useState('name');

  const filtered = articles
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()) && (!catF || a.category_name === catF))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'stock-low') return a.stock - b.stock;
      if (sort === 'stock-high') return b.stock - a.stock;
      return 0;
    });

  const totalVal = articles.reduce((s, a) => s + (a.stock * (a.sale_price || 0)), 0);
  const totalCost = articles.reduce((s, a) => s + (a.stock * (a.purchase_price || 0)), 0);

  const handleSave = async (art) => {
    try {
      const catObj = categories.find(c => c.name === art.category_name);
      const payload = {
        name: art.name,
        category_id: catObj?.id || null,
        units: art.units || ['kg'],
        margin_percent: art.margin_percent || 30,
        min_stock: art.min_stock || 5,
        stock: art.stock || 0,
        purchase_price: art.purchase_price || 0,
        sale_price: art.purchase_price ? Math.round(art.purchase_price * (1 + (art.margin_percent || 30) / 100) * 100) / 100 : 0,
      };
      if (art.id) {
        await db.updateArticle(art.id, payload);
        notify('Artículo actualizado');
      } else {
        await db.insertArticle(payload);
        notify('Artículo creado');
      }
      await refresh();
      setModal(null);
    } catch (e) {
      notify('Error: ' + e.message);
    }
  };

  const handleDel = async (id) => {
    if (confirm('¿Eliminar este artículo?')) {
      await db.deleteArticle(id);
      await refresh();
      notify('Artículo eliminado');
    }
  };

  const stockStatus = (a) => {
    if (a.stock <= 0 && a.purchase_price > 0) return 'out';
    if (a.stock <= (a.min_stock || 5) && a.purchase_price > 0) return 'low';
    return 'ok';
  };

  const blank = { name: '', category_name: 'Otros', units: ['kg'], margin_percent: 30, min_stock: 5, stock: 0, purchase_price: 0, sale_price: 0 };

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Total Artículos</div><div className="kpi-val" style={{ color: 'var(--ac)' }}>{articles.length}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Valor Inventario (Venta)</div><div className="kpi-val" style={{ color: 'var(--gn)' }}>{money(totalVal)}</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Costo Inventario</div><div className="kpi-val">{money(totalCost)}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Ganancia Potencial</div><div className="kpi-val" style={{ color: 'var(--gn)' }}>{money(totalVal - totalCost)}</div></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="sb">{I.search}<input className="fi" placeholder="Buscar artículo..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select className="fs" style={{ width: 'auto' }} value={catF} onChange={e => setCatF(e.target.value)}>
            <option value="">Todas</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <select className="fs" style={{ width: 'auto' }} value={sort} onChange={e => setSort(e.target.value)}>
            <option value="name">Nombre</option><option value="stock-low">Stock ↑</option><option value="stock-high">Stock ↓</option>
          </select>
        </div>
        <button className="btn btn-p" onClick={() => setModal({ ...blank })}>{I.plus} Nuevo Artículo</button>
      </div>

      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>Artículo</th><th>Categoría</th><th>Unidades</th><th>P. Compra</th><th>Margen</th><th>P. Venta</th><th>Stock</th><th>Estado</th><th style={{ width: 80 }}></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={9}><div className="empty"><p>No hay artículos{search ? ' para esta búsqueda' : '. ¡Creá el primero!'}</p></div></td></tr> :
              filtered.map(a => {
                const st = stockStatus(a);
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.name}</td>
                    <td><span className="badge b-ac">{a.category_name}</span></td>
                    <td style={{ fontSize: 12 }}>{(a.units || []).map(unitLabel).join(', ')}</td>
                    <td>{a.purchase_price > 0 ? money(a.purchase_price) : <span style={{ color: 'var(--tx3)', fontSize: 11 }}>Pendiente</span>}</td>
                    <td><span className="badge b-gn">{a.margin_percent}%</span></td>
                    <td style={{ fontWeight: 600, color: 'var(--ac)' }}>{a.sale_price > 0 ? money(a.sale_price) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{Number(a.stock).toFixed(2)} {(a.units || [])[0] || ''}</td>
                    <td>
                      {a.purchase_price > 0 ? (
                        <span className={`badge ${st === 'ok' ? 'b-gn' : st === 'low' ? 'b-yw' : 'b-rd'}`}>
                          <span className={`stock-dot ${st === 'ok' ? 'stock-ok' : st === 'low' ? 'stock-low' : 'stock-out'}`}></span>
                          {st === 'ok' ? 'OK' : st === 'low' ? 'Bajo' : 'Sin Stock'}
                        </span>
                      ) : <span style={{ color: 'var(--tx3)', fontSize: 11 }}>Sin movimiento</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-i" onClick={() => setModal({ ...a })}>{I.edit}</button>
                        <button className="btn-i" onClick={() => handleDel(a.id)} style={{ color: 'var(--rd)' }}>{I.trash}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div></div></div>

      {modal && <ArticleModal art={modal} categories={categories} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
}

function ArticleModal({ art, categories, onSave, onClose }) {
  const [f, setF] = useState({ ...art, units: art.units || ['kg'] });
  const salePrice = (f.purchase_price || 0) * (1 + (f.margin_percent || 0) / 100);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const toggleUnit = (u) => {
    const units = f.units.includes(u) ? f.units.filter(x => x !== u) : [...f.units, u];
    if (units.length > 0) set('units', units);
  };

  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{f.id ? 'Editar' : 'Nuevo'} Artículo</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg"><label className="fl">Nombre</label><input className="fi" value={f.name} onChange={e => set('name', e.target.value)} placeholder="Ej: Jamón Crudo Paladini" /></div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Categoría</label>
              <select className="fs" value={f.category_name} onChange={e => set('category_name', e.target.value)}>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Unidades de Medida</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {UNITS.map(u => (
                  <button key={u.value} type="button" className={`btn btn-sm ${f.units.includes(u.value) ? 'btn-p' : 'btn-s'}`} onClick={() => toggleUnit(u.value)}>
                    {f.units.includes(u.value) && I.check} {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Precio Compra</label>
              <input className="fi" readOnly value={f.purchase_price ? money(f.purchase_price) : 'Se asigna en Compras'} style={{ fontSize: 12 }} />
              <span style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2, display: 'block' }}>Se actualiza al registrar compra</span>
            </div>
            <div className="fg">
              <label className="fl">Margen (%)</label>
              <input className="fi" type="number" step="1" min="0" value={f.margin_percent} onChange={e => set('margin_percent', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="fg">
              <label className="fl">Precio Venta (auto)</label>
              <input className="fi" readOnly value={f.purchase_price ? money(salePrice) : '—'} />
            </div>
          </div>
          <div className="fr">
            <div className="fg"><label className="fl">Stock Actual</label><input className="fi" type="number" step="0.01" min="0" value={f.stock} onChange={e => set('stock', parseFloat(e.target.value) || 0)} /></div>
            <div className="fg"><label className="fl">Stock Mínimo (alerta)</label><input className="fi" type="number" step="0.01" min="0" value={f.min_stock || 5} onChange={e => set('min_stock', parseFloat(e.target.value) || 0)} /></div>
          </div>
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={!f.name.trim()} onClick={() => onSave(f)}>
            {f.id ? 'Guardar Cambios' : 'Crear Artículo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ PURCHASES ============
function PurchasesPage({ articles, purchases, refresh, notify }) {
  const [modal, setModal] = useState(false);
  const [view, setView] = useState(null);

  const handleCreate = async (data) => {
    try {
      const invoice = {
        supplier_name: data.supplier,
        invoice_number: data.invoiceNum,
        total: data.total,
      };
      const items = data.items.map(i => ({
        article_id: i.articleId,
        article_name: i.articleName,
        quantity: i.quantity,
        unit: i.unit,
        unit_cost: i.unitCost,
        subtotal: i.subtotal,
      }));
      await db.insertPurchase(invoice, items);
      await refresh();
      notify('Compra registrada: ' + money(data.total));
      setModal(false);
    } catch (e) { notify('Error: ' + e.message); }
  };

  const handleDel = async (id) => {
    if (confirm('¿Eliminar esta compra?')) {
      await db.deletePurchase(id);
      await refresh();
      notify('Compra eliminada');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
        <div />
        <button className="btn btn-p" onClick={() => setModal(true)}>{I.plus} Nueva Compra</button>
      </div>
      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Artículos</th><th>Total</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {purchases.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay compras registradas</p></div></td></tr> :
              purchases.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--tx3)' }}>#{purchases.length - i}</td>
                  <td style={{ fontSize: 12 }}>{fDateTime(p.date)}</td>
                  <td style={{ fontWeight: 500 }}>{p.supplier_name}</td>
                  <td>{p.invoice_number || '—'}</td>
                  <td>{p.purchase_invoice_items?.length || 0}</td>
                  <td style={{ fontWeight: 600 }}>{money(p.total)}</td>
                  <td><div style={{ display: 'flex', gap: 4 }}><button className="btn-i" onClick={() => setView(p)}>{I.eye}</button><button className="btn-i" onClick={() => handleDel(p.id)} style={{ color: 'var(--rd)' }}>{I.trash}</button></div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      {modal && <PurchaseModal articles={articles} onSave={handleCreate} onClose={() => setModal(false)} />}
      {view && (
        <div className="mo" onClick={() => setView(null)}>
          <div className="md" onClick={e => e.stopPropagation()}>
            <div className="md-h"><h2>Detalle de Compra</h2><button className="btn-i" onClick={() => setView(null)}>{I.x}</button></div>
            <div className="md-b">
              <div style={{ display: 'flex', gap: 20, marginBottom: 14, fontSize: 13, color: 'var(--tx2)', flexWrap: 'wrap' }}>
                <span>Fecha: <strong>{fDateTime(view.date)}</strong></span>
                <span>Proveedor: <strong>{view.supplier_name}</strong></span>
                <span>Factura: <strong>{view.invoice_number || '—'}</strong></span>
              </div>
              <table><thead><tr><th>Artículo</th><th>Cant.</th><th>Unidad</th><th>Costo U.</th><th>Subtotal</th></tr></thead>
                <tbody>{(view.purchase_invoice_items || []).map((it, i) => (
                  <tr key={i}><td style={{ fontWeight: 500 }}>{it.article_name}</td><td>{it.quantity}</td><td>{unitLabel(it.unit)}</td><td>{money(it.unit_cost)}</td><td style={{ fontWeight: 600 }}>{money(it.subtotal)}</td></tr>
                ))}</tbody></table>
              <div className="tt" style={{ marginTop: 14 }}><span className="tt-l">Total</span><span className="tt-v">{money(view.total)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseModal({ articles, onSave, onClose }) {
  const [supplier, setSupplier] = useState('');
  const [invoiceNum, setInvoiceNum] = useState('');
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [showDD, setShowDD] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');

  const avail = articles.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) && !items.find(i => i.articleId === a.id));

  const addItem = (a) => {
    setItems([...items, { articleId: a.id, articleName: a.name, unit: (a.units || ['kg'])[0], quantity: 1, unitCost: Number(a.purchase_price) || 0, subtotal: Number(a.purchase_price) || 0 }]);
    setQ(''); setShowDD(false);
  };

  const updItem = (idx, k, v) => {
    const u = [...items]; u[idx][k] = v;
    if (k === 'quantity' || k === 'unitCost') u[idx].subtotal = (u[idx].quantity || 0) * (u[idx].unitCost || 0);
    setItems(u);
  };

  const handleScanInvoice = async (file) => {
    setScanning(true);
    setScanError('');
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result.split(',')[1]);
        reader.onerror = () => rej(new Error('Error reading file'));
        reader.readAsDataURL(file);
      });

      const resp = await fetch('/api/scan-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: file.type }),
      });

      if (!resp.ok) throw new Error('Error al procesar la imagen');

      const data = await resp.json();

      if (data.supplier) setSupplier(data.supplier);
      if (data.invoiceNumber) setInvoiceNum(data.invoiceNumber);

      if (data.items && data.items.length > 0) {
        const newItems = data.items.map(scanned => {
          const match = articles.find(a => a.name.toLowerCase().includes(scanned.name.toLowerCase()) || scanned.name.toLowerCase().includes(a.name.toLowerCase()));
          return {
            articleId: match?.id || null,
            articleName: match?.name || scanned.name,
            unit: scanned.unit || 'und',
            quantity: scanned.quantity || 1,
            unitCost: scanned.unitCost || 0,
            subtotal: (scanned.quantity || 1) * (scanned.unitCost || 0),
            isNew: !match,
          };
        });
        setItems(prev => [...prev, ...newItems]);
      }
    } catch (e) {
      setScanError(e.message || 'Error al escanear');
    }
    setScanning(false);
  };

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  return (
    <div className="mo" onClick={onClose}>
      <div className="md md-lg" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>Registrar Factura de Compra</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          {/* AI SCAN AREA */}
          <div style={{
            border: '2px dashed var(--br)', borderRadius: 12, padding: 20, textAlign: 'center',
            marginBottom: 18, cursor: 'pointer', background: scanning ? 'var(--acL)' : 'var(--bg3)',
            transition: 'all 0.2s',
          }}
            onClick={() => !scanning && document.getElementById('invoice-upload').click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleScanInvoice(f); }}
          >
            <input id="invoice-upload" type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) handleScanInvoice(f); e.target.value = ''; }} />
            {scanning ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ac)' }}>Escaneando factura con IA...</div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>Extrayendo proveedor, artículos y precios</div>
              </div>
            ) : (
              <div>
                <div style={{ color: 'var(--ac)', marginBottom: 6 }}>
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>Escaneá tu factura con IA</div>
                <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>Tocá para sacar una foto o arrastrá una imagen. Claude extrae proveedor, artículos y precios automáticamente.</div>
              </div>
            )}
          </div>
          {scanError && <div style={{ color: 'var(--rd)', fontSize: 12, marginBottom: 10 }}>{scanError}</div>}

          <div className="fr">
            <div className="fg"><label className="fl">Proveedor</label><input className="fi" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nombre del proveedor" /></div>
            <div className="fg"><label className="fl">Nº Factura</label><input className="fi" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="FAC-0001" /></div>
          </div>
          <div className="fg" style={{ position: 'relative' }}>
            <label className="fl">Agregar Artículo (manual)</label>
            <input className="fi" placeholder="Buscar artículo..." value={q} onChange={e => { setQ(e.target.value); setShowDD(true); }} onFocus={() => setShowDD(true)} onBlur={() => setTimeout(() => setShowDD(false), 200)} />
            {showDD && q && (
              <div className="dd">
                {avail.length === 0 ? <div style={{ padding: 10, color: 'var(--tx3)', fontSize: 12 }}>No encontrado. Crealo en Inventario.</div> :
                  avail.slice(0, 8).map(a => (
                    <div key={a.id} className="dd-i" onMouseDown={() => addItem(a)}>
                      <span>{a.name}</span>
                      {a.purchase_price > 0 && <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Últ: {money(a.purchase_price)}</span>}
                    </div>
                  ))}
              </div>
            )}
          </div>
          {items.length > 0 && (
            <>
              <div className="ti">
                <div className="ti-r ti-h" style={{ gridTemplateColumns: '2fr 70px 90px 100px 100px 36px' }}><span>Artículo</span><span>Cant.</span><span>Unidad</span><span>Costo U.</span><span>Subtotal</span><span></span></div>
                {items.map((it, idx) => {
                  const art = articles.find(a => a.id === it.articleId);
                  return (
                    <div className="ti-r" key={idx} style={{ gridTemplateColumns: '2fr 70px 90px 100px 100px 36px' }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>{it.articleName}</span>
                        {it.isNew && <span style={{ display: 'block', fontSize: 10, color: 'var(--yw)' }}>⚠ No existe en inventario</span>}
                      </div>
                      <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, 'quantity', parseFloat(e.target.value) || 0)} style={{ padding: '5px 7px', fontSize: 12 }} />
                      <select className="fs" value={it.unit} onChange={e => updItem(idx, 'unit', e.target.value)} style={{ padding: '5px 7px', fontSize: 12 }}>
                        {(art?.units || UNITS.map(u=>u.value)).map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
                      </select>
                      <input className="fi" type="number" step="0.01" min="0" value={it.unitCost} onChange={e => updItem(idx, 'unitCost', parseFloat(e.target.value) || 0)} style={{ padding: '5px 7px', fontSize: 12 }} />
                      <span style={{ fontWeight: 600 }}>{money(it.subtotal)}</span>
                      <button className="btn-i" onClick={() => setItems(items.filter((_, i) => i !== idx))} style={{ color: 'var(--rd)', border: 'none', padding: 3 }}>{I.trash}</button>
                    </div>
                  );
                })}
              </div>
              <div className="tt"><span className="tt-l">Total Factura</span><span className="tt-v">{money(total)}</span></div>
            </>
          )}
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={items.length === 0 || !supplier.trim()} onClick={() => onSave({ supplier, invoiceNum, items: items.filter(i => i.articleId), total })}>Registrar Compra</button>
        </div>
      </div>
    </div>
  );
}

// ============ SALES ============
function SalesPage({ articles, sales, refresh, notify }) {
  const [modal, setModal] = useState(false);
  const [view, setView] = useState(null);
  const [search, setSearch] = useState('');
  const filtered = sales.filter(s => (s.client_name || '').toLowerCase().includes(search.toLowerCase()) || (s.sale_ticket_items || []).some(i => (i.article_name || '').toLowerCase().includes(search.toLowerCase())));

  const handleCreate = async (data) => {
    try {
      const ticket = { client_name: data.client || 'Consumidor Final', total: data.total, cost_total: data.total - data.profit, profit: data.profit };
      const items = data.items.map(i => ({
        article_id: i.articleId, article_name: i.articleName, quantity: i.quantity,
        unit: i.unit, unit_price: i.unitPrice, cost_price: i.costPrice,
        subtotal: i.subtotal, profit: i.profit,
      }));
      await db.insertSale(ticket, items);
      await refresh();
      notify('Venta registrada: ' + money(data.total));
      setModal(false);
    } catch (e) { notify('Error: ' + e.message); }
  };

  const handleDel = async (id) => {
    if (confirm('¿Eliminar esta venta?')) {
      await db.deleteSale(id);
      await refresh();
      notify('Venta eliminada');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div className="sb">{I.search}<input className="fi" placeholder="Buscar por cliente..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <button className="btn btn-p" onClick={() => setModal(true)}>{I.plus} Nueva Venta</button>
      </div>
      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Artículos</th><th>Total</th><th>Ganancia</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay ventas registradas</p></div></td></tr> :
              filtered.map((s, i) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: 'var(--tx3)' }}>#{s.ticket_number || sales.length - i}</td>
                  <td style={{ fontSize: 12 }}>{fDateTime(s.date)}</td>
                  <td style={{ fontWeight: 500 }}>{s.client_name || '—'}</td>
                  <td>{s.sale_ticket_items?.length || 0}</td>
                  <td style={{ fontWeight: 600 }}>{money(s.total)}</td>
                  <td><span className="badge b-gn">{money(s.profit)}</span></td>
                  <td><div style={{ display: 'flex', gap: 4 }}><button className="btn-i" onClick={() => setView(s)}>{I.eye}</button><button className="btn-i" onClick={() => handleDel(s.id)} style={{ color: 'var(--rd)' }}>{I.trash}</button></div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      {modal && <SaleModal articles={articles} onSave={handleCreate} onClose={() => setModal(false)} />}
      {view && (
        <div className="mo" onClick={() => setView(null)}>
          <div className="md" onClick={e => e.stopPropagation()}>
            <div className="md-h"><h2>Detalle de Venta</h2><button className="btn-i" onClick={() => setView(null)}>{I.x}</button></div>
            <div className="md-b">
              <div style={{ display: 'flex', gap: 20, marginBottom: 14, fontSize: 13, color: 'var(--tx2)' }}>
                <span>Fecha: <strong>{fDateTime(view.date)}</strong></span>
                <span>Cliente: <strong>{view.client_name || 'Sin especificar'}</strong></span>
              </div>
              <table><thead><tr><th>Artículo</th><th>Cant.</th><th>P. Venta</th><th>Subtotal</th><th>Ganancia</th></tr></thead>
                <tbody>{(view.sale_ticket_items || []).map((it, i) => (
                  <tr key={i}><td style={{ fontWeight: 500 }}>{it.article_name}</td><td>{it.quantity} {it.unit}</td><td>{money(it.unit_price)}</td><td style={{ fontWeight: 600 }}>{money(it.subtotal)}</td><td><span className="badge b-gn">{money(it.profit)}</span></td></tr>
                ))}</tbody></table>
              <div className="tt" style={{ marginTop: 14 }}>
                <div><span className="tt-l">Total</span><div style={{ fontSize: 12, color: 'var(--gn)', marginTop: 2 }}>Ganancia: {money(view.profit)}</div></div>
                <span className="tt-v">{money(view.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaleModal({ articles, onSave, onClose }) {
  const [client, setClient] = useState('');
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [showDD, setShowDD] = useState(false);

  const avail = articles.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) && a.sale_price > 0 && !items.find(i => i.articleId === a.id));

  const addItem = (a) => {
    const sp = Number(a.sale_price);
    const cp = Number(a.purchase_price);
    setItems([...items, {
      articleId: a.id, articleName: a.name, unit: (a.units || ['kg'])[0],
      quantity: 1, unitPrice: sp, costPrice: cp,
      subtotal: sp, profit: sp - cp, stock: Number(a.stock)
    }]);
    setQ(''); setShowDD(false);
  };

  const updItem = (idx, k, v) => {
    const u = [...items]; u[idx][k] = v;
    if (k === 'quantity') { u[idx].subtotal = v * u[idx].unitPrice; u[idx].profit = v * (u[idx].unitPrice - u[idx].costPrice); }
    setItems(u);
  };

  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const profit = items.reduce((s, i) => s + i.profit, 0);

  return (
    <div className="mo" onClick={onClose}>
      <div className="md md-lg" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>Nuevo Ticket de Venta</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg"><label className="fl">Cliente (opcional)</label><input className="fi" value={client} onChange={e => setClient(e.target.value)} placeholder="Nombre del cliente" /></div>
          <div className="fg" style={{ position: 'relative' }}>
            <label className="fl">Agregar Artículo</label>
            <input className="fi" placeholder="Buscar artículo..." value={q} onChange={e => { setQ(e.target.value); setShowDD(true); }} onFocus={() => setShowDD(true)} onBlur={() => setTimeout(() => setShowDD(false), 200)} />
            {showDD && q && (
              <div className="dd">
                {avail.length === 0 ? <div style={{ padding: 10, color: 'var(--tx3)', fontSize: 12 }}>No encontrado o sin precio</div> :
                  avail.slice(0, 8).map(a => (
                    <div key={a.id} className="dd-i" onMouseDown={() => addItem(a)}>
                      <span>{a.name} <span style={{ color: 'var(--tx3)', fontSize: 11 }}>({Number(a.stock).toFixed(1)} {(a.units || [])[0]})</span></span>
                      <span style={{ fontWeight: 600, color: 'var(--ac)', fontSize: 12 }}>{money(a.sale_price)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
          {items.length > 0 && (
            <>
              <div className="ti">
                <div className="ti-r ti-h" style={{ gridTemplateColumns: '2fr 70px 90px 100px 36px' }}><span>Artículo</span><span>Cant.</span><span>Unidad</span><span>Subtotal</span><span></span></div>
                {items.map((it, idx) => {
                  const art = articles.find(a => a.id === it.articleId);
                  return (
                    <div className="ti-r" key={idx} style={{ gridTemplateColumns: '2fr 70px 90px 100px 36px' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{it.articleName}</div>
                        <div style={{ fontSize: 11, color: 'var(--ac)' }}>{money(it.unitPrice)}/{it.unit}</div>
                        {it.quantity > it.stock && <div style={{ fontSize: 10, color: 'var(--rd)' }}>⚠ Stock: {it.stock}</div>}
                      </div>
                      <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, 'quantity', parseFloat(e.target.value) || 0)} style={{ padding: '5px 7px', fontSize: 12 }} />
                      <select className="fs" value={it.unit} onChange={e => updItem(idx, 'unit', e.target.value)} style={{ padding: '5px 7px', fontSize: 12 }}>
                        {(art?.units || ['kg']).map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
                      </select>
                      <span style={{ fontWeight: 600 }}>{money(it.subtotal)}</span>
                      <button className="btn-i" onClick={() => setItems(items.filter((_, i) => i !== idx))} style={{ color: 'var(--rd)', border: 'none', padding: 3 }}>{I.trash}</button>
                    </div>
                  );
                })}
              </div>
              <div className="tt">
                <div><span className="tt-l">Total del Ticket</span><div style={{ fontSize: 12, color: 'var(--gn)', marginTop: 2 }}>Ganancia: {money(profit)}</div></div>
                <span className="tt-v">{money(total)}</span>
              </div>
            </>
          )}
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={items.length === 0} onClick={() => onSave({ client, items, total, profit })}>Registrar Venta</button>
        </div>
      </div>
    </div>
  );
}

// ============ REPORTS ============
function ReportsPage({ articles, sales, purchases, expenses }) {
  const [tab, setTab] = useState('pnl');
  const [period, setPeriod] = useState('all');

  const filterP = (arr) => {
    if (period === 'all') return arr;
    const now = new Date(), start = new Date();
    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') start.setDate(now.getDate() - 7);
    else if (period === 'month') start.setMonth(now.getMonth() - 1);
    return arr.filter(i => new Date(i.date) >= start);
  };

  const pS = filterP(sales), pP = filterP(purchases);
  const rev = pS.reduce((a, s) => a + Number(s.total), 0);
  const prof = pS.reduce((a, s) => a + Number(s.profit), 0);
  const cost = rev - prof;
  const exp = pP.reduce((a, p) => a + Number(p.total), 0);
  const margin = rev > 0 ? (prof / rev * 100) : 0;

  // Build product rankings from sale items
  const prodMap = {};
  pS.forEach(s => (s.sale_ticket_items || []).forEach(i => {
    if (!prodMap[i.article_id]) prodMap[i.article_id] = { name: i.article_name, rev: 0, prof: 0, qty: 0, count: 0 };
    prodMap[i.article_id].rev += Number(i.subtotal); prodMap[i.article_id].prof += Number(i.profit);
    prodMap[i.article_id].qty += Number(i.quantity); prodMap[i.article_id].count++;
  }));
  const topSell = Object.values(prodMap).sort((a, b) => b.rev - a.rev);
  const lessS = Object.values(prodMap).sort((a, b) => a.rev - b.rev);
  const maxR = topSell[0]?.rev || 1;

  const purchMap = {};
  pP.forEach(p => (p.purchase_invoice_items || []).forEach(i => {
    if (!purchMap[i.article_id]) purchMap[i.article_id] = { name: i.article_name, total: 0, qty: 0, count: 0 };
    purchMap[i.article_id].total += Number(i.subtotal); purchMap[i.article_id].qty += Number(i.quantity); purchMap[i.article_id].count++;
  }));
  const topBuy = Object.values(purchMap).sort((a, b) => b.total - a.total);
  const maxB = topBuy[0]?.total || 1;

  const lowStock = articles.filter(a => a.stock > 0 && a.stock <= (a.min_stock || 5)).sort((a, b) => a.stock - b.stock);
  const outStock = articles.filter(a => a.stock <= 0 && a.purchase_price > 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[['pnl', 'P&L'], ['sales-r', 'Ventas'], ['purch-r', 'Compras'], ['stock-r', 'Stock']].map(([id, l]) => (
            <div key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{l}</div>
          ))}
        </div>
        <select className="fs" style={{ width: 'auto' }} value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">Todo</option><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option>
        </select>
      </div>

      {tab === 'pnl' && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-o"><div className="kpi-l">Ingresos</div><div className="kpi-val" style={{ color: 'var(--ac)' }}>{money(rev)}</div><div className="kpi-s">{pS.length} ventas</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Costo Mercadería</div><div className="kpi-val">{money(cost)}</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">Ganancia Bruta</div><div className="kpi-val" style={{ color: 'var(--gn)' }}>{money(prof)}</div><div className="kpi-s">Margen: {margin.toFixed(1)}%</div></div>
            <div className="kpi kpi-r"><div className="kpi-l">Compras</div><div className="kpi-val" style={{ color: 'var(--rd)' }}>{money(exp)}</div><div className="kpi-s">{pP.length} facturas</div></div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Estado de Resultados (P&L)</h3></div>
            <div className="card-b">
              {[
                ['Ingresos por Ventas', money(rev), 'var(--ac)', false],
                ['(-) Costo Mercadería', '- ' + money(cost), 'var(--tx2)', false],
                ['= Ganancia Bruta', money(prof), 'var(--gn)', true],
                ['(-) Compras a Proveedores', '- ' + money(exp), 'var(--rd)', false],
                ['= Resultado Neto', money(rev - exp), rev - exp >= 0 ? 'var(--gn)' : 'var(--rd)', true],
              ].map(([label, val, color, bold], i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', padding: bold ? '14px 16px' : '10px 16px',
                  background: bold ? (i === 4 ? (rev - exp >= 0 ? 'var(--gnL)' : 'var(--rdL)') : 'var(--bg3)') : 'transparent',
                  borderRadius: bold ? 8 : 0, borderBottom: bold ? 'none' : '1px solid var(--br)', marginBottom: bold ? 8 : 0
                }}>
                  <span style={{ fontWeight: bold ? 700 : 400, fontSize: bold ? 15 : 13 }}>{label}</span>
                  <span style={{ fontWeight: 700, color, fontSize: bold ? 18 : 14, fontFamily: bold ? "'Fraunces',serif" : 'inherit' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'sales-r' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div className="card">
            <div className="card-h"><h3>Más Vendidos</h3></div>
            <div className="card-b">
              {topSell.length === 0 ? <div className="empty"><p>Sin datos</p></div> :
                <div className="bar-c">{topSell.slice(0, 10).map((p, i) => (
                  <div className="bar-r" key={i}><div className="bar-l" title={p.name}>{p.name}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (p.rev / maxR) * 100) + '%' }}></div></div><div className="bar-v">{money(p.rev)}</div></div>
                ))}</div>}
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Menos Vendidos</h3></div>
            <div className="card-b">
              {lessS.length === 0 ? <div className="empty"><p>Sin datos</p></div> :
                <table><thead><tr><th>Artículo</th><th>Cant.</th><th>Veces</th><th>Total</th></tr></thead>
                  <tbody>{lessS.slice(0, 10).map((p, i) => (
                    <tr key={i}><td style={{ fontWeight: 500 }}>{p.name}</td><td>{p.qty}</td><td>{p.count}</td><td>{money(p.rev)}</td></tr>
                  ))}</tbody></table>}
            </div>
          </div>
        </div>
      )}

      {tab === 'purch-r' && (
        <div className="card">
          <div className="card-h"><h3>Artículos Más Comprados</h3></div>
          <div className="card-b">
            {topBuy.length === 0 ? <div className="empty"><p>Sin datos</p></div> :
              <div className="bar-c">{topBuy.slice(0, 10).map((p, i) => (
                <div className="bar-r" key={i}><div className="bar-l" title={p.name}>{p.name}</div><div className="bar-t"><div className="bar-f gn" style={{ width: Math.max(8, (p.total / maxB) * 100) + '%' }}></div></div><div className="bar-v">{money(p.total)}</div></div>
              ))}</div>}
          </div>
        </div>
      )}

      {tab === 'stock-r' && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-o"><div className="kpi-l">Total Artículos</div><div className="kpi-val" style={{ color: 'var(--ac)' }}>{articles.length}</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">Stock OK</div><div className="kpi-val" style={{ color: 'var(--gn)' }}>{articles.filter(a => a.stock > (a.min_stock || 5)).length}</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Stock Bajo</div><div className="kpi-val" style={{ color: 'var(--yw)' }}>{lowStock.length}</div></div>
            <div className="kpi kpi-r"><div className="kpi-l">Sin Stock</div><div className="kpi-val" style={{ color: 'var(--rd)' }}>{outStock.length}</div></div>
          </div>
          {outStock.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-h"><h3 style={{ color: 'var(--rd)' }}>Sin Stock</h3></div>
              <div style={{ padding: 0 }}><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Últ. Precio</th></tr></thead>
                <tbody>{outStock.map(a => (<tr key={a.id}><td style={{ fontWeight: 600 }}>{a.name}</td><td><span className="badge b-ac">{a.category_name}</span></td><td>{money(a.purchase_price)}</td></tr>))}</tbody></table></div>
            </div>
          )}
          {lowStock.length > 0 && (
            <div className="card">
              <div className="card-h"><h3 style={{ color: 'var(--yw)' }}>Stock Bajo</h3></div>
              <div style={{ padding: 0 }}><table><thead><tr><th>Artículo</th><th>Actual</th><th>Mínimo</th><th>Falta</th></tr></thead>
                <tbody>{lowStock.map(a => (<tr key={a.id}><td style={{ fontWeight: 600 }}>{a.name}</td><td><span className="badge b-yw">{Number(a.stock).toFixed(1)} {(a.units || [])[0]}</span></td><td>{a.min_stock || 5}</td><td style={{ fontWeight: 600, color: 'var(--rd)' }}>-{((a.min_stock || 5) - a.stock).toFixed(2)}</td></tr>))}</tbody></table></div>
            </div>
          )}
          {outStock.length === 0 && lowStock.length === 0 && (
            <div className="card"><div className="card-b"><div className="empty" style={{ color: 'var(--gn)' }}><p style={{ fontSize: 15 }}>Todo el inventario está en orden</p></div></div></div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ EXPENSES ============
function ExpensesPage({ expenses, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [catF, setCatF] = useState('');
  const [typeF, setTypeF] = useState('');
  const sorted = useMemo(() => [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)), [expenses]);
  const filtered = sorted.filter(e => (!catF || e.category === catF) && (!typeF || e.type === typeF));

  const totalAll = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalFijo = expenses.filter(e => e.type === 'fijo').reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalVariable = expenses.filter(e => e.type === 'variable').reduce((s, e) => s + Number(e.amount || 0), 0);

  const catTotals = {};
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount || 0); });
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const maxCat = topCats[0]?.[1] || 1;

  const blank = { description: '', category: 'Otros', type: 'fijo', frequency: 'mensual', amount: 0 };

  const handleSave = async (exp) => {
    try {
      const payload = { description: exp.description, category: exp.category, type: exp.type, frequency: exp.frequency, amount: exp.amount };
      if (exp.id) {
        await db.updateExpense(exp.id, payload);
        notify('Gasto actualizado');
      } else {
        await db.insertExpense(payload);
        notify('Gasto registrado');
      }
      await refresh();
      setModal(null);
    } catch (e) { notify('Error: ' + e.message); }
  };

  const handleDel = async (id) => {
    if (confirm('¿Eliminar este gasto?')) {
      await db.deleteExpense(id);
      await refresh();
      notify('Gasto eliminado');
    }
  };

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-r"><div className="kpi-l">Total Gastos</div><div className="kpi-val" style={{ color: 'var(--rd)' }}>{money(totalAll)}</div><div className="kpi-s">{expenses.length} registros</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Gastos Fijos</div><div className="kpi-val">{money(totalFijo)}</div><div className="kpi-s">{expenses.filter(e => e.type === 'fijo').length} registros</div></div>
        <div className="kpi kpi-o"><div className="kpi-l">Gastos Variables</div><div className="kpi-val">{money(totalVariable)}</div><div className="kpi-s">{expenses.filter(e => e.type === 'variable').length} registros</div></div>
      </div>

      {topCats.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-h"><h3>Gastos por Categoría</h3></div>
          <div className="card-b">
            <div className="bar-c">{topCats.map(([cat, total], i) => (
              <div className="bar-r" key={i}><div className="bar-l">{cat}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (total / maxCat) * 100) + '%' }}></div></div><div className="bar-v">{money(total)}</div></div>
            ))}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select className="fs" style={{ width: 'auto' }} value={catF} onChange={e => setCatF(e.target.value)}>
            <option value="">Todas las categorías</option>
            {EXP_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
          <select className="fs" style={{ width: 'auto' }} value={typeF} onChange={e => setTypeF(e.target.value)}>
            <option value="">Todos los tipos</option>
            {EXP_TYPE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <button className="btn btn-p" onClick={() => setModal({ ...blank })}>{I.plus} Nuevo Gasto</button>
      </div>

      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Frecuencia</th><th>Monto</th><th>Fecha</th><th style={{ width: 80 }}></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay gastos registrados</p></div></td></tr> :
              filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.description}</td>
                  <td><span className="badge b-ac">{e.category}</span></td>
                  <td><span className={`badge ${e.type === 'fijo' ? 'b-yw' : 'b-gn'}`}>{e.type === 'fijo' ? 'Fijo' : 'Variable'}</span></td>
                  <td style={{ fontSize: 12 }}>{EXP_FREQ.find(f => f.value === e.frequency)?.label || e.frequency}</td>
                  <td style={{ fontWeight: 600, color: 'var(--rd)' }}>{money(e.amount)}</td>
                  <td style={{ fontSize: 12 }}>{fDateTime(e.date)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-i" onClick={() => setModal({ ...e })}>{I.edit}</button>
                      <button className="btn-i" onClick={() => handleDel(e.id)} style={{ color: 'var(--rd)' }}>{I.trash}</button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      {modal && (
        <div className="mo" onClick={() => setModal(null)}>
          <div className="md" onClick={e => e.stopPropagation()}>
            <div className="md-h"><h2>{modal.id ? 'Editar' : 'Nuevo'} Gasto</h2><button className="btn-i" onClick={() => setModal(null)}>{I.x}</button></div>
            <div className="md-b">
              <div className="fg"><label className="fl">Descripción</label><input className="fi" value={modal.description} onChange={e => setModal({ ...modal, description: e.target.value })} placeholder="Ej: Alquiler local comercial" /></div>
              <div className="fr">
                <div className="fg"><label className="fl">Categoría</label>
                  <select className="fs" value={modal.category} onChange={e => setModal({ ...modal, category: e.target.value })}>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</select>
                </div>
                <div className="fg"><label className="fl">Monto ($)</label><input className="fi" type="number" step="0.01" min="0" value={modal.amount} onChange={e => setModal({ ...modal, amount: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="fr">
                <div className="fg"><label className="fl">Tipo</label>
                  <select className="fs" value={modal.type} onChange={e => setModal({ ...modal, type: e.target.value })}>{EXP_TYPE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                </div>
                <div className="fg"><label className="fl">Frecuencia</label>
                  <select className="fs" value={modal.frequency} onChange={e => setModal({ ...modal, frequency: e.target.value })}>{EXP_FREQ.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
                </div>
              </div>
            </div>
            <div className="md-f">
              <button className="btn btn-s" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-p" disabled={!modal.description.trim() || !modal.amount} onClick={() => handleSave(modal)}>
                {modal.id ? 'Guardar' : 'Registrar Gasto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ AI ADVISOR ============
function AIAdvisorPage({ articles, sales, purchases, expenses }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [mode, setMode] = useState('general');

  const analyze = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const now = new Date();
      const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);

      const monthSales = sales.filter(s => new Date(s.date) >= monthAgo);
      const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);

      const prodMap = {};
      monthSales.forEach(s => (s.sale_ticket_items || []).forEach(i => {
        if (!prodMap[i.article_id]) prodMap[i.article_id] = { name: i.article_name, rev: 0, qty: 0, count: 0, profit: 0 };
        prodMap[i.article_id].rev += Number(i.subtotal); prodMap[i.article_id].qty += Number(i.quantity);
        prodMap[i.article_id].count++; prodMap[i.article_id].profit += Number(i.profit || 0);
      }));
      const topProducts = Object.values(prodMap).sort((a, b) => b.rev - a.rev).slice(0, 15);
      const bottomProducts = Object.values(prodMap).sort((a, b) => a.rev - b.rev).slice(0, 10);

      const totalRevMonth = monthSales.reduce((a, s) => a + Number(s.total), 0);
      const totalProfitMonth = monthSales.reduce((a, s) => a + Number(s.profit), 0);
      const totalRevWeek = weekSales.reduce((a, s) => a + Number(s.total), 0);
      const totalExpenses = expenses.reduce((a, e) => a + Number(e.amount || 0), 0);
      const fixedExpenses = expenses.filter(e => e.type === 'fijo').reduce((a, e) => a + Number(e.amount || 0), 0);
      const lowStock = articles.filter(a => a.stock > 0 && a.stock <= (a.min_stock || 5));
      const outStock = articles.filter(a => a.stock <= 0 && a.purchase_price > 0);

      const prompts = {
        general: 'Sos el asesor de negocios de una fiambrería argentina. Analizá los datos y dame un informe ejecutivo completo con recomendaciones accionables.',
        promos: 'Sos el asesor comercial de una fiambrería argentina. Recomendá promociones específicas para esta semana.',
        compras: 'Sos el asesor de compras de una fiambrería argentina. Recomendá qué comprar esta semana y en qué cantidad.',
        costos: 'Sos el asesor financiero de una fiambrería argentina. Analizá gastos y costos, identificá oportunidades de ahorro.',
      };

      const dataContext = `DATOS (${fDate(now)}):
VENTAS MES: ${money(totalRevMonth)} | Ganancia: ${money(totalProfitMonth)} | Margen: ${totalRevMonth > 0 ? (totalProfitMonth/totalRevMonth*100).toFixed(1) : 0}%
VENTAS SEMANA: ${money(totalRevWeek)} | ${weekSales.length} tickets
GASTOS: ${money(totalExpenses)} | Fijos: ${money(fixedExpenses)}
RESULTADO: ${money(totalProfitMonth - totalExpenses)}
GASTOS DETALLE:\n${expenses.map(e => '- ' + e.description + ' (' + e.category + '): ' + money(e.amount)).join('\n') || 'Sin gastos'}
TOP PRODUCTOS:\n${topProducts.map((p, i) => (i+1) + '. ' + p.name + ': ' + money(p.rev) + ' (gan: ' + money(p.profit) + ')').join('\n') || 'Sin datos'}
MENOS VENDIDOS:\n${bottomProducts.map((p, i) => (i+1) + '. ' + p.name + ': ' + money(p.rev)).join('\n') || 'Sin datos'}
STOCK ALERTAS:\n${[...outStock.map(a => 'SIN STOCK: ' + a.name), ...lowStock.map(a => 'BAJO: ' + a.name + ' (' + Number(a.stock).toFixed(1) + ')')].join('\n') || 'OK'}
INVENTARIO: ${articles.length} arts | Valor: ${money(articles.reduce((s,a) => s + a.stock * (a.sale_price||0), 0))}`;

      const resp = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompts[mode], dataContext }),
      });
      const data = await resp.json();
      setResponse(data.text || data.error || 'Error al procesar');
    } catch (err) {
      setResponse('Error al conectar con el asesor IA. Intentá de nuevo.');
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1E1108 0%, #3A2818 100%)', borderRadius: 14, padding: 28, color: '#fff', marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'Fraunces',serif", fontSize: 20, color: '#F0C36C', marginBottom: 8 }}>Asesor Inteligente</h3>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', marginBottom: 16 }}>Claude analiza tus ventas, compras, stock y gastos para darte recomendaciones personalizadas.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {[['general', 'Informe General'], ['promos', 'Promociones'], ['compras', 'Qué Comprar'], ['costos', 'Optimizar Costos']].map(([id, label]) => (
            <button key={id} className={`btn btn-sm ${mode === id ? 'btn-p' : ''}`}
              style={mode !== id ? { background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)', border: '1px solid rgba(255,255,255,.15)' } : {}}
              onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <button className="btn btn-p" onClick={analyze} disabled={loading} style={{ padding: '12px 24px', fontSize: 14 }}>
          {loading ? 'Analizando...' : <>{I.brain} Analizar mi negocio</>}
        </button>
      </div>

      {loading && (
        <div className="card"><div className="card-b" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ marginBottom: 10 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg>
          </div>
          <div style={{ fontWeight: 600, color: 'var(--ac)' }}>Analizando datos del negocio...</div>
          <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 4 }}>Claude está revisando ventas, compras, stock y gastos</div>
        </div></div>
      )}

      {response && !loading && (
        <div className="card">
          <div className="card-h"><h3>Análisis y Recomendaciones</h3></div>
          <div className="card-b">
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7, color: 'var(--tx)' }}>{response}</div>
          </div>
        </div>
      )}
    </div>
  );
}

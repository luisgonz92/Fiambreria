'use client';
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from '../lib/supabase';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);
const fDate = (d) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fDateTime = (d) => new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CATEGORIES = ["Jamones", "Quesos", "Embutidos", "Aceitunas", "Lácteos", "Bebidas", "Enlatados", "Aderezos", "Fiambres", "Snacks", "Otros"];
const EXP_CATS = ["Alquiler", "Expensas", "Luz", "Gas", "Agua", "Internet", "Teléfono", "Sueldos", "Impuestos", "Seguros", "Mantenimiento", "Limpieza", "Transporte", "Publicidad", "Otros"];
const EXP_FREQ = [{ value: "unico", label: "Único" }, { value: "mensual", label: "Mensual" }, { value: "semanal", label: "Semanal" }];
const EXP_TYPE = [{ value: "fijo", label: "Fijo" }, { value: "variable", label: "Variable" }];
const UNITS = [{ value: "kg", label: "Kilogramo" }, { value: "g", label: "Gramo" }, { value: "und", label: "Unidad" }, { value: "lt", label: "Litro" }];
const unitLabel = (v) => UNITS.find(u => u.value === v)?.label || v;

const mapArt = (r) => ({ ...r, purchasePrice: Number(r.purchase_price)||0, salePrice: Number(r.sale_price)||0, marginPercent: Number(r.margin_percent)||30, minStock: Number(r.min_stock)||5, stock: Number(r.stock)||0, category: r.category_name||r.category||'Otros' });
const mapPurch = (r) => ({ ...r, supplier: r.supplier_name, invoiceNum: r.invoice_number, items: (r.purchase_invoice_items||[]).map(i => ({ articleId: i.article_id, articleName: i.article_name, quantity: Number(i.quantity), unit: i.unit, unitCost: Number(i.unit_cost), subtotal: Number(i.subtotal) })) });
const mapSale = (r) => ({ ...r, client: r.client_name, payMethod: r.pay_method_name||'Efectivo', items: (r.sale_ticket_items||[]).map(i => ({ articleId: i.article_id, articleName: i.article_name, quantity: Number(i.quantity), unit: i.unit, unitPrice: Number(i.unit_price), costPrice: Number(i.cost_price), subtotal: Number(i.subtotal), profit: Number(i.profit) })) });
const mapExp = (r) => ({ ...r, amount: Number(r.amount)||0 });

const db = {
  async getArticles() { const { data } = await supabase.from('v_articles').select('*'); return (data||[]).map(mapArt); },
  async insertArticle(a) { const { data: cats } = await supabase.from('categories').select('id,name'); const cat = (cats||[]).find(c => c.name === a.category); const { error } = await supabase.from('articles').insert({ name: a.name, category_id: cat?.id||null, units: a.units||['kg'], purchase_price: a.purchasePrice||0, margin_percent: a.marginPercent||30, sale_price: a.salePrice||0, stock: a.stock||0, min_stock: a.minStock||5 }); if (error) throw error; },
  async updateArticle(id, a) { const { data: cats } = await supabase.from('categories').select('id,name'); const cat = (cats||[]).find(c => c.name === a.category); await supabase.from('articles').update({ name: a.name, category_id: cat?.id||null, units: a.units||['kg'], purchase_price: a.purchasePrice||0, margin_percent: a.marginPercent||30, sale_price: a.salePrice||0, stock: a.stock||0, min_stock: a.minStock||5 }).eq('id', id); },
  async deleteArticle(id) { await supabase.from('articles').update({ active: false }).eq('id', id); },
  async getPurchases() { const { data } = await supabase.from('purchase_invoices').select('*, purchase_invoice_items(*)').order('date', { ascending: false }); return (data||[]).map(mapPurch); },
  async insertPurchase(p, items) { const { data: inv, error } = await supabase.from('purchase_invoices').insert({ supplier_name: p.supplier, invoice_number: p.invoiceNum, total: p.total }).select().single(); if (error) throw error; await supabase.from('purchase_invoice_items').insert(items.map(i => ({ purchase_invoice_id: inv.id, article_id: i.articleId, article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_cost: i.unitCost, subtotal: i.subtotal }))); },
  async updatePurchase(id, p, items) { await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', id); await supabase.from('purchase_invoices').update({ supplier_name: p.supplier, invoice_number: p.invoiceNum, total: p.total }).eq('id', id); await supabase.from('purchase_invoice_items').insert(items.map(i => ({ purchase_invoice_id: id, article_id: i.articleId, article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_cost: i.unitCost, subtotal: i.subtotal }))); },
  async deletePurchase(id) { await supabase.from('purchase_invoices').delete().eq('id', id); },
  async getSales() { const { data } = await supabase.from('sale_tickets').select('*, sale_ticket_items(*)').order('date', { ascending: false }); return (data||[]).map(mapSale); },
  async insertSale(s, items) { const { data: t, error } = await supabase.from('sale_tickets').insert({ client_name: s.client||'Consumidor Final', pay_method_name: s.payMethod||'Efectivo', total: s.total, cost_total: s.total-s.profit, profit: s.profit }).select().single(); if (error) throw error; await supabase.from('sale_ticket_items').insert(items.map(i => ({ sale_ticket_id: t.id, article_id: i.articleId, article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_price: i.unitPrice, cost_price: i.costPrice, subtotal: i.subtotal, profit: i.profit }))); },
  async updateSale(id, s, items) { await supabase.from('sale_ticket_items').delete().eq('sale_ticket_id', id); await supabase.from('sale_tickets').update({ client_name: s.client||'Consumidor Final', pay_method_name: s.payMethod||'Efectivo', total: s.total, cost_total: s.total-s.profit, profit: s.profit }).eq('id', id); await supabase.from('sale_ticket_items').insert(items.map(i => ({ sale_ticket_id: id, article_id: i.articleId, article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_price: i.unitPrice, cost_price: i.costPrice, subtotal: i.subtotal, profit: i.profit }))); },
  async deleteSale(id) { await supabase.from('sale_tickets').delete().eq('id', id); },
  async getExpenses() { const { data } = await supabase.from('expenses').select('*').eq('active', true).order('date', { ascending: false }); return (data||[]).map(mapExp); },
  async insertExpense(e) { await supabase.from('expenses').insert({ description: e.description, category: e.category, type: e.type, frequency: e.frequency, amount: e.amount }); },
  async updateExpense(id, e) { await supabase.from('expenses').update({ description: e.description, category: e.category, type: e.type, frequency: e.frequency, amount: e.amount }).eq('id', id); },
  async deleteExpense(id) { await supabase.from('expenses').update({ active: false }).eq('id', id); },
  async getPayMethods() { const { data } = await supabase.from('pay_methods').select('*').order('created_at'); return data||[]; },
  async insertPayMethod(pm) { await supabase.from('pay_methods').insert({ name: pm.name, active: pm.active }); },
  async updatePayMethod(id, pm) { await supabase.from('pay_methods').update({ name: pm.name, active: pm.active }).eq('id', id); },
  async deletePayMethod(id) { await supabase.from('pay_methods').delete().eq('id', id); },
};

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
  camera: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  loader: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>,
  wallet: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4h4v-4z"/></svg>,
  creditcard: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>,
  download: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>,
  brain: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 2a5 5 0 015 5c0 .8-.2 1.5-.5 2.2A5 5 0 0120 14a5 5 0 01-3 4.6V22h-2v-2h-6v2H7v-3.4A5 5 0 014 14a5 5 0 013.5-4.8A5 5 0 017 7a5 5 0 015-5z"/><path d="M12 2v8"/><path d="M8 8h8"/></svg>,
  lock: <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
};

// ============ CSS ============


// ============ MAIN APP ============
export default function App() {
  const [pg, setPg] = useState("dashboard");
  const [sOpen, setSOpen] = useState(false);
  const [articles, setArticles] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payMethods, setPayMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [a, s, p, e, pm] = await Promise.all([db.getArticles(), db.getSales(), db.getPurchases(), db.getExpenses(), db.getPayMethods()]);
      setArticles(a);
      setSales(s);
      setPurchases(p);
      setExpenses(e);
      setPayMethods(pm);
      setLoading(false);
    })();
  }, []);

  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const refresh = useCallback(async () => { const [a,s,p,e,pm] = await Promise.all([db.getArticles(),db.getSales(),db.getPurchases(),db.getExpenses(),db.getPayMethods()]); setArticles(a);setSales(s);setPurchases(p);setExpenses(e);setPayMethods(pm); }, []);

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: I.dashboard },
    { id: "inventory", label: "Inventario", icon: I.box },
    { id: "purchases", label: "Compras", icon: I.bag },
    { id: "sales", label: "Ventas", icon: I.cart },
    { id: "expenses", label: "Gastos", icon: I.wallet },
    { id: "reports", label: "Reportes", icon: I.chart },
    { id: "paymethods", label: "Medios de Pago", icon: I.creditcard },
    { id: "advisor", label: "Asesor IA", icon: I.brain },
  ];

  const lowStock = articles.filter(a => a.stock > 0 && a.stock <= (a.minStock || 5));
  const outStock = articles.filter(a => a.stock <= 0 && a.purchasePrice > 0);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)" }}>
            <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 30, fontWeight: 800, color: "#BF4A2A" }}>Fiambrería</div>
        <div style={{ color: "#A3937F", fontSize: 13, marginTop: 6 }}>Cargando sistema...</div>
      </div>
    </div>
  );

  return (
    <>
            <div className="app">
        <div className={`overlay ${sOpen ? "open" : ""}`} onClick={() => setSOpen(false)} />
        <aside className={`side ${sOpen ? "open" : ""}`}>
          <div className="side-hd">
            <div className="side-logo">La Fiambrería</div>
            <div className="side-sub">Sistema de Gestión</div>
          </div>
          <nav className="side-nav">
            {nav.map(n => (
              <div key={n.id} className={`nav-i ${pg === n.id ? "on" : ""}`} onClick={() => { setPg(n.id); setSOpen(false); }}>
                {n.icon}{n.label}
                {n.id === "inventory" && (lowStock.length + outStock.length > 0) && (
                  <span style={{ marginLeft: "auto", background: "#C43030", color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>
                    {lowStock.length + outStock.length}
                  </span>
                )}
              </div>
            ))}
          </nav>
          <div className="side-ft">v3.3 · Datos compartidos</div>
        </aside>

        <main className="main">
          <header className="top">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="mob-btn" onClick={() => setSOpen(true)}>{I.menu}</button>
              <h1>{nav.find(n => n.id === pg)?.label}</h1>
            </div>
            <span style={{ fontSize: 12, color: "var(--tx3)" }}>{fDate(new Date())}</span>
          </header>
          <div className="page">
            {pg === "dashboard" && <Dashboard articles={articles} sales={sales} purchases={purchases} expenses={expenses} setPg={setPg} lowStock={lowStock} outStock={outStock} />}
            {pg === "inventory" && <InventoryPage articles={articles} refresh={refresh} notify={notify} />}
            {pg === "purchases" && <PurchasesPage articles={articles} purchases={purchases} refresh={refresh} notify={notify} />}
            {pg === "sales" && <SalesPage articles={articles} sales={sales} refresh={refresh} payMethods={payMethods} notify={notify} />}
            {pg === "expenses" && <ExpensesPage expenses={expenses} refresh={refresh} notify={notify} />}
            {pg === "reports" && <ReportsPage articles={articles} sales={sales} purchases={purchases} expenses={expenses} payMethods={payMethods} />}
            {pg === "paymethods" && <PayMethodsPage payMethods={payMethods} refresh={refresh} notify={notify} />}
            {pg === "advisor" && <AIAdvisorPage articles={articles} sales={sales} purchases={purchases} expenses={expenses} />}
          </div>
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

// ============ DASHBOARD ============
function Dashboard({ articles, sales, purchases, expenses, setPg, lowStock, outStock }) {
  const today = new Date().toDateString();
  const tSales = sales.filter(s => new Date(s.date).toDateString() === today);
  const tRev = tSales.reduce((a, s) => a + s.total, 0);
  const tProfit = tSales.reduce((a, s) => a + s.profit, 0);
  const allRev = sales.reduce((a, s) => a + s.total, 0);
  const allProfit = sales.reduce((a, s) => a + s.profit, 0);
  const allExpense = purchases.reduce((a, p) => a + p.total, 0);
  const allGastos = expenses.reduce((a, e) => a + (e.amount || 0), 0);
  const netResult = allProfit - allGastos;
  const recent5 = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  const recentP = [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  return (
    <div>
      {(lowStock.length > 0 || outStock.length > 0) && (
        <div className={`alert-banner ${outStock.length > 0 ? "alert-r" : "alert-y"}`}>
          {I.warn}
          <span>
            {outStock.length > 0 && <strong>{outStock.length} artículo(s) sin stock. </strong>}
            {lowStock.length > 0 && <span>{lowStock.length} con stock bajo: {lowStock.slice(0, 3).map(a => a.name).join(", ")}{lowStock.length > 3 ? "..." : ""}</span>}
          </span>
          <button className="btn btn-sm btn-s" style={{ marginLeft: "auto" }} onClick={() => setPg("inventory")}>Ver inventario</button>
        </div>
      )}
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Ventas Hoy</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{money(tRev)}</div><div className="kpi-s">{tSales.length} ticket(s)</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Ganancia Bruta</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(allProfit)}</div><div className="kpi-s">de {money(allRev)} en ventas</div></div>
        <div className="kpi kpi-r"><div className="kpi-l">Gastos Operativos</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(allGastos)}</div><div className="kpi-s">{expenses.length} gastos registrados</div></div>
        <div className={`kpi ${netResult >= 0 ? "kpi-v" : "kpi-r"}`}><div className="kpi-l">Resultado Neto</div><div className="kpi-val" style={{ color: netResult >= 0 ? "var(--gn)" : "var(--rd)" }}>{money(netResult)}</div><div className="kpi-s">Bruta - Gastos</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <div className="card-h"><h3>Últimas Ventas</h3><button className="btn btn-sm btn-s" onClick={() => setPg("sales")}>Ver todas {I.arrow}</button></div>
          <div style={{ padding: 0 }}>
            {recent5.length === 0 ? <div className="empty"><p>Sin ventas aún</p></div> : (
              <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Total</th><th>Ganancia</th></tr></thead>
                <tbody>{recent5.map(s => (
                  <tr key={s.id}><td style={{ fontSize: 12 }}>{fDateTime(s.date)}</td><td>{s.client || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{money(s.total)}</td><td><span className="badge b-gn">{money(s.profit)}</span></td></tr>
                ))}</tbody></table>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h3>Últimas Compras</h3><button className="btn btn-sm btn-s" onClick={() => setPg("purchases")}>Ver todas {I.arrow}</button></div>
          <div style={{ padding: 0 }}>
            {recentP.length === 0 ? <div className="empty"><p>Sin compras aún</p></div> : (
              <table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Total</th></tr></thead>
                <tbody>{recentP.map(p => (
                  <tr key={p.id}><td style={{ fontSize: 12 }}>{fDateTime(p.date)}</td><td>{p.supplier}</td>
                    <td>{p.invoiceNum || "—"}</td><td style={{ fontWeight: 600 }}>{money(p.total)}</td></tr>
                ))}</tbody></table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ INVENTORY (ARTICLES) ============
function InventoryPage({ articles, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [catF, setCatF] = useState("");
  const [sort, setSort] = useState("name");

  const filtered = articles
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()) && (!catF || a.category === catF))
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stock-low") return a.stock - b.stock;
      if (sort === "stock-high") return b.stock - a.stock;
      if (sort === "price") return (b.salePrice || 0) - (a.salePrice || 0);
      return 0;
    });

  const totalVal = articles.reduce((s, a) => s + (a.stock * (a.salePrice || 0)), 0);
  const totalCost = articles.reduce((s, a) => s + (a.stock * (a.purchasePrice || 0)), 0);

  const blank = { name: "", category: "Otros", units: ["kg"], marginPercent: 30, minStock: 5, stock: 0, purchasePrice: 0, salePrice: 0 };

  const [delConfirm, setDelConfirm] = useState(null);

  const handleSave = async (art) => {
    const dupCheck = articles.find(a => a.id !== art.id && a.name.trim().toLowerCase() === art.name.trim().toLowerCase());
    if (dupCheck) { notify("⚠ Ya existe un artículo con ese nombre: " + dupCheck.name); return; }
    try {
      if (art.id) { await db.updateArticle(art.id, art); notify("Artículo actualizado"); }
      else { await db.insertArticle(art); notify("Artículo creado"); }
      await refresh(); setModal(null);
    } catch(e) { notify("Error: "+e.message); }
  };

  const handleDel = async (id) => { await db.deleteArticle(id); await refresh(); notify("Artículo eliminado"); setDelConfirm(null); };

  const stockStatus = (a) => {
    if (a.stock <= 0 && a.purchasePrice > 0) return "out";
    if (a.stock <= (a.minStock || 5) && a.purchasePrice > 0) return "low";
    return "ok";
  };

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Total Artículos</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{articles.length}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Valor Inventario (Venta)</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(totalVal)}</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Costo Inventario</div><div className="kpi-val">{money(totalCost)}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Ganancia Potencial</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(totalVal - totalCost)}</div></div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="sb">{I.search}<input className="fi" placeholder="Buscar artículo..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select className="fs" style={{ width: "auto" }} value={catF} onChange={e => setCatF(e.target.value)}><option value="">Todas</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          <select className="fs" style={{ width: "auto" }} value={sort} onChange={e => setSort(e.target.value)}>
            <option value="name">Nombre</option><option value="stock-low">Stock ↑</option><option value="stock-high">Stock ↓</option><option value="price">Precio ↓</option>
          </select>
        </div>
        <button className="btn btn-p" onClick={() => setModal({ ...blank })}>{I.plus} Nuevo Artículo</button>
      </div>

      <div className="card">
        <div style={{ padding: 0 }}><div className="tw">
          <table>
            <thead><tr><th>Artículo</th><th>Categoría</th><th>Unidades</th><th>P. Compra</th><th>Margen</th><th>P. Venta</th><th>Stock</th><th>Estado</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={9}><div className="empty"><p>No hay artículos{search ? " para esta búsqueda" : ". ¡Creá el primero!"}</p></div></td></tr> :
                filtered.map(a => {
                  const st = stockStatus(a);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td><span className="badge b-ac">{a.category}</span></td>
                      <td style={{ fontSize: 12 }}>{(a.units || []).map(unitLabel).join(", ")}</td>
                      <td>{a.purchasePrice ? money(a.purchasePrice) : <span style={{ color: "var(--tx3)", fontSize: 11 }}>Pendiente</span>}</td>
                      <td><span className="badge b-gn">{a.marginPercent}%</span></td>
                      <td style={{ fontWeight: 600, color: "var(--ac)" }}>{a.salePrice ? money(a.salePrice) : "—"}</td>
                      <td style={{ fontWeight: 600 }}>{a.stock} {(a.units || [])[0] || ""}</td>
                      <td>
                        {a.purchasePrice > 0 ? (
                          <span className={`badge ${st === "ok" ? "b-gn" : st === "low" ? "b-yw" : "b-rd"}`}>
                            <span className={`stock-dot ${st === "ok" ? "stock-ok" : st === "low" ? "stock-low" : "stock-out"}`}></span>
                            {st === "ok" ? "OK" : st === "low" ? "Bajo" : "Sin Stock"}
                          </span>
                        ) : <span style={{ color: "var(--tx3)", fontSize: 11 }}>Sin movimiento</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn-i" onClick={() => setModal({ ...a })}>{I.edit}</button>
                          {delConfirm === a.id ? (
                            <><button className="btn-i" onClick={() => handleDel(a.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                            <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                          ) : (
                            <button className="btn-i" onClick={() => setDelConfirm(a.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div></div>
      </div>

      {modal && <ArticleModal art={modal} articles={articles} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
}

function ArticleModal({ art, articles, onSave, onClose }) {
  const [f, setF] = useState({ ...art, units: art.units || ["kg"] });
  const [priceMode, setPriceMode] = useState("margin"); // "margin" or "sale"

  const calcSalePrice = (pp, mp) => Math.round((pp || 0) * (1 + (mp || 0) / 100) * 100) / 100;
  const calcMargin = (pp, sp) => pp > 0 ? Math.round(((sp - pp) / pp) * 100 * 10) / 10 : 0;

  const set = (k, v) => {
    const upd = { ...f, [k]: v };
    if (k === "purchasePrice") {
      upd.salePrice = calcSalePrice(v, upd.marginPercent);
    } else if (k === "marginPercent") {
      upd.salePrice = calcSalePrice(upd.purchasePrice, v);
    } else if (k === "salePrice") {
      upd.marginPercent = calcMargin(upd.purchasePrice, v);
    }
    setF(upd);
  };

  const toggleUnit = (u) => {
    const units = f.units.includes(u) ? f.units.filter(x => x !== u) : [...f.units, u];
    if (units.length > 0) setF(p => ({ ...p, units }));
  };

  const isDup = f.name.trim() && articles.some(a => a.id !== f.id && a.name.trim().toLowerCase() === f.name.trim().toLowerCase());

  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{f.id ? "Editar" : "Nuevo"} Artículo</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg">
            <label className="fl">Nombre del Artículo</label>
            <input className="fi" value={f.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Jamón Crudo Paladini" />
            {isDup && <div className="dup-warn">{I.warn} Ya existe un artículo con este nombre. No se podrá guardar duplicado.</div>}
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Categoría</label>
              <select className="fs" value={f.category} onChange={e => set("category", e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="fg">
              <label className="fl">Unidades de Medida (múltiples)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {UNITS.map(u => (
                  <button key={u.value} type="button" className={`btn btn-sm ${f.units.includes(u.value) ? "btn-p" : "btn-s"}`} onClick={() => toggleUnit(u.value)}>
                    {f.units.includes(u.value) && I.check} {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="fr3">
            <div className="fg">
              <label className="fl">Precio Compra</label>
              <input className="fi" type="number" step="0.01" min="0" value={f.purchasePrice || ""} onChange={e => set("purchasePrice", parseFloat(e.target.value) || 0)} placeholder="0.00" />
              <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, display: "block" }}>Editable · Se actualiza con facturas de compra</span>
            </div>
            <div className="fg">
              <label className="fl">Margen Ganancia (%)</label>
              <input className="fi" type="number" step="0.1" min="0" value={f.marginPercent} onChange={e => set("marginPercent", parseFloat(e.target.value) || 0)} />
              <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, display: "block" }}>Editar margen recalcula P.Venta</span>
            </div>
            <div className="fg">
              <label className="fl">Precio Venta</label>
              <input className="fi" type="number" step="0.01" min="0" value={f.salePrice || ""} onChange={e => set("salePrice", parseFloat(e.target.value) || 0)} placeholder="0.00" />
              <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, display: "block" }}>Editar precio recalcula margen</span>
            </div>
          </div>
          <div className="fr">
            <div className="fg"><label className="fl">Stock Actual</label><input className="fi" type="number" step="0.01" min="0" value={f.stock} onChange={e => setF(p => ({ ...p, stock: parseFloat(e.target.value) || 0 }))} /><span style={{ fontSize: 10, color: "var(--tx3)", display: "block", marginTop: 2 }}>Ajustable manualmente · Se actualiza con compras y ventas</span></div>
            <div className="fg"><label className="fl">Stock Mínimo (alerta)</label><input className="fi" type="number" step="0.01" min="0" value={f.minStock || 5} onChange={e => setF(p => ({ ...p, minStock: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={!f.name.trim() || isDup} onClick={() => onSave({ ...f, salePrice: f.salePrice || 0 })}>
            {f.id ? "Guardar Cambios" : "Crear Artículo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ PURCHASES ============
function PurchasesPage({ articles, purchases, refresh, notify }) {
  const [modal, setModal] = useState(false);
  const [editPurch, setEditPurch] = useState(null);
  const [view, setView] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const sorted = useMemo(() => [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date)), [purchases]);

  const handleSave = async (data) => {
    const { _newArticles: newArts, _editId, ...purchaseData } = data;
    try {
      for (const art of (newArts||[])) { try { await db.insertArticle(art); } catch(e) { console.error(e); } }
      if (_editId) {
        await db.updatePurchase(_editId, purchaseData, purchaseData.items);
        notify("Compra actualizada");
      } else {
        await db.insertPurchase(purchaseData, purchaseData.items);
        notify("Compra registrada: " + money(purchaseData.total));
      }
      await refresh();
    } catch(e) { notify("Error: "+e.message); }
    setModal(false); setEditPurch(null);
  };

  const handleDel = async (id) => {
    const p = purchases.find(x => x.id === id);
    if (!p) return;
    if (isPrevMonth(p.date)) { notify("⚠ No se puede eliminar: período cerrado"); setDelConfirm(null); return; }
    await db.deletePurchase(id);
    await refresh();
    setDelConfirm(null);
    notify("Compra eliminada · Stock revertido");
  };

  const openEdit = (p) => {
    if (isPrevMonth(p.date)) { notify("⚠ No se puede editar: período cerrado"); return; }
    setEditPurch(p);
    setModal(true);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        <div />
        <button className="btn btn-p" onClick={() => { setEditPurch(null); setModal(true); }}>{I.plus} Nueva Compra</button>
      </div>
      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Artículos</th><th>Total</th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {sorted.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay compras. Registrá tu primera factura.</p></div></td></tr> :
              sorted.map((p, i) => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: "var(--tx3)" }}>#{sorted.length - i}</td>
                  <td style={{ fontSize: 12 }}>{fDateTime(p.date)}</td>
                  <td style={{ fontWeight: 500 }}>{p.supplier}</td>
                  <td>{p.invoiceNum || "—"}</td>
                  <td>{p.items.length}</td>
                  <td style={{ fontWeight: 600 }}>{money(p.total)}</td>
                  <td><div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button className="btn-i" onClick={() => setView(p)}>{I.eye}</button>
                    {isPrevMonth(p.date) ? <span className="lock-badge">{I.lock} Cerrado</span> : (<>
                      <button className="btn-i" onClick={() => openEdit(p)}>{I.edit}</button>
                      {delConfirm === p.id ? (
                        <><button className="btn-i" onClick={() => handleDel(p.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                        <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                      ) : (
                        <button className="btn-i" onClick={() => setDelConfirm(p.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>
                      )}
                    </>)}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      {modal && <PurchaseModal articles={articles} editData={editPurch} onSave={handleSave} onClose={() => { setModal(false); setEditPurch(null); }} />}
      {view && (
        <div className="mo" onClick={() => setView(null)}>
          <div className="md" onClick={e => e.stopPropagation()}>
            <div className="md-h"><h2>Detalle de Compra</h2><button className="btn-i" onClick={() => setView(null)}>{I.x}</button></div>
            <div className="md-b">
              <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 13, color: "var(--tx2)", flexWrap: "wrap" }}>
                <span>Fecha: <strong>{fDateTime(view.date)}</strong></span>
                <span>Proveedor: <strong>{view.supplier}</strong></span>
                <span>Factura: <strong>{view.invoiceNum || "—"}</strong></span>
              </div>
              <table><thead><tr><th>Artículo</th><th>Cant.</th><th>Unidad</th><th>Costo Unit.</th><th>Subtotal</th></tr></thead>
                <tbody>{view.items.map((it, i) => (
                  <tr key={i}><td style={{ fontWeight: 500 }}>{it.articleName}</td><td>{it.quantity}</td><td>{unitLabel(it.unit)}</td><td>{money(it.unitCost)}</td><td style={{ fontWeight: 600 }}>{money(it.subtotal)}</td></tr>
                ))}</tbody></table>
              <div className="tt" style={{ marginTop: 14 }}><span className="tt-l">Total Compra</span><span className="tt-v">{money(view.total)}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseModal({ articles, editData, onSave, onClose }) {
  const [supplier, setSupplier] = useState(editData?.supplier || "");
  const [invoiceNum, setInvoiceNum] = useState(editData?.invoiceNum || "");
  const [items, setItems] = useState(editData ? editData.items.map(it => ({ ...it, _key: uid() })) : []);
  const [q, setQ] = useState("");
  const [showDD, setShowDD] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [scanMsg, setScanMsg] = useState(null);
  const [newArticles, setNewArticles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newArt, setNewArt] = useState({ name: "", category: "Otros", units: ["kg"], marginPercent: 30, minStock: 5, stock: 0, purchasePrice: 0, salePrice: 0 });
  const [linkIdx, setLinkIdx] = useState(-1);
  const [linkQ, setLinkQ] = useState("");

  const allArticles = useMemo(() => [...articles, ...newArticles], [articles, newArticles]);
  const avail = q ? allArticles.filter(a => (a.name || "").toLowerCase().includes(q.toLowerCase()) && !items.find(i => i.articleId === a.id)) : [];

  const addExisting = (id, name, units, price) => {
    setItems(prev => [...prev, { _key: uid(), articleId: id, articleName: name, unit: (units || ["kg"])[0], quantity: 1, unitCost: price || 0, subtotal: price || 0, isNew: false }]);
    setQ(""); setShowDD(false);
  };

  const updItem = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const upd = { ...it, [key]: val };
      if (key === "quantity" || key === "unitCost") upd.subtotal = (upd.quantity || 0) * (upd.unitCost || 0);
      return upd;
    }));
    if (key === "articleName") {
      const artId = items[idx]?.articleId;
      const na = artId && newArticles.find(a => a.id === artId);
      if (na) setNewArticles(prev => prev.map(a => a.id === artId ? { ...a, name: val } : a));
    }
  };

  const doLink = (idx, a) => {
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, articleId: a.id, articleName: a.name || "", unit: (a.units || ["kg"])[0], unitCost: a.purchasePrice || 0, subtotal: (it.quantity || 1) * (a.purchasePrice || 0), isNew: false }));
    setLinkIdx(-1); setLinkQ("");
  };

  const total = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const isDupName = (name) => allArticles.some(a => (a.name || "").trim().toLowerCase() === name.trim().toLowerCase());

  const handleInlineCreate = () => {
    if (!newArt.name.trim() || isDupName(newArt.name)) return;
    const art = { ...newArt, id: uid(), createdAt: new Date().toISOString(), salePrice: Math.round((newArt.purchasePrice || 0) * (1 + (newArt.marginPercent || 30) / 100) * 100) / 100 };
    setNewArticles(prev => [...prev, art]);
    setItems(prev => [...prev, { _key: uid(), articleId: art.id, articleName: art.name, unit: (art.units || ["kg"])[0], quantity: 1, unitCost: art.purchasePrice || 0, subtotal: art.purchasePrice || 0, isNew: true }]);
    setNewArt({ name: "", category: "Otros", units: ["kg"], marginPercent: 30, minStock: 5, stock: 0, purchasePrice: 0, salePrice: 0 });
    setShowCreate(false);
  };

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setScanPreview(dataUrl); setScanning(true); setScanMsg("Analizando factura con IA...");
      try {
        const base64 = dataUrl.split(",")[1];
        const resp = await fetch("/api/scan-invoice", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mimeType: file.type })
        });
        if (!resp.ok) throw new Error("Error al procesar");
        const parsed = await resp.json();
        if (parsed.supplier) setSupplier(parsed.supplier);
        if (parsed.invoiceNum) setInvoiceNum(parsed.invoiceNum);
        let created = 0; const newArts = [], newItems = [], currentAll = [...allArticles];
        (parsed.items || []).forEach(pi => {
          if (!pi.name) return;
          let art = currentAll.find(a => (a.name||"").toLowerCase().trim() === pi.name.toLowerCase().trim());
          if (!art) {
            art = { id: uid(), name: pi.name.trim(), category: "Otros", units: [pi.unit || "kg"], marginPercent: 30, minStock: 5, stock: 0, purchasePrice: pi.unitCost || 0, salePrice: Math.round((pi.unitCost || 0) * 1.3 * 100) / 100, createdAt: new Date().toISOString() };
            newArts.push(art); currentAll.push(art); created++;
          }
          newItems.push({ _key: uid(), articleId: art.id, articleName: art.name, unit: pi.unit || (art.units || ["kg"])[0], quantity: pi.quantity || 1, unitCost: pi.unitCost || art.purchasePrice || 0, subtotal: (pi.quantity || 1) * (pi.unitCost || art.purchasePrice || 0), isNew: !articles.find(a => a.id === art.id) });
        });
        if (newArts.length > 0) setNewArticles(prev => [...prev, ...newArts]);
        setItems(prev => [...prev, ...newItems]);
        setScanMsg(`${newItems.length} artículo(s) detectados${created > 0 ? ` · ${created} nuevo(s)` : ""}`);
      } catch (err) { console.error(err); setScanMsg("Error al analizar. Cargá manualmente."); }
      setScanning(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    const resolvedItems = items.map(({ isNew, _key, ...rest }) => ({
      ...rest,
      articleName: rest.articleName || allArticles.find(a => a.id === rest.articleId)?.name || ""
    }));
    onSave({ supplier, invoiceNum, items: resolvedItems, total, _newArticles: newArticles, _editId: editData?.id || null });
  };

  const linkResults = linkQ ? allArticles.filter(a => (a.name || "").toLowerCase().includes(linkQ.toLowerCase())).slice(0, 6) : [];

  return (
    <div className="mo" onClick={onClose}>
      <div className="md md-lg" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{editData ? "Editar" : "Registrar"} Factura de Compra</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          {!editData && !scanning && !scanMsg && (
            <div className={`scan-zone ${dragging ? "dragging" : ""}`}
              onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment"; inp.onchange = (ev) => handleFile(ev.target.files[0]); inp.click(); }}
              onDrop={(ev) => { ev.preventDefault(); setDragging(false); if (ev.dataTransfer.files[0]) handleFile(ev.dataTransfer.files[0]); }}
              onDragOver={(ev) => { ev.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}>
              <div style={{ marginBottom: 8, color: "var(--ac)" }}>{I.camera}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Escaneá tu factura con IA</div>
              <div style={{ fontSize: 12, color: "var(--tx3)" }}>Foto o arrastrá imagen</div>
            </div>
          )}
          {scanning && (
            <div className="scan-loading">
              {scanPreview && <img src={scanPreview} className="scan-preview" alt="" />}
              <div className="scan-spin"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg></div>
              <div className="scan-pulse" style={{ fontWeight: 600, color: "var(--ac)" }}>Analizando...</div>
            </div>
          )}
          {scanMsg && !scanning && (
            <div className="scan-result">{I.check}<span>{scanMsg}</span>
              <button className="btn btn-sm btn-s" style={{ marginLeft: "auto" }} onClick={() => { setScanMsg(null); setScanPreview(null); }}>Escanear otra</button>
            </div>
          )}

          <div style={{ borderTop: scanMsg || scanning ? "1px solid var(--br)" : "none", paddingTop: scanMsg || scanning ? 14 : 0, marginTop: scanMsg || scanning ? 14 : 0 }}>
            <div className="fr">
              <div className="fg"><label className="fl">Proveedor</label><input className="fi" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Nombre del proveedor" /></div>
              <div className="fg"><label className="fl">Nº Factura</label><input className="fi" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="Ej: FAC-0001" /></div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
              <div className="fg" style={{ position: "relative", flex: 1, marginBottom: 0 }}>
                <label className="fl">Agregar Artículo existente</label>
                <input className="fi" placeholder="Buscar artículo..." value={q}
                  onChange={e => { setQ(e.target.value); setShowDD(true); }}
                  onFocus={() => q && setShowDD(true)}
                  onBlur={() => setTimeout(() => setShowDD(false), 250)} />
                {showDD && avail.length > 0 && (
                  <div className="dd">
                    {avail.slice(0, 8).map(a => (
                      <div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addExisting(a.id, a.name, a.units, a.purchasePrice); }}>
                        <span>{a.name} <span style={{ color: "var(--tx3)", fontSize: 11 }}>({(a.units || []).map(unitLabel).join(", ")})</span></span>
                        {a.purchasePrice > 0 && <span style={{ fontSize: 12, color: "var(--tx3)" }}>Últ: {money(a.purchasePrice)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn btn-s" style={{ whiteSpace: "nowrap", marginBottom: 0 }} onClick={() => setShowCreate(!showCreate)}>{I.plus} Crear Artículo</button>
            </div>

            {showCreate && (
              <div className="inline-create">
                <h4>Crear Artículo Rápido</h4>
                <div className="fr3">
                  <div className="fg"><label className="fl">Nombre</label><input className="fi" value={newArt.name} onChange={e => setNewArt(p => ({ ...p, name: e.target.value }))} placeholder="Nombre" />
                    {newArt.name.trim() && isDupName(newArt.name) && <div className="dup-warn">{I.warn} Ya existe</div>}
                  </div>
                  <div className="fg"><label className="fl">Categoría</label><select className="fs" value={newArt.category} onChange={e => setNewArt(p => ({ ...p, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                  <div className="fg"><label className="fl">Unidad</label><select className="fs" value={newArt.units[0]} onChange={e => setNewArt(p => ({ ...p, units: [e.target.value] }))}>{UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select></div>
                </div>
                <div className="fr3">
                  <div className="fg"><label className="fl">P. Compra</label><input className="fi" type="number" step="0.01" min="0" value={newArt.purchasePrice || ""} onChange={e => setNewArt(p => ({ ...p, purchasePrice: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="fg"><label className="fl">Margen %</label><input className="fi" type="number" step="1" min="0" value={newArt.marginPercent} onChange={e => setNewArt(p => ({ ...p, marginPercent: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="fg"><label className="fl">Stock</label><input className="fi" type="number" step="0.01" min="0" value={newArt.stock || ""} onChange={e => setNewArt(p => ({ ...p, stock: parseFloat(e.target.value) || 0 }))} /></div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn btn-p btn-sm" disabled={!newArt.name.trim() || isDupName(newArt.name)} onClick={handleInlineCreate}>{I.check} Crear y Agregar</button>
                  <button className="btn btn-s btn-sm" onClick={() => setShowCreate(false)}>Cancelar</button>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <>
                <div className="ti">
                  <div className="ti-r ti-h" style={{ gridTemplateColumns: "2fr 70px 90px 100px 100px 36px" }}><span>Artículo</span><span>Cant.</span><span>Unidad</span><span>Costo U.</span><span>Subtotal</span><span></span></div>
                  {items.map((it, idx) => {
                    const resolvedName = it.articleName || allArticles.find(a => a.id === it.articleId)?.name || "";
                    return (
                    <div className="ti-r" key={it._key || it.articleId || idx} style={{ gridTemplateColumns: "2fr 70px 90px 100px 100px 36px" }}>
                      <div>
                        {it.isNew ? (
                          <input className="fi" value={resolvedName} onChange={e => updItem(idx, "articleName", e.target.value)} style={{ padding: "4px 7px", fontSize: 12, fontWeight: 500 }} />
                        ) : (
                          <div style={{ fontWeight: 500, fontSize: 12, padding: "4px 0", minHeight: 24 }}>{resolvedName}</div>
                        )}
                        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                          {it.isNew && <span className="scan-new">NUEVO</span>}
                          <button className="btn-i" title="Vincular a artículo existente" onClick={() => { setLinkIdx(linkIdx === idx ? -1 : idx); setLinkQ(""); }} style={{ padding: 2, color: linkIdx === idx ? "var(--ac)" : "var(--tx3)", fontSize: 10 }}>{I.search}</button>
                        </div>
                        {linkIdx === idx && (
                          <div style={{ marginTop: 4 }}>
                            <input className="fi" placeholder="Buscar artículo para vincular..." value={linkQ} onChange={e => setLinkQ(e.target.value)}
                              style={{ padding: "4px 8px", fontSize: 11, background: "var(--acL)", border: "1px solid var(--ac)" }} autoFocus />
                            {linkResults.length > 0 && (
                              <div style={{ border: "1px solid var(--br)", borderRadius: "0 0 8px 8px", background: "var(--bg2)", maxHeight: 150, overflowY: "auto" }}>
                                {linkResults.map(a => (
                                  <div key={a.id} className="dd-i" onClick={() => doLink(idx, a)}>
                                    <span style={{ fontSize: 12 }}>{a.name}</span>
                                    <span style={{ fontSize: 10, color: "var(--tx3)" }}>{money(a.purchasePrice)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, "quantity", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12 }} />
                      <select className="fs" value={it.unit} onChange={e => updItem(idx, "unit", e.target.value)} style={{ padding: "5px 7px", fontSize: 12 }}>
                        {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <input className="fi" type="number" step="0.01" min="0" value={it.unitCost} onChange={e => updItem(idx, "unitCost", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12 }} />
                      <span style={{ fontWeight: 600 }}>{money(it.subtotal)}</span>
                      <button className="btn-i" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--rd)", border: "none", padding: 3 }}>{I.trash}</button>
                    </div>
                    );
                  })}
                </div>
                <div className="tt"><span className="tt-l">Total Factura</span><span className="tt-v">{money(total)}</span></div>
              </>
            )}
          </div>
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={items.length === 0 || !supplier.trim() || scanning} onClick={handleSave}>{editData ? "Guardar Cambios" : "Registrar Compra"}</button>
        </div>
      </div>
    </div>
  );
}

// ============ SALES ============
function SalesPage({ articles, sales, refresh, payMethods, notify }) {
  const [modal, setModal] = useState(false);
  const [editSale, setEditSale] = useState(null);
  const [view, setView] = useState(null);
  const [search, setSearch] = useState("");
  const [pmFilter, setPmFilter] = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  const sorted = useMemo(() => [...sales].sort((a, b) => new Date(b.date) - new Date(a.date)), [sales]);
  const filtered = sorted.filter(s =>
    ((s.client || "").toLowerCase().includes(search.toLowerCase()) || s.items.some(i => (i.articleName || "").toLowerCase().includes(search.toLowerCase())))
    && (!pmFilter || s.payMethod === pmFilter)
  );
  const activePM = payMethods.filter(pm => pm.active);

  const handleSave = async (data) => {
    const { _editId, ...saleData } = data;
    try {
      if (_editId) {
        await db.updateSale(_editId, saleData, saleData.items);
        notify("Venta actualizada");
      } else {
        await db.insertSale(saleData, saleData.items);
        notify("Venta registrada: " + money(saleData.total));
      }
      await refresh();
    } catch(e) { notify("Error: "+e.message); }
    setModal(false); setEditSale(null);
  };

  const handleDel = async (id) => {
    const s = sales.find(x => x.id === id);
    if (!s) return;
    if (isPrevMonth(s.date)) { notify("⚠ No se puede eliminar: período cerrado"); setDelConfirm(null); return; }
    await db.deleteSale(id);
    await refresh();
    setDelConfirm(null);
    notify("Venta eliminada · Stock revertido");
  };

  const openEdit = (s) => {
    if (isPrevMonth(s.date)) { notify("⚠ No se puede editar: período cerrado"); return; }
    setEditSale(s); setModal(true);
  };

  const pmName = (id) => payMethods.find(pm => pm.id === id)?.name || id || "—";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div className="sb">{I.search}<input className="fi" placeholder="Buscar por cliente o artículo..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select className="fs" style={{ width: "auto" }} value={pmFilter} onChange={e => setPmFilter(e.target.value)}>
            <option value="">Todos los pagos</option>
            {payMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
          </select>
        </div>
        <button className="btn btn-p" onClick={() => { setEditSale(null); setModal(true); }}>{I.plus} Nueva Venta</button>
      </div>
      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Ganancia</th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay ventas registradas</p></div></td></tr> :
              filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: "var(--tx3)" }}>#{sorted.length - sorted.indexOf(s)}</td>
                  <td style={{ fontSize: 12 }}>{fDateTime(s.date)}</td>
                  <td style={{ fontWeight: 500 }}>{s.client || "—"}</td>
                  <td><span className="pm-badge">{pmName(s.payMethod)}</span></td>
                  <td style={{ fontWeight: 600 }}>{money(s.total)}</td>
                  <td><span className="badge b-gn">{money(s.profit)}</span></td>
                  <td><div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <button className="btn-i" onClick={() => setView(s)}>{I.eye}</button>
                    {isPrevMonth(s.date) ? <span className="lock-badge">{I.lock} Cerrado</span> : (<>
                      <button className="btn-i" onClick={() => openEdit(s)}>{I.edit}</button>
                      {delConfirm === s.id ? (
                        <><button className="btn-i" onClick={() => handleDel(s.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                        <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                      ) : (
                        <button className="btn-i" onClick={() => setDelConfirm(s.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>
                      )}
                    </>)}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      {modal && <SaleModal articles={articles} payMethods={activePM} editData={editSale} onSave={handleSave} onClose={() => { setModal(false); setEditSale(null); }} />}
      {view && (
        <div className="mo" onClick={() => setView(null)}>
          <div className="md" onClick={e => e.stopPropagation()}>
            <div className="md-h"><h2>Detalle de Venta</h2><button className="btn-i" onClick={() => setView(null)}>{I.x}</button></div>
            <div className="md-b">
              <div style={{ display: "flex", gap: 20, marginBottom: 14, fontSize: 13, color: "var(--tx2)", flexWrap: "wrap" }}>
                <span>Fecha: <strong>{fDateTime(view.date)}</strong></span>
                <span>Cliente: <strong>{view.client || "Sin especificar"}</strong></span>
                <span>Pago: <strong><span className="pm-badge">{pmName(view.payMethod)}</span></strong></span>
              </div>
              <table><thead><tr><th>Artículo</th><th>Cant.</th><th>Unidad</th><th>P. Venta</th><th>Subtotal</th><th>Ganancia</th></tr></thead>
                <tbody>{view.items.map((it, i) => (
                  <tr key={i}><td style={{ fontWeight: 500 }}>{it.articleName}</td><td>{it.quantity}</td><td>{unitLabel(it.unit)}</td><td>{money(it.unitPrice)}</td><td style={{ fontWeight: 600 }}>{money(it.subtotal)}</td><td><span className="badge b-gn">{money(it.profit)}</span></td></tr>
                ))}</tbody></table>
              <div className="tt" style={{ marginTop: 14 }}>
                <div><span className="tt-l">Total</span><div style={{ fontSize: 12, color: "var(--gn)", marginTop: 2 }}>Ganancia: {money(view.profit)}</div></div>
                <span className="tt-v">{money(view.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaleModal({ articles, payMethods, editData, onSave, onClose }) {
  const [client, setClient] = useState(editData?.client || "");
  const [payMethod, setPayMethod] = useState(editData?.payMethod || payMethods[0]?.id || "");
  const [promo, setPromo] = useState(false);
  const [items, setItems] = useState(() => {
    if (!editData) return [];
    return editData.items.map(it => ({ ...it, origPrice: it.unitPrice }));
  });
  const [q, setQ] = useState("");
  const [showDD, setShowDD] = useState(false);

  const avail = q ? articles.filter(a => a.name && a.name.toLowerCase().includes(q.toLowerCase()) && a.salePrice > 0 && !items.find(i => i.articleId === a.id)) : [];

  const addExisting = (id, name, units, salePrice, purchasePrice, stock) => {
    setItems(prev => [...prev, {
      articleId: id, articleName: name, unit: (units || ["kg"])[0],
      quantity: 1, unitPrice: salePrice, origPrice: salePrice, costPrice: purchasePrice,
      subtotal: salePrice, profit: salePrice - purchasePrice, stock: stock
    }]);
    setQ(""); setShowDD(false);
  };

  const updItem = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const upd = { ...it, [key]: val };
      if (key === "quantity" || key === "unitPrice") {
        upd.subtotal = (upd.quantity || 0) * (upd.unitPrice || 0);
        upd.profit = (upd.quantity || 0) * ((upd.unitPrice || 0) - (upd.costPrice || 0));
      }
      return upd;
    }));
  };

  const total = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const profit = items.reduce((s, i) => s + (i.profit || 0), 0);

  return (
    <div className="mo" onClick={onClose}>
      <div className="md md-lg" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{editData ? "Editar" : "Nuevo"} Ticket de Venta</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fr">
            <div className="fg"><label className="fl">Cliente (opcional)</label><input className="fi" value={client} onChange={e => setClient(e.target.value)} placeholder="Nombre del cliente" /></div>
            <div className="fg">
              <label className="fl">Método de Pago</label>
              <div className="pm-grid">
                {payMethods.map(pm => (
                  <button key={pm.id} type="button" className={`pm-chip ${payMethod === pm.id ? "on" : ""}`} onClick={() => setPayMethod(pm.id)}>
                    {payMethod === pm.id && I.check} {pm.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <div className="fg" style={{ position: "relative", flex: 1, marginBottom: 0 }}>
              <label className="fl">Agregar Artículo</label>
              <input className="fi" placeholder="Buscar artículo..." value={q} onChange={e => { setQ(e.target.value); setShowDD(true); }} onFocus={() => q && setShowDD(true)} onBlur={() => setTimeout(() => setShowDD(false), 250)} />
              {showDD && avail.length > 0 && (
                <div className="dd">
                  {avail.slice(0, 8).map(a => (
                      <div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addExisting(a.id, a.name, a.units, a.salePrice, a.purchasePrice, a.stock); }}>
                        <span>{a.name} <span style={{ color: "var(--tx3)", fontSize: 11 }}>({a.stock} {(a.units || [])[0]})</span></span>
                        <span style={{ fontWeight: 600, color: "var(--ac)", fontSize: 12 }}>{money(a.salePrice)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: promo ? "var(--ac)" : "var(--tx3)", whiteSpace: "nowrap", marginTop: 16 }}>
              <input type="checkbox" checked={promo} onChange={e => setPromo(e.target.checked)} style={{ accentColor: "var(--ac)" }} /> Promo/Descuento
            </label>
          </div>
          {items.length > 0 && (
            <>
              <div className="ti">
                <div className="ti-r ti-h" style={{ gridTemplateColumns: promo ? "2fr 70px 90px 90px 90px 36px" : "2fr 70px 90px 100px 36px" }}>
                  <span>Artículo</span><span>Cant.</span><span>Unidad</span>{promo && <span>P.Unit.</span>}<span>Subtotal</span><span></span>
                </div>
                {items.map((it, idx) => {
                  const art = articles.find(a => a.id === it.articleId);
                  const resolvedName = it.articleName || art?.name || "";
                  return (
                    <div className="ti-r" key={it.articleId || idx} style={{ gridTemplateColumns: promo ? "2fr 70px 90px 90px 90px 36px" : "2fr 70px 90px 100px 36px" }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{resolvedName}</div>
                        <div style={{ fontSize: 11, color: "var(--ac)" }}>
                          {money(it.unitPrice)}/{it.unit}
                          {promo && it.unitPrice !== it.origPrice && <span style={{ textDecoration: "line-through", color: "var(--tx3)", marginLeft: 4 }}>{money(it.origPrice)}</span>}
                        </div>
                        {it.quantity > (it.stock || 9999) && <div style={{ fontSize: 10, color: "var(--rd)" }}>⚠ Stock: {it.stock}</div>}
                      </div>
                      <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, "quantity", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12 }} />
                      <select className="fs" value={it.unit} onChange={e => updItem(idx, "unit", e.target.value)} style={{ padding: "5px 7px", fontSize: 12 }}>
                        {(art?.units || ["kg"]).map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
                      </select>
                      {promo && (
                        <input className="fi" type="number" step="0.01" min="0" value={it.unitPrice} onChange={e => updItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12, background: it.unitPrice !== it.origPrice ? "var(--ywL)" : "var(--bg2)" }} />
                      )}
                      <span style={{ fontWeight: 600 }}>{money(it.subtotal)}</span>
                      <button className="btn-i" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--rd)", border: "none", padding: 3 }}>{I.trash}</button>
                    </div>
                  );
                })}
              </div>
              <div className="tt">
                <div><span className="tt-l">Total del Ticket</span><div style={{ fontSize: 12, color: "var(--gn)", marginTop: 2 }}>Ganancia: {money(profit)}</div></div>
                <span className="tt-v">{money(total)}</span>
              </div>
            </>
          )}
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={items.length === 0 || !payMethod} onClick={() => {
            const resolvedItems = items.map(({ origPrice, stock, ...rest }) => ({
              ...rest,
              articleName: rest.articleName || articles.find(a => a.id === rest.articleId)?.name || ""
            }));
            onSave({ client, payMethod, items: resolvedItems, total, profit, _editId: editData?.id || null });
          }}>
            {editData ? "Guardar Cambios" : "Registrar Venta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ PAYMENT METHODS ============
function PayMethodsPage({ payMethods, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const handleSave = async (pm) => {
    try {
      if (pm.id) { await db.updatePayMethod(pm.id, pm); notify("Método de pago actualizado"); }
      else { await db.insertPayMethod(pm); notify("Método de pago creado"); }
      await refresh(); setModal(null);
    } catch(e) { notify("Error: "+e.message); }
  };

  const handleDel = async (id) => {
    await db.deletePayMethod(id);
    await refresh();
    setDelConfirm(null);
    notify("Método de pago eliminado");
  };

  const toggleActive = async (id) => {
    const pm = payMethods.find(p => p.id === id);
    if (pm) { await db.updatePayMethod(id, { ...pm, active: !pm.active }); await refresh(); }
  };

  const activeCount = payMethods.filter(p => p.active).length;

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Total Métodos</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{payMethods.length}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Activos</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{activeCount}</div><div className="kpi-s">Disponibles en ventas</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Inactivos</div><div className="kpi-val">{payMethods.length - activeCount}</div></div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div />
        <button className="btn btn-p" onClick={() => setModal({ name: "", active: true })}>{I.plus} Nuevo Método</button>
      </div>

      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>Método de Pago</th><th>Estado</th><th style={{ width: 120 }}></th></tr></thead>
          <tbody>
            {payMethods.length === 0 ? <tr><td colSpan={3}><div className="empty"><p>No hay métodos de pago. ¡Creá el primero!</p></div></td></tr> :
              payMethods.map(pm => (
                <tr key={pm.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "var(--ac)" }}>{I.creditcard}</span>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{pm.name}</span>
                    </div>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${pm.active ? "btn-p" : "btn-s"}`}
                      style={pm.active ? { background: "var(--gn)" } : { color: "var(--tx3)" }}
                      onClick={() => toggleActive(pm.id)}
                    >
                      {pm.active ? <>{I.check} Activo</> : "Inactivo"}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn-i" onClick={() => setModal({ ...pm })}>{I.edit}</button>
                      {delConfirm === pm.id ? (
                        <><button className="btn-i" onClick={() => handleDel(pm.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                        <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                      ) : (
                        <button className="btn-i" onClick={() => setDelConfirm(pm.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      <div style={{ marginTop: 16, padding: 16, background: "var(--bg3)", borderRadius: 10, fontSize: 12, color: "var(--tx3)" }}>
        <strong style={{ color: "var(--tx2)" }}>Tip:</strong> Los métodos activos aparecen como opciones al registrar una venta. Podés desactivar un método sin eliminarlo para ocultarlo temporalmente.
      </div>

      {modal && (
        <div className="mo" onClick={() => setModal(null)}>
          <div className="md" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="md-h"><h2>{modal.id ? "Editar" : "Nuevo"} Método de Pago</h2><button className="btn-i" onClick={() => setModal(null)}>{I.x}</button></div>
            <div className="md-b">
              <div className="fg">
                <label className="fl">Nombre</label>
                <input className="fi" value={modal.name} onChange={e => setModal({ ...modal, name: e.target.value })} placeholder="Ej: Efectivo, MercadoPago, Cuenta DNI..." />
              </div>
              <div className="fg">
                <label className="fl">Estado</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className={`btn btn-sm ${modal.active ? "btn-p" : "btn-s"}`} style={modal.active ? { background: "var(--gn)" } : {}} onClick={() => setModal({ ...modal, active: true })}>
                    {modal.active && I.check} Activo
                  </button>
                  <button className={`btn btn-sm ${!modal.active ? "btn-d" : "btn-s"}`} onClick={() => setModal({ ...modal, active: false })}>
                    Inactivo
                  </button>
                </div>
              </div>
            </div>
            <div className="md-f">
              <button className="btn btn-s" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-p" disabled={!modal.name.trim()} onClick={() => handleSave(modal)}>
                {modal.id ? "Guardar Cambios" : "Crear Método"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ EXPENSES ============
function ExpensesPage({ expenses, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [catF, setCatF] = useState("");
  const [typeF, setTypeF] = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  const sorted = useMemo(() => [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)), [expenses]);
  const filtered = sorted.filter(e => (!catF || e.category === catF) && (!typeF || e.type === typeF));

  const totalAll = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalFijo = expenses.filter(e => e.type === "fijo").reduce((s, e) => s + (e.amount || 0), 0);
  const totalVariable = expenses.filter(e => e.type === "variable").reduce((s, e) => s + (e.amount || 0), 0);

  const catTotals = {};
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0); });
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const maxCat = topCats[0]?.[1] || 1;

  const blank = { description: "", category: "Otros", type: "fijo", frequency: "mensual", amount: 0 };

  const handleSave = async (exp) => {
    try {
      if (exp.id) { await db.updateExpense(exp.id, exp); notify("Gasto actualizado"); }
      else { await db.insertExpense(exp); notify("Gasto registrado"); }
      await refresh(); setModal(null);
    } catch(e) { notify("Error: "+e.message); }
  };

  const handleDel = async (id) => { await db.deleteExpense(id); await refresh(); setDelConfirm(null); notify("Gasto eliminado"); };

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-r"><div className="kpi-l">Total Gastos</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(totalAll)}</div><div className="kpi-s">{expenses.length} registros</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Gastos Fijos</div><div className="kpi-val">{money(totalFijo)}</div><div className="kpi-s">{expenses.filter(e => e.type === "fijo").length} registros</div></div>
        <div className="kpi kpi-o"><div className="kpi-l">Gastos Variables</div><div className="kpi-val">{money(totalVariable)}</div><div className="kpi-s">{expenses.filter(e => e.type === "variable").length} registros</div></div>
      </div>

      {topCats.length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-h"><h3>Gastos por Categoría</h3></div>
          <div className="card-b">
            <div className="bar-c">{topCats.slice(0, 8).map(([cat, total], i) => (
              <div className="bar-r" key={i}><div className="bar-l" title={cat}>{cat}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (total / maxCat) * 100) + "%" }}></div></div><div className="bar-v">{money(total)}</div></div>
            ))}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="fs" style={{ width: "auto" }} value={catF} onChange={e => setCatF(e.target.value)}><option value="">Todas las categorías</option>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</select>
          <select className="fs" style={{ width: "auto" }} value={typeF} onChange={e => setTypeF(e.target.value)}><option value="">Fijo + Variable</option><option value="fijo">Solo Fijos</option><option value="variable">Solo Variables</option></select>
        </div>
        <button className="btn btn-p" onClick={() => setModal({ ...blank })}>{I.plus} Nuevo Gasto</button>
      </div>

      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Frecuencia</th><th>Monto</th><th style={{ width: 80 }}></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay gastos registrados. ¡Agregá el primero!</p></div></td></tr> :
              filtered.map(e => (
                <tr key={e.id}>
                  <td style={{ fontSize: 12 }}>{fDateTime(e.date)}</td>
                  <td style={{ fontWeight: 600 }}>{e.description}</td>
                  <td><span className="badge b-ac">{e.category}</span></td>
                  <td><span className={`exp-type ${e.type === "fijo" ? "exp-fijo" : "exp-variable"}`}>{e.type === "fijo" ? "Fijo" : "Variable"}</span></td>
                  <td style={{ fontSize: 12 }}>{EXP_FREQ.find(f => f.value === e.frequency)?.label || e.frequency}</td>
                  <td style={{ fontWeight: 600, color: "var(--rd)" }}>{money(e.amount)}</td>
                  <td><div style={{ display: "flex", gap: 4 }}>
                    <button className="btn-i" onClick={() => setModal({ ...e })}>{I.edit}</button>
                    {delConfirm === e.id ? (
                      <><button className="btn-i" onClick={() => handleDel(e.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                      <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                    ) : (
                      <button className="btn-i" onClick={() => setDelConfirm(e.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>
                    )}
                  </div></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div></div></div>

      {modal && <ExpenseModal exp={modal} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
}

function ExpenseModal({ exp, onSave, onClose }) {
  const [f, setF] = useState({ ...exp });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{f.id ? "Editar" : "Nuevo"} Gasto</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg"><label className="fl">Descripción</label><input className="fi" value={f.description} onChange={e => set("description", e.target.value)} placeholder="Ej: Alquiler local Enero 2026" /></div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Categoría</label>
              <select className="fs" value={f.category} onChange={e => set("category", e.target.value)}>{EXP_CATS.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="fg">
              <label className="fl">Monto</label>
              <input className="fi" type="number" step="0.01" min="0" value={f.amount} onChange={e => set("amount", parseFloat(e.target.value) || 0)} placeholder="0.00" />
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Tipo</label>
              <div style={{ display: "flex", gap: 8 }}>
                {EXP_TYPE.map(t => (
                  <button key={t.value} className={`btn btn-sm ${f.type === t.value ? "btn-p" : "btn-s"}`} onClick={() => set("type", t.value)}>
                    {f.type === t.value && I.check} {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Frecuencia</label>
              <select className="fs" value={f.frequency} onChange={e => set("frequency", e.target.value)}>
                {EXP_FREQ.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={!f.description.trim() || !f.amount} onClick={() => onSave(f)}>
            {f.id ? "Guardar Cambios" : "Registrar Gasto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ EXCEL EXPORT ============
function exportToExcel(sheets, filename) {
  let xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
  xml += '<Styles><Style ss:ID="hd"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#F7F2EB" ss:Pattern="Solid"/></Style>';
  xml += '<Style ss:ID="mn"><NumberFormat ss:Format="#,##0.00"/></Style>';
  xml += '<Style ss:ID="bd"><Font ss:Bold="1"/></Style>';
  xml += '<Style ss:ID="mbd"><Font ss:Bold="1"/><NumberFormat ss:Format="#,##0.00"/></Style></Styles>';
  sheets.forEach(sh => {
    xml += `<Worksheet ss:Name="${sh.name.slice(0, 31)}"><Table>`;
    sh.rows.forEach((row, ri) => {
      xml += '<Row>';
      row.forEach(cell => {
        const isH = ri === 0;
        const isNum = typeof cell === "number";
        const style = isH ? "hd" : (cell && cell._bold && isNum) ? "mbd" : (cell && cell._bold) ? "bd" : isNum ? "mn" : "";
        const val = cell && cell._bold ? cell.v : cell;
        xml += `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${isNum || (typeof val === 'number') ? 'Number' : 'String'}">${val ?? ""}</Data></Cell>`;
      });
      xml += '</Row>';
    });
    xml += '</Table></Worksheet>';
  });
  xml += '</Workbook>';
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============ AI ADVISOR ============
function AIAdvisorPage({ articles, sales, purchases, expenses }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [mode, setMode] = useState("general");

  const analyze = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const now = new Date();
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);

      const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);
      const monthSales = sales.filter(s => new Date(s.date) >= monthAgo);
      const weekPurch = purchases.filter(p => new Date(p.date) >= weekAgo);

      const prodMap = {};
      monthSales.forEach(s => s.items.forEach(i => {
        if (!prodMap[i.articleId]) prodMap[i.articleId] = { name: i.articleName, rev: 0, qty: 0, count: 0, profit: 0 };
        prodMap[i.articleId].rev += i.subtotal; prodMap[i.articleId].qty += i.quantity;
        prodMap[i.articleId].count++; prodMap[i.articleId].profit += (i.profit || 0);
      }));
      const topProducts = Object.values(prodMap).sort((a, b) => b.rev - a.rev).slice(0, 15);
      const bottomProducts = Object.values(prodMap).sort((a, b) => a.rev - b.rev).slice(0, 10);

      const totalRevMonth = monthSales.reduce((a, s) => a + s.total, 0);
      const totalProfitMonth = monthSales.reduce((a, s) => a + s.profit, 0);
      const totalRevWeek = weekSales.reduce((a, s) => a + s.total, 0);
      const totalExpenses = expenses.reduce((a, e) => a + (e.amount || 0), 0);
      const fixedExpenses = expenses.filter(e => e.type === "fijo").reduce((a, e) => a + (e.amount || 0), 0);

      const lowStock = articles.filter(a => a.stock > 0 && a.stock <= (a.minStock || 5));
      const outStock = articles.filter(a => a.stock <= 0 && a.purchasePrice > 0);

      const prompts = {
        general: `Sos el asesor de negocios de una fiambrería argentina. Analizá los datos y dame un informe ejecutivo completo con recomendaciones accionables.`,
        promos: `Sos el asesor comercial de una fiambrería argentina. Basándote en los datos, recomendá promociones específicas para esta semana. Incluí combos, descuentos por volumen, y estrategias para mover productos lentos.`,
        compras: `Sos el asesor de compras de una fiambrería argentina. Analizá las ventas y stock para recomendar qué comprar esta semana, en qué cantidad, y qué no vale la pena reponer.`,
        costos: `Sos el asesor financiero de una fiambrería argentina. Analizá la estructura de gastos y costos, identificá oportunidades de ahorro, y sugerí cómo mejorar los márgenes.`,
      };

      const dataContext = `
DATOS DEL NEGOCIO (fecha: ${fDate(now)}):

VENTAS ÚLTIMO MES: ${money(totalRevMonth)} | Ganancia bruta: ${money(totalProfitMonth)} | Margen: ${totalRevMonth > 0 ? (totalProfitMonth/totalRevMonth*100).toFixed(1) : 0}%
VENTAS ÚLTIMA SEMANA: ${money(totalRevWeek)} | ${weekSales.length} tickets
GASTOS OPERATIVOS TOTAL: ${money(totalExpenses)} | Fijos: ${money(fixedExpenses)}
RESULTADO NETO: ${money(totalProfitMonth - totalExpenses)}

DETALLE GASTOS:
${expenses.map(e => `- ${e.description} (${e.category}, ${e.type}): ${money(e.amount)}`).join("\n") || "Sin gastos registrados"}

TOP PRODUCTOS (por venta del mes):
${topProducts.map((p, i) => `${i+1}. ${p.name}: ${money(p.rev)} (${p.qty} uds, ${p.count} ventas, ganancia: ${money(p.profit)})`).join("\n") || "Sin datos"}

PRODUCTOS MENOS VENDIDOS:
${bottomProducts.map((p, i) => `${i+1}. ${p.name}: ${money(p.rev)} (${p.qty} uds, ${p.count} ventas)`).join("\n") || "Sin datos"}

STOCK BAJO/SIN STOCK:
${[...outStock.map(a => `⚠ SIN STOCK: ${a.name}`), ...lowStock.map(a => `⚡ BAJO: ${a.name} (${a.stock} ${(a.units||[])[0] || "uds"}, mín: ${a.minStock || 5})`)].join("\n") || "Stock OK"}

INVENTARIO: ${articles.length} artículos | Valor venta: ${money(articles.reduce((s,a) => s + a.stock * (a.salePrice||0), 0))}
`;

      const resp = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompts[mode], dataContext }),
      });
      const data = await resp.json();
      setResponse(data.text || data.error || "Error al procesar");
    } catch (err) {
      console.error(err);
      setResponse("Error al conectar con el asesor IA. Intentá de nuevo en unos segundos.");
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="ai-card">
        <h3>Asesor Inteligente</h3>
        <p>Claude analiza tus ventas, compras, stock y gastos para darte recomendaciones personalizadas sobre tu fiambrería.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[["general", "Informe General"], ["promos", "Promociones"], ["compras", "Qué Comprar"], ["costos", "Optimizar Costos"]].map(([id, label]) => (
            <button key={id} className={`btn btn-sm ${mode === id ? "btn-p" : "btn-s"}`} style={mode !== id ? { background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.15)" } : {}} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        <button className="ai-btn" onClick={analyze} disabled={loading}>
          {loading ? (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg> Analizando...</>
          ) : (
            <>{I.brain} Analizar mi negocio</>
          )}
        </button>
      </div>

      {loading && (
        <div className="card"><div className="card-b" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ marginBottom: 10 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg></div>
          <div style={{ fontWeight: 600, color: "var(--ac)" }}>Analizando datos del negocio...</div>
          <div style={{ fontSize: 12, color: "var(--tx3)", marginTop: 4 }}>Claude está revisando ventas, compras, stock y gastos</div>
        </div></div>
      )}

      {response && !loading && (
        <div className="card">
          <div className="card-h">
            <h3>{mode === "general" ? "Informe General" : mode === "promos" ? "Promociones Recomendadas" : mode === "compras" ? "Recomendaciones de Compra" : "Optimización de Costos"}</h3>
            <span style={{ fontSize: 11, color: "var(--tx3)" }}>{fDateTime(new Date())}</span>
          </div>
          <div className="card-b">
            <div className="ai-resp">{response}</div>
          </div>
        </div>
      )}

      {!response && !loading && (
        <div className="card"><div className="card-b"><div className="empty">
          <div style={{ fontSize: 28, marginBottom: 8 }}>{I.brain}</div>
          <p>Seleccioná un tipo de análisis y hacé clic en "Analizar mi negocio" para recibir recomendaciones personalizadas basadas en tus datos reales.</p>
        </div></div></div>
      )}
    </div>
  );
}

// ============ REPORTS ============
function ReportsPage({ articles, sales, purchases, expenses, payMethods }) {
  const [tab, setTab] = useState("pnl");
  const [period, setPeriod] = useState("all");

  const filterP = (arr) => {
    if (period === "all") return arr;
    const now = new Date(), start = new Date();
    if (period === "today") start.setHours(0, 0, 0, 0);
    else if (period === "week") start.setDate(now.getDate() - 7);
    else if (period === "month") start.setMonth(now.getMonth() - 1);
    return arr.filter(i => new Date(i.date) >= start);
  };

  const pmName = (id) => (payMethods || []).find(pm => pm.id === id)?.name || id || "Sin definir";

  const pS = filterP(sales), pP = filterP(purchases), pE = filterP(expenses);
  const rev = pS.reduce((a, s) => a + s.total, 0);
  const prof = pS.reduce((a, s) => a + s.profit, 0);
  const cost = rev - prof;
  const exp = pP.reduce((a, p) => a + p.total, 0);
  const margin = rev > 0 ? (prof / rev * 100) : 0;

  const totalGastos = pE.reduce((a, e) => a + (e.amount || 0), 0);
  const gastosFijos = pE.filter(e => e.type === "fijo").reduce((a, e) => a + (e.amount || 0), 0);
  const gastosVar = pE.filter(e => e.type === "variable").reduce((a, e) => a + (e.amount || 0), 0);
  const netResult = prof - totalGastos;

  const gastoCatMap = {};
  pE.forEach(e => { gastoCatMap[e.category] = (gastoCatMap[e.category] || 0) + (e.amount || 0); });
  const gastoCats = Object.entries(gastoCatMap).sort((a, b) => b[1] - a[1]);
  const maxGC = gastoCats[0]?.[1] || 1;

  // Payment method breakdown
  const pmMap = {};
  pS.forEach(s => {
    const key = s.payMethod || "_none";
    if (!pmMap[key]) pmMap[key] = { name: pmName(s.payMethod), total: 0, profit: 0, count: 0 };
    pmMap[key].total += s.total; pmMap[key].profit += s.profit; pmMap[key].count++;
  });
  const pmBreakdown = Object.values(pmMap).sort((a, b) => b.total - a.total);
  const maxPM = pmBreakdown[0]?.total || 1;

  const prodMap = {};
  pS.forEach(s => s.items.forEach(i => {
    if (!prodMap[i.articleId]) prodMap[i.articleId] = { name: i.articleName, rev: 0, prof: 0, qty: 0, count: 0 };
    prodMap[i.articleId].rev += i.subtotal; prodMap[i.articleId].prof += i.profit; prodMap[i.articleId].qty += i.quantity; prodMap[i.articleId].count++;
  }));
  const topSell = Object.values(prodMap).sort((a, b) => b.rev - a.rev);
  const lessS = Object.values(prodMap).sort((a, b) => a.rev - b.rev);
  const maxR = topSell[0]?.rev || 1;

  const purchMap = {};
  pP.forEach(p => p.items.forEach(i => {
    if (!purchMap[i.articleId]) purchMap[i.articleId] = { name: i.articleName, total: 0, qty: 0, count: 0 };
    purchMap[i.articleId].total += i.subtotal; purchMap[i.articleId].qty += i.quantity; purchMap[i.articleId].count++;
  }));
  const topBuy = Object.values(purchMap).sort((a, b) => b.total - a.total);
  const maxB = topBuy[0]?.total || 1;

  const lowStock = articles.filter(a => a.stock > 0 && a.stock <= (a.minStock || 5)).sort((a, b) => a.stock - b.stock);
  const outStock = articles.filter(a => a.stock <= 0 && a.purchasePrice > 0);

  const moneyNum = (n) => Math.round((n || 0) * 100) / 100;
  const periodLabel = period === "all" ? "Todo" : period === "today" ? "Hoy" : period === "week" ? "Semana" : "Mes";

  const downloadExcel = () => {
    const sheets = [];
    // P&L sheet
    const pnlRows = [
      ["Estado de Resultados (P&L)", "", `Período: ${periodLabel}`],
      [],
      ["Concepto", "Monto"],
      ["Ingresos por Ventas", moneyNum(rev)],
      ["(-) Costo de Mercadería Vendida", moneyNum(-cost)],
      ["= Ganancia Bruta", moneyNum(prof)],
      [],
      ["GASTOS OPERATIVOS", ""],
      ["Gastos Fijos", moneyNum(-gastosFijos)],
      ["Gastos Variables", moneyNum(-gastosVar)],
      ["Total Gastos Operativos", moneyNum(-totalGastos)],
      [],
      ["= RESULTADO NETO", moneyNum(netResult)],
      [],
      ["Margen Bruto", margin.toFixed(1) + "%"],
      ["Compras a Proveedores (ref.)", moneyNum(exp)],
    ];
    sheets.push({ name: "P&L", rows: pnlRows });

    // Sales sheet
    const salesRows = [["Fecha", "Cliente", "Método de Pago", "Artículos", "Total", "Ganancia"]];
    [...pS].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
      salesRows.push([fDateTime(s.date), s.client || "—", pmName(s.payMethod), s.items.length, moneyNum(s.total), moneyNum(s.profit)]);
    });
    sheets.push({ name: "Ventas", rows: salesRows });

    // Payment methods breakdown
    const pmRows = [["Método de Pago", "Ventas", "Total", "Ganancia", "% del Total"]];
    pmBreakdown.forEach(pm => pmRows.push([pm.name, pm.count, moneyNum(pm.total), moneyNum(pm.profit), rev > 0 ? (pm.total / rev * 100).toFixed(1) + "%" : "0%"]));
    sheets.push({ name: "Medios de Pago", rows: pmRows });

    // Top products
    const topRows = [["Artículo", "Ingresos", "Ganancia", "Cantidad", "Ventas"]];
    topSell.forEach(p => topRows.push([p.name, moneyNum(p.rev), moneyNum(p.prof), moneyNum(p.qty), p.count]));
    sheets.push({ name: "Productos", rows: topRows });

    // Purchases sheet
    const purchRows = [["Fecha", "Proveedor", "Factura", "Artículos", "Total"]];
    [...pP].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
      purchRows.push([fDateTime(p.date), p.supplier, p.invoiceNum || "—", p.items.length, moneyNum(p.total)]);
    });
    sheets.push({ name: "Compras", rows: purchRows });

    // Expenses sheet
    const expRows = [["Fecha", "Descripción", "Categoría", "Tipo", "Frecuencia", "Monto"]];
    [...pE].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(e => {
      expRows.push([fDateTime(e.date), e.description, e.category, e.type === "fijo" ? "Fijo" : "Variable", EXP_FREQ.find(f => f.value === e.frequency)?.label || e.frequency, moneyNum(e.amount)]);
    });
    sheets.push({ name: "Gastos", rows: expRows });

    // Stock sheet
    const stockRows = [["Artículo", "Categoría", "Stock", "Mínimo", "P.Compra", "P.Venta", "Margen%", "Estado"]];
    articles.forEach(a => {
      const st = a.stock <= 0 && a.purchasePrice > 0 ? "Sin Stock" : a.stock <= (a.minStock || 5) && a.purchasePrice > 0 ? "Bajo" : "OK";
      stockRows.push([a.name, a.category, moneyNum(a.stock), a.minStock || 5, moneyNum(a.purchasePrice), moneyNum(a.salePrice), a.marginPercent, st]);
    });
    sheets.push({ name: "Inventario", rows: stockRows });

    exportToExcel(sheets, `Fiambreria_Reporte_${periodLabel}_${fDate(new Date())}.xls`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[["pnl", "P&L"], ["sales-r", "Ventas"], ["purch-r", "Compras"], ["exp-r", "Gastos"], ["stock-r", "Stock"]].map(([id, l]) => (
            <div key={id} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{l}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="fs" style={{ width: "auto" }} value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="all">Todo</option><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option>
          </select>
          <button className="exp-dl-btn" onClick={downloadExcel}>{I.download} Excel</button>
        </div>
      </div>

      {tab === "pnl" && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-o"><div className="kpi-l">Ingresos</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{money(rev)}</div><div className="kpi-s">{pS.length} ventas</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">Ganancia Bruta</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(prof)}</div><div className="kpi-s">Margen: {margin.toFixed(1)}%</div></div>
            <div className="kpi kpi-r"><div className="kpi-l">Gastos Operativos</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(totalGastos)}</div><div className="kpi-s">Fijos: {money(gastosFijos)}</div></div>
            <div className={`kpi ${netResult >= 0 ? "kpi-v" : "kpi-r"}`}><div className="kpi-l">Resultado Neto</div><div className="kpi-val" style={{ color: netResult >= 0 ? "var(--gn)" : "var(--rd)" }}>{money(netResult)}</div><div className="kpi-s">{rev > 0 ? (netResult/rev*100).toFixed(1) : 0}% s/ventas</div></div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Estado de Resultados (P&L)</h3></div>
            <div className="card-b">
              {[
                { label: "Ingresos por Ventas", val: money(rev), color: "var(--ac)", bold: false, bg: false },
                { label: "(-) Costo de Mercadería Vendida", val: "- " + money(cost), color: "var(--tx2)", bold: false, bg: false },
                { label: "= Ganancia Bruta", val: money(prof), color: "var(--gn)", bold: true, bg: "var(--bg3)" },
                { label: "", val: "", color: "", bold: false, bg: false, spacer: true },
                { label: "GASTOS OPERATIVOS", val: "", color: "var(--tx3)", bold: false, bg: false, header: true },
                ...gastoCats.map(([cat, total]) => ({
                  label: `   ${cat}`, val: "- " + money(total), color: "var(--rd)", bold: false, bg: false, indent: true
                })),
                { label: "(-) Total Gastos Fijos", val: "- " + money(gastosFijos), color: "var(--rd)", bold: false, bg: false },
                { label: "(-) Total Gastos Variables", val: "- " + money(gastosVar), color: "var(--rd)", bold: false, bg: false },
                { label: "= Total Gastos Operativos", val: "- " + money(totalGastos), color: "var(--rd)", bold: true, bg: "var(--rdL)" },
                { label: "", val: "", color: "", bold: false, bg: false, spacer: true },
                { label: "= RESULTADO NETO", val: money(netResult), color: netResult >= 0 ? "var(--gn)" : "var(--rd)", bold: true, bg: netResult >= 0 ? "var(--gnL)" : "var(--rdL)", final: true },
              ].filter(r => !r.spacer || gastoCats.length > 0).map((r, i) => {
                if (r.spacer) return <div key={i} style={{ height: 8 }} />;
                if (r.header) return <div key={i} style={{ padding: "8px 16px", fontSize: 10, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{r.label}</div>;
                return (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", padding: r.bold ? "14px 16px" : "10px 16px",
                    background: r.bg || "transparent",
                    borderRadius: r.bold ? 8 : 0, borderBottom: r.bold ? "none" : "1px solid var(--br)", marginBottom: r.bold ? 8 : 0
                  }}>
                    <span style={{ fontWeight: r.bold ? 700 : r.indent ? 400 : 400, fontSize: r.bold ? 15 : r.indent ? 12 : 13, color: r.indent ? "var(--tx2)" : "inherit" }}>{r.label}</span>
                    <span style={{ fontWeight: 700, color: r.color, fontSize: r.bold ? 18 : r.indent ? 12 : 14, fontFamily: r.bold ? "'Fraunces',serif" : "inherit" }}>{r.val}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--tx3)", textAlign: "right" }}>
            Ref: Compras a proveedores del período: {money(exp)} ({pP.length} facturas)
          </div>
        </div>
      )}

      {tab === "sales-r" && (
        <div>
          {/* Payment method breakdown */}
          <div className="kpi-g">
            {pmBreakdown.slice(0, 4).map((pm, i) => (
              <div key={i} className={`kpi ${i === 0 ? "kpi-o" : i === 1 ? "kpi-v" : i === 2 ? "kpi-y" : "kpi-r"}`}>
                <div className="kpi-l">{pm.name}</div>
                <div className="kpi-val">{money(pm.total)}</div>
                <div className="kpi-s">{pm.count} venta(s) · {rev > 0 ? (pm.total / rev * 100).toFixed(1) : 0}%</div>
              </div>
            ))}
          </div>

          {pmBreakdown.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-h"><h3>Ventas por Método de Pago</h3></div>
              <div className="card-b">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--tx2)" }}>Por Monto</div>
                    <div className="bar-c">{pmBreakdown.map((pm, i) => (
                      <div className="bar-r" key={i}><div className="bar-l" title={pm.name}>{pm.name}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (pm.total / maxPM) * 100) + "%" }}></div></div><div className="bar-v">{money(pm.total)}</div></div>
                    ))}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--tx2)" }}>Detalle</div>
                    <table><thead><tr><th>Método</th><th>Ventas</th><th>Total</th><th>Ganancia</th><th>%</th></tr></thead>
                      <tbody>{pmBreakdown.map((pm, i) => (
                        <tr key={i}><td><span className="pm-badge">{pm.name}</span></td><td>{pm.count}</td><td style={{ fontWeight: 600 }}>{money(pm.total)}</td><td><span className="badge b-gn">{money(pm.profit)}</span></td><td style={{ fontSize: 12 }}>{rev > 0 ? (pm.total / rev * 100).toFixed(1) : 0}%</td></tr>
                      ))}</tbody></table>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="card">
              <div className="card-h"><h3>Más Vendidos</h3></div>
              <div className="card-b">
                {topSell.length === 0 ? <div className="empty"><p>Sin datos</p></div> :
                  <div className="bar-c">{topSell.slice(0, 10).map((p, i) => (
                    <div className="bar-r" key={i}><div className="bar-l" title={p.name}>{p.name}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (p.rev / maxR) * 100) + "%" }}></div></div><div className="bar-v">{money(p.rev)}</div></div>
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
        </div>
      )}

      {tab === "purch-r" && (
        <div className="card">
          <div className="card-h"><h3>Artículos Más Comprados</h3></div>
          <div className="card-b">
            {topBuy.length === 0 ? <div className="empty"><p>Sin datos de compras</p></div> :
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--tx2)" }}>Por Monto</div>
                  <div className="bar-c">{topBuy.slice(0, 10).map((p, i) => (
                    <div className="bar-r" key={i}><div className="bar-l" title={p.name}>{p.name}</div><div className="bar-t"><div className="bar-f gn" style={{ width: Math.max(8, (p.total / maxB) * 100) + "%" }}></div></div><div className="bar-v">{money(p.total)}</div></div>
                  ))}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--tx2)" }}>Detalle</div>
                  <table><thead><tr><th>Artículo</th><th>Cant.</th><th>Facturas</th><th>Monto</th></tr></thead>
                    <tbody>{topBuy.slice(0, 10).map((p, i) => (
                      <tr key={i}><td style={{ fontWeight: 500 }}>{p.name}</td><td>{p.qty}</td><td>{p.count}</td><td style={{ fontWeight: 600 }}>{money(p.total)}</td></tr>
                    ))}</tbody></table>
                </div>
              </div>}
          </div>
        </div>
      )}

      {tab === "exp-r" && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-r"><div className="kpi-l">Total Gastos</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(totalGastos)}</div><div className="kpi-s">{pE.length} registros</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Gastos Fijos</div><div className="kpi-val">{money(gastosFijos)}</div></div>
            <div className="kpi kpi-o"><div className="kpi-l">Gastos Variables</div><div className="kpi-val">{money(gastosVar)}</div></div>
            <div className={`kpi ${rev > 0 && totalGastos / rev < 0.3 ? "kpi-v" : "kpi-r"}`}><div className="kpi-l">% sobre Ventas</div><div className="kpi-val">{rev > 0 ? (totalGastos / rev * 100).toFixed(1) : 0}%</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="card">
              <div className="card-h"><h3>Por Categoría</h3></div>
              <div className="card-b">
                {gastoCats.length === 0 ? <div className="empty"><p>Sin gastos</p></div> :
                  <div className="bar-c">{gastoCats.map(([cat, total], i) => (
                    <div className="bar-r" key={i}><div className="bar-l" title={cat}>{cat}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (total / maxGC) * 100) + "%" }}></div></div><div className="bar-v">{money(total)}</div></div>
                  ))}</div>}
              </div>
            </div>
            <div className="card">
              <div className="card-h"><h3>Detalle de Gastos</h3></div>
              <div style={{ padding: 0 }}>
                {pE.length === 0 ? <div className="empty"><p>Sin gastos</p></div> :
                  <table><thead><tr><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Monto</th></tr></thead>
                    <tbody>{[...pE].sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((e, i) => (
                      <tr key={i}><td style={{ fontWeight: 500 }}>{e.description}</td><td><span className="badge b-ac">{e.category}</span></td>
                        <td><span className={`exp-type ${e.type === "fijo" ? "exp-fijo" : "exp-variable"}`}>{e.type === "fijo" ? "Fijo" : "Var."}</span></td>
                        <td style={{ fontWeight: 600, color: "var(--rd)" }}>{money(e.amount)}</td></tr>
                    ))}</tbody></table>}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "stock-r" && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-o"><div className="kpi-l">Total Artículos</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{articles.length}</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">Stock OK</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{articles.filter(a => a.stock > (a.minStock || 5)).length}</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Stock Bajo</div><div className="kpi-val" style={{ color: "var(--yw)" }}>{lowStock.length}</div></div>
            <div className="kpi kpi-r"><div className="kpi-l">Sin Stock</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{outStock.length}</div></div>
          </div>
          {outStock.length > 0 && (
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-h"><h3 style={{ color: "var(--rd)" }}>Sin Stock</h3></div>
              <div style={{ padding: 0 }}><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Últ. P. Compra</th></tr></thead>
                <tbody>{outStock.map(a => (<tr key={a.id}><td style={{ fontWeight: 600 }}>{a.name}</td><td><span className="badge b-ac">{a.category}</span></td><td>{money(a.purchasePrice)}</td></tr>))}</tbody></table></div>
            </div>
          )}
          {lowStock.length > 0 && (
            <div className="card">
              <div className="card-h"><h3 style={{ color: "var(--yw)" }}>Stock Bajo</h3></div>
              <div style={{ padding: 0 }}><table><thead><tr><th>Artículo</th><th>Actual</th><th>Mínimo</th><th>Falta</th></tr></thead>
                <tbody>{lowStock.map(a => (<tr key={a.id}><td style={{ fontWeight: 600 }}>{a.name}</td><td><span className="badge b-yw">{a.stock} {(a.units || [])[0]}</span></td><td>{a.minStock || 5}</td><td style={{ fontWeight: 600, color: "var(--rd)" }}>-{((a.minStock || 5) - a.stock).toFixed(2)}</td></tr>))}</tbody></table></div>
            </div>
          )}
          {outStock.length === 0 && lowStock.length === 0 && (
            <div className="card"><div className="card-b"><div className="empty" style={{ color: "var(--gn)" }}><p style={{ fontSize: 15 }}>Todo el inventario está en orden</p></div></div></div>
          )}
        </div>
      )}
    </div>
  );
}

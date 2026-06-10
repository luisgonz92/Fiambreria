'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from '../lib/supabase';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);
const fDate = (d) => new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
const fDateTime = (d) => new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const isPrevMonth = (d) => { const now = new Date(), dt = new Date(d); return dt.getFullYear() < now.getFullYear() || (dt.getFullYear() === now.getFullYear() && dt.getMonth() < now.getMonth()); };

const CATEGORIES = ["Jamones", "Quesos", "Embutidos", "Aceitunas", "Lácteos", "Bebidas", "Enlatados", "Aderezos", "Fiambres", "Snacks", "Otros"];
const EXP_CATS = ["Alquiler", "Expensas", "Luz", "Gas", "Agua", "Internet", "Teléfono", "Sueldos", "Impuestos", "Seguros", "Mantenimiento", "Limpieza", "Transporte", "Publicidad", "Otros"];
const EXP_FREQ = [{ value: "unico", label: "Único" }, { value: "mensual", label: "Mensual" }, { value: "semanal", label: "Semanal" }];
const EXP_TYPE = [{ value: "fijo", label: "Fijo" }, { value: "variable", label: "Variable" }];
const UNITS = [{ value: "kg", label: "Kilogramo" }, { value: "g", label: "Gramo" }, { value: "und", label: "Unidad" }, { value: "lt", label: "Litro" }];
const unitLabel = (v) => UNITS.find(u => u.value === v)?.label || v;
const IVA_RATES = [{ value: 0, label: "0% (Exento)" }, { value: 10.5, label: "10.5%" }, { value: 21, label: "21%" }, { value: 27, label: "27%" }];
const calcSale = (pp, iva, margin) => Math.round((pp || 0) * (1 + (iva || 0) / 100) * (1 + (margin || 0) / 100) * 100) / 100;

const getPriceHistory = (articleId, purchases, phTable) => {
  const entries = [];
  const seen = new Set();
  (phTable || []).forEach(ph => {
    if (ph.articleId === articleId && ph.price > 0) {
      const key = ph.date + "_" + ph.price + "_" + ph.supplier;
      if (!seen.has(key)) { seen.add(key); entries.push({ date: ph.date, price: ph.price, prevPrice: ph.prevPrice, unit: ph.unit || "kg", supplier: ph.supplier }); }
    }
  });
  (purchases || []).forEach(p => {
    (p.items || []).forEach(it => {
      if (it.articleId === articleId && it.unitCost > 0) {
        const key = p.date + "_" + it.unitCost + "_" + p.supplier;
        if (!seen.has(key)) { seen.add(key); entries.push({ date: p.date, price: it.unitCost, unit: it.unit || "kg", supplier: p.supplier }); }
      }
    });
  });
  return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
};

// ============ SUPABASE DB LAYER ============
const mapArt = (r) => ({ ...r, purchasePrice: Number(r.purchase_price)||0, salePrice: Number(r.sale_price)||0, marginPercent: Number(r.margin_percent)||30, minStock: Number(r.min_stock)||5, stock: Number(r.stock)||0, iva: r.iva != null ? Number(r.iva) : 21, isCorte: !!r.is_corte, category: (r.categories && r.categories.name) || r.category_name||r.category||'Otros', active: r.active !== false });
const mapPurch = (r) => ({ ...r, supplier: r.supplier_name, invoiceNum: r.invoice_number, items: (r.purchase_invoice_items||[]).map(i => ({ articleId: i.article_id, articleName: i.article_name, quantity: Number(i.quantity), unit: i.unit, unitCost: Number(i.unit_cost), subtotal: Number(i.subtotal) })) });
const mapSale = (r) => ({ ...r, client: r.client_name, payMethod: r.pay_method_name||'Efectivo', payMethod2: r.pay_method2_name||null, pm1Amount: r.pm1_amount ? Number(r.pm1_amount) : null, pm2Amount: r.pm2_amount ? Number(r.pm2_amount) : null, cashReceived: r.cash_received ? Number(r.cash_received) : null, discountMode: r.discount_mode||'none', discountAmount: Number(r.discount_amount)||0, discountPct: Number(r.discount_pct)||0, items: (r.sale_ticket_items||[]).map(i => ({ articleId: i.article_id, articleName: i.article_name, quantity: Number(i.quantity), unit: i.unit, unitPrice: Number(i.unit_price), costPrice: Number(i.cost_price), subtotal: Number(i.subtotal), profit: Number(i.profit), isComboPrice: !!i.is_combo_header, isComboItem: !!i.combo_id && !i.is_combo_header, comboGroupId: i.combo_id||null })) });
const mapExp = (r) => ({ ...r, amount: Number(r.amount)||0 });
const mapMerma = (r) => ({ ...r, lossValue: Number(r.loss_value)||0, items: r.items||[] });
const mapDevol = (r) => ({ ...r, purchaseId: r.purchase_id, invoiceNum: r.invoice_num, totalValue: Number(r.total_value)||0, items: r.items||[] });
const mapCombo = (r) => ({ ...r, suggestedPrice: Number(r.suggested_price)||0, items: r.items||[] });

const db = {
  // Articles
  async getArticles() { const { data } = await supabase.from('articles').select('*, categories(name)').order('name'); return (data||[]).map(mapArt); },
  async insertArticle(a) {
    const { data: cats } = await supabase.from('categories').select('id,name');
    const cat = (cats||[]).find(c => c.name === a.category);
    const { error } = await supabase.from('articles').insert({ name: a.name, category_id: cat?.id||null, units: a.units||['kg'], purchase_price: a.purchasePrice||0, margin_percent: a.marginPercent||30, sale_price: a.salePrice||0, stock: a.stock||0, min_stock: a.minStock||5, iva: a.iva??21, is_corte: !!a.isCorte });
    if (error) throw error;
  },
  async updateArticle(id, a) {
    const { data: cats } = await supabase.from('categories').select('id,name');
    const cat = (cats||[]).find(c => c.name === a.category);
    await supabase.from('articles').update({ name: a.name, category_id: cat?.id||null, units: a.units||['kg'], purchase_price: a.purchasePrice||0, margin_percent: a.marginPercent||30, sale_price: a.salePrice||0, stock: a.stock||0, min_stock: a.minStock||5, iva: a.iva??21, is_corte: !!a.isCorte, active: a.active !== false }).eq('id', id);
  },
  async deleteArticle(id) { await supabase.from('articles').update({ active: false }).eq('id', id); },
  // Purchases
  async getPurchases() { const { data } = await supabase.from('purchase_invoices').select('*, purchase_invoice_items(*)').order('date', { ascending: false }); return (data||[]).map(mapPurch); },
  async insertPurchase(p, items) { const { data: inv, error } = await supabase.from('purchase_invoices').insert({ supplier_name: p.supplier, invoice_number: p.invoiceNum, total: p.total }).select().single(); if (error) throw error; await supabase.from('purchase_invoice_items').insert(items.map(i => ({ purchase_invoice_id: inv.id, article_id: i.articleId, article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_cost: i.unitCost, subtotal: i.subtotal }))); },
  async updatePurchase(id, p, items) { await supabase.from('purchase_invoice_items').delete().eq('purchase_invoice_id', id); await supabase.from('purchase_invoices').update({ supplier_name: p.supplier, invoice_number: p.invoiceNum, total: p.total }).eq('id', id); await supabase.from('purchase_invoice_items').insert(items.map(i => ({ purchase_invoice_id: id, article_id: i.articleId, article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_cost: i.unitCost, subtotal: i.subtotal }))); },
  async deletePurchase(id) { await supabase.from('purchase_invoices').delete().eq('id', id); },
  // Sales
  async getSales() { const { data } = await supabase.from('sale_tickets').select('*, sale_ticket_items(*)').order('date', { ascending: false }); return (data||[]).map(mapSale); },
  async insertSale(s, items) { const { data: t, error } = await supabase.from('sale_tickets').insert({ client_name: s.client||'Consumidor Final', pay_method_name: s.payMethod||'Efectivo', pay_method2_name: s.payMethod2||null, pm1_amount: s.pm1Amount||null, pm2_amount: s.pm2Amount||null, cash_received: s.cashReceived||null, discount_mode: s.discountMode||'none', discount_amount: s.discountAmount||0, discount_pct: s.discountPct||0, total: s.total, cost_total: s.total-s.profit, profit: s.profit }).select().single(); if (error) throw error; const dbItems = items.map(i => ({ sale_ticket_id: t.id, article_id: i.isComposite ? null : (i.isComboPrice ? null : (i.articleId||null)), article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_price: i.unitPrice, cost_price: i.costPrice, subtotal: i.subtotal, profit: i.profit, combo_id: i.comboGroupId||null, is_combo_header: !!i.isComboPrice })); if (dbItems.length) await supabase.from('sale_ticket_items').insert(dbItems); },
  async updateSale(id, s, items) { await supabase.from('sale_ticket_items').delete().eq('sale_ticket_id', id); await supabase.from('sale_tickets').update({ client_name: s.client||'Consumidor Final', pay_method_name: s.payMethod||'Efectivo', pay_method2_name: s.payMethod2||null, pm1_amount: s.pm1Amount||null, pm2_amount: s.pm2Amount||null, cash_received: s.cashReceived||null, discount_mode: s.discountMode||'none', discount_amount: s.discountAmount||0, discount_pct: s.discountPct||0, total: s.total, cost_total: s.total-s.profit, profit: s.profit }).eq('id', id); const dbItems = items.map(i => ({ sale_ticket_id: id, article_id: i.isComposite ? null : (i.isComboPrice ? null : (i.articleId||null)), article_name: i.articleName, quantity: i.quantity, unit: i.unit, unit_price: i.unitPrice, cost_price: i.costPrice, subtotal: i.subtotal, profit: i.profit, combo_id: i.comboGroupId||null, is_combo_header: !!i.isComboPrice })); if (dbItems.length) await supabase.from('sale_ticket_items').insert(dbItems); },
  async deleteSale(id) { await supabase.from('sale_tickets').delete().eq('id', id); },
  // Expenses
  async getExpenses() { const { data } = await supabase.from('expenses').select('*').eq('active', true).order('date', { ascending: false }); return (data||[]).map(mapExp); },
  async insertExpense(e) { await supabase.from('expenses').insert({ description: e.description, category: e.category, type: e.type, frequency: e.frequency, amount: e.amount, date: e.date || new Date().toISOString() }); },
  async updateExpense(id, e) { await supabase.from('expenses').update({ description: e.description, category: e.category, type: e.type, frequency: e.frequency, amount: e.amount, date: e.date || new Date().toISOString() }).eq('id', id); },
  async deleteExpense(id) { await supabase.from('expenses').update({ active: false }).eq('id', id); },
  // Pay Methods
  async getPayMethods() { const { data } = await supabase.from('pay_methods').select('*').order('created_at'); return data||[]; },
  async insertPayMethod(pm) { await supabase.from('pay_methods').insert({ name: pm.name, active: pm.active !== false }); },
  async updatePayMethod(id, pm) { await supabase.from('pay_methods').update({ name: pm.name, active: pm.active }).eq('id', id); },
  async deletePayMethod(id) { await supabase.from('pay_methods').delete().eq('id', id); },
  // Mermas
  async getMermas() { const { data } = await supabase.from('mermas').select('*').eq('active', true).order('date', { ascending: false }); return (data||[]).map(mapMerma); },
  async insertMerma(m) { await supabase.from('mermas').insert({ type: m.type, date: m.date, items: m.items, loss_value: m.lossValue, obs: m.obs }); },
  async deleteMerma(id) { await supabase.from('mermas').update({ active: false }).eq('id', id); },
  // Devoluciones
  async getDevoluciones() { const { data } = await supabase.from('devoluciones').select('*').eq('active', true).order('date', { ascending: false }); return (data||[]).map(mapDevol); },
  async insertDevolucion(d) { await supabase.from('devoluciones').insert({ purchase_id: d.purchaseId, supplier: d.supplier, invoice_num: d.invoiceNum, items: d.items, total_value: d.totalValue, obs: d.obs, status: 'pendiente' }); },
  async updateDevolucionStatus(id, status) { await supabase.from('devoluciones').update({ status }).eq('id', id); },
  async deleteDevolucion(id) { await supabase.from('devoluciones').update({ active: false }).eq('id', id); },
  // Combos
  async getCombos() { const { data } = await supabase.from('combos').select('*').order('created_at'); return (data||[]).map(mapCombo); },
  async insertCombo(c) { await supabase.from('combos').insert({ name: c.name, items: c.items, suggested_price: c.suggestedPrice, active: c.active !== false }); },
  async updateCombo(id, c) { await supabase.from('combos').update({ name: c.name, items: c.items, suggested_price: c.suggestedPrice, active: c.active }).eq('id', id); },
  async deleteCombo(id) { await supabase.from('combos').delete().eq('id', id); },
  async updateArticleStock(id, stock) { await supabase.from('articles').update({ stock }).eq('id', id); },
  // Price History
  async getPriceHistory() { const { data } = await supabase.from('price_history').select('*').order('date', { ascending: true }); return (data||[]).map(r => ({ id: r.id, articleId: r.article_id, articleName: r.article_name, date: r.date, price: Number(r.price)||0, prevPrice: Number(r.prev_price)||0, supplier: r.supplier, unit: r.unit })); },
  async insertPriceHistoryEntries(entries) { if (!entries?.length) return; await supabase.from('price_history').insert(entries.map(e => ({ article_id: e.articleId, article_name: e.articleName, date: e.date, price: e.price, prev_price: e.prevPrice||0, supplier: e.supplier, unit: e.unit }))).catch(() => {}); },
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
  eyeOff: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/></svg>,
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
  scale: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 3v17M3 7l3 6c0 1.7 2 3 4 3s4-1.3 4-3l3-6"/><path d="M21 7l-3 6c0 1.7-2 3-4 3"/></svg>,
  sandwich: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 11h18l-1.5 7H4.5L3 11z"/><path d="M3 11c0-4.4 4-8 9-8s9 3.6 9 8"/><path d="M6 15h12"/></svg>,
  undo: <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 019-9c3.3 0 6.3 1.8 7.9 4.5"/><path d="M21 17v-6h-6"/><path d="M21 11a9 9 0 01-9 9c-3.3 0-6.3-1.8-7.9-4.5"/></svg>,
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
  const [mermas, setMermas] = useState([]);
  const [devoluciones, setDevoluciones] = useState([]);
  const [combos, setCombos] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    (async () => {
      const [a, s, p, e, pm, m, dv, cb, ph] = await Promise.all([db.getArticles(), db.getSales(), db.getPurchases(), db.getExpenses(), db.getPayMethods(), db.getMermas(), db.getDevoluciones(), db.getCombos(), db.getPriceHistory().catch(() => [])]);
      setArticles(a);
      setSales(s);
      setPurchases(p);
      setExpenses(e);
      setPayMethods(pm);
      setMermas(m);
      setDevoluciones(dv);
      setCombos(cb);
      setPriceHistory(ph);
      setLoading(false);
    })();
  }, []);

  const notify = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const refresh = useCallback(async () => { const [a,s,p,e,pm,m,dv,cb,ph] = await Promise.all([db.getArticles(),db.getSales(),db.getPurchases(),db.getExpenses(),db.getPayMethods(),db.getMermas(),db.getDevoluciones(),db.getCombos(),db.getPriceHistory().catch(()=>[])]); setArticles(a);setSales(s);setPurchases(p);setExpenses(e);setPayMethods(pm);setMermas(m);setDevoluciones(dv);setCombos(cb);setPriceHistory(ph); }, []);

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: I.dashboard },
    { id: "inventory", label: "Inventario", icon: I.box },
    { id: "purchases", label: "Compras", icon: I.bag },
    { id: "sales", label: "Ventas", icon: I.cart },
    { id: "expenses", label: "Gastos", icon: I.wallet },
    { id: "merma", label: "Merma", icon: I.scale },
    { id: "devoluciones", label: "Devoluciones", icon: I.undo },
    { id: "combos", label: "Combos", icon: I.sandwich },
    { id: "reports", label: "Reportes", icon: I.chart },
    { id: "paymethods", label: "Medios de Pago", icon: I.creditcard },
    { id: "advisor", label: "Asesor IA", icon: I.brain },
  ];

  const lowStock = articles.filter(a => a.active !== false && a.stock > 0 && a.stock <= (a.minStock || 5));
  const outStock = articles.filter(a => a.active !== false && a.stock <= 0 && a.purchasePrice > 0);

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
          <div className="side-ft">v5.4 · Datos compartidos</div>
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
            {pg === "dashboard" && <Dashboard articles={articles} sales={sales} purchases={purchases} expenses={expenses} mermas={mermas} devoluciones={devoluciones} setPg={setPg} lowStock={lowStock} outStock={outStock} />}
            {pg === "inventory" && <InventoryPage articles={articles} purchases={purchases} priceHistory={priceHistory} refresh={refresh} notify={notify} />}
            {pg === "purchases" && <PurchasesPage articles={articles} purchases={purchases} priceHistory={priceHistory} refresh={refresh} devoluciones={devoluciones} notify={notify} />}
            {pg === "sales" && <SalesPage articles={articles} sales={sales} refresh={refresh} payMethods={payMethods} combos={combos} notify={notify} />}
            {pg === "expenses" && <ExpensesPage expenses={expenses} refresh={refresh} notify={notify} />}
            {pg === "merma" && <MermaPage articles={articles} mermas={mermas} refresh={refresh} notify={notify} />}
            {pg === "devoluciones" && <DevolucionesPage articles={articles} purchases={purchases} devoluciones={devoluciones}
              onSave={async (dev) => {
                await db.insertDevolucion(dev);
                await Promise.all((dev.items || []).map(di => { const a = articles.find(x => x.id === di.articleId); return a ? db.updateArticleStock(a.id, Math.max(0, (a.stock || 0) - (di.devQty || 0))) : Promise.resolve(); }));
                await refresh();
                notify(`Devolución registrada · Stock descontado`);
              }}
              onDelete={async (id) => {
                const d = devoluciones.find(x => x.id === id);
                if (!d) return;
                if (isPrevMonth(d.date)) { notify("⚠ Período cerrado"); return false; }
                await db.deleteDevolucion(id);
                await Promise.all((d.items || []).map(di => { const a = articles.find(x => x.id === di.articleId); return a ? db.updateArticleStock(a.id, (a.stock || 0) + (di.devQty || 0)) : Promise.resolve(); }));
                await refresh();
                notify("Devolución eliminada · Stock revertido");
                return true;
              }}
              onStatusChange={async (id, status) => {
                await db.updateDevolucionStatus(id, status); await refresh();
                notify("Estado actualizado");
              }}
              notify={notify} />}
            {pg === "combos" && <CombosPage articles={articles} combos={combos} refresh={refresh} notify={notify} />}
            {pg === "reports" && <ReportsPage articles={articles} sales={sales} purchases={purchases} expenses={expenses} mermas={mermas} devoluciones={devoluciones} payMethods={payMethods} priceHistory={priceHistory} />}
            {pg === "paymethods" && <PayMethodsPage payMethods={payMethods} refresh={refresh} notify={notify} />}
            {pg === "advisor" && <AIAdvisorPage articles={articles} sales={sales} purchases={purchases} expenses={expenses} mermas={mermas} devoluciones={devoluciones} />}
          </div>
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

// ============ DASHBOARD ============
function Dashboard({ articles, sales, purchases, expenses, mermas, devoluciones, setPg, lowStock, outStock }) {
  const today = new Date().toDateString();
  const tSales = sales.filter(s => new Date(s.date).toDateString() === today);
  const tRev = tSales.reduce((a, s) => a + s.total, 0);
  const tProfit = tSales.reduce((a, s) => a + s.profit, 0);
  const allRev = sales.reduce((a, s) => a + s.total, 0);
  const allProfit = sales.reduce((a, s) => a + s.profit, 0);
  const allExpense = purchases.reduce((a, p) => a + p.total, 0);
  const allGastos = expenses.reduce((a, e) => a + (e.amount || 0), 0);
  const allMermaLoss = (mermas || []).reduce((a, m) => a + (m.lossValue || 0), 0);
  const allDevolCred = (devoluciones || []).filter(d => d.status === "credito").reduce((a, d) => a + (d.totalValue || 0), 0);
  const netResult = allProfit - allGastos - allMermaLoss + allDevolCred;
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
        <div className="kpi kpi-r"><div className="kpi-l">Gastos + Merma</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(allGastos + allMermaLoss)}</div><div className="kpi-s">Gastos: {money(allGastos)} · Merma: {money(allMermaLoss)}</div></div>
        <div className={`kpi ${netResult >= 0 ? "kpi-v" : "kpi-r"}`}><div className="kpi-l">Resultado Neto</div><div className="kpi-val" style={{ color: netResult >= 0 ? "var(--gn)" : "var(--rd)" }}>{money(netResult)}</div><div className="kpi-s">Bruta - Gastos - Merma{allDevolCred > 0 ? ` + Créditos ${money(allDevolCred)}` : ""}</div></div>
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
function InventoryPage({ articles, purchases, priceHistory, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [catF, setCatF] = useState("");
  const [sort, setSort] = useState("name");
  const [activeFilter, setActiveFilter] = useState("active");

  const filtered = articles
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()) && (!catF || a.category === catF) && (activeFilter === "all" || (activeFilter === "active" ? a.active !== false : a.active === false)))
    .sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stock-low") return a.stock - b.stock;
      if (sort === "stock-high") return b.stock - a.stock;
      if (sort === "price") return (b.salePrice || 0) - (a.salePrice || 0);
      return 0;
    });

  const activeArts = articles.filter(a => a.active !== false);
  const totalVal = activeArts.reduce((s, a) => s + (a.stock * (a.salePrice || 0)), 0);
  const totalCost = activeArts.reduce((s, a) => s + (a.stock * (a.purchasePrice || 0)), 0);

  const blank = { name: "", category: "Otros", units: ["kg"], iva: 21, marginPercent: 30, minStock: 5, stock: 0, purchasePrice: 0, salePrice: 0, isCorte: false };

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
        <div className="kpi kpi-o"><div className="kpi-l">Total Artículos</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{activeArts.length}</div><div className="kpi-s">{articles.length - activeArts.length > 0 ? `${articles.length - activeArts.length} inactivos` : "Todos activos"}</div></div>
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
          <select className="fs" style={{ width: "auto" }} value={activeFilter} onChange={e => setActiveFilter(e.target.value)}>
            <option value="active">Solo activos</option><option value="inactive">Solo inactivos</option><option value="all">Todos</option>
          </select>
        </div>
        <button className="btn btn-p" onClick={() => setModal({ ...blank })}>{I.plus} Nuevo Artículo</button>
      </div>

      <div className="card">
        <div style={{ padding: 0 }}><div className="tw">
          <table>
            <thead><tr><th>Artículo</th><th>Categoría</th><th>P. Compra</th><th>IVA</th><th>Margen</th><th>P. Venta</th><th>Stock</th><th>Estado</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={9}><div className="empty"><p>No hay artículos{search ? " para esta búsqueda" : ". ¡Creá el primero!"}</p></div></td></tr> :
                filtered.map(a => {
                  const st = stockStatus(a);
                  return (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name} {a.isCorte && <span style={{ display: "inline-flex", padding: "2px 6px", borderRadius: 10, fontSize: 9, fontWeight: 700, background: "#EDE9FE", color: "#7C3AED", marginLeft: 4, verticalAlign: "middle" }}>Corte</span>}{a.active === false && <span style={{ display: "inline-flex", padding: "2px 6px", borderRadius: 10, fontSize: 9, fontWeight: 700, background: "#FEE2E2", color: "#DC2626", marginLeft: 4, verticalAlign: "middle" }}>Inactivo</span>}</td>
                      <td><span className="badge b-ac">{a.category}</span></td>
                      <td>{a.purchasePrice ? money(a.purchasePrice) : <span style={{ color: "var(--tx3)", fontSize: 11 }}>Pendiente</span>}</td>
                      <td><span className="badge b-yw">{a.iva ?? 21}%</span></td>
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

      {modal && <ArticleModal art={modal} articles={articles} purchases={purchases} priceHistory={priceHistory} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
}

function ArticleModal({ art, articles, purchases, priceHistory, onSave, onClose }) {
  const [f, setF] = useState({ ...art, units: art.units || ["kg"], iva: art.iva ?? 21, active: art.active !== false });
  const [confirmInactive, setConfirmInactive] = useState(false);

  const set = (k, v) => {
    const upd = { ...f, [k]: v };
    if (k === "purchasePrice" || k === "iva" || k === "marginPercent") {
      upd.salePrice = calcSale(upd.purchasePrice, upd.iva, upd.marginPercent);
    } else if (k === "salePrice") {
      const base = (upd.purchasePrice || 0) * (1 + (upd.iva || 0) / 100);
      upd.marginPercent = base > 0 ? Math.round(((v / base) - 1) * 100 * 10) / 10 : 0;
    }
    setF(upd);
  };

  const toggleUnit = (u) => {
    const units = f.units.includes(u) ? f.units.filter(x => x !== u) : [...f.units, u];
    if (units.length > 0) setF(p => ({ ...p, units }));
  };

  const isDup = f.name.trim() && articles.some(a => a.id !== f.id && a.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const priceWithIva = (f.purchasePrice || 0) * (1 + (f.iva || 0) / 100);

  // Price history
  const history = f.id ? getPriceHistory(f.id, purchases, priceHistory) : [];
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  const prevEntry = history.length > 1 ? history[history.length - 2] : null;
  const priceDiff = lastEntry && prevEntry ? lastEntry.price - prevEntry.price : 0;
  const pricePct = prevEntry && prevEntry.price > 0 ? ((priceDiff / prevEntry.price) * 100) : 0;

  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{f.id ? "Editar" : "Nuevo"} Artículo</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg">
            <label className="fl">Nombre del Artículo</label>
            <input className="fi" value={f.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Jamón Crudo Paladini" />
            {isDup && <div className="dup-warn">{I.warn} Ya existe un artículo con este nombre.</div>}
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Categoría</label>
              <select className="fs" value={f.category} onChange={e => set("category", e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="fg">
              <label className="fl">Unidades de Medida</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {UNITS.map(u => (
                  <button key={u.value} type="button" className={`btn btn-sm ${f.units.includes(u.value) ? "btn-p" : "btn-s"}`} onClick={() => toggleUnit(u.value)}>
                    {f.units.includes(u.value) && I.check} {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">Precio Compra (sin IVA)</label>
              <input className="fi" type="number" step="0.01" min="0" value={f.purchasePrice || ""} onChange={e => set("purchasePrice", parseFloat(e.target.value) || 0)} placeholder="0.00" />
            </div>
            <div className="fg">
              <label className="fl">IVA (%)</label>
              <select className="fs" value={f.iva ?? 21} onChange={e => set("iva", parseFloat(e.target.value))}>
                {IVA_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {f.purchasePrice > 0 && <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, display: "block" }}>Con IVA: {money(priceWithIva)}</span>}
            </div>
          </div>

          {/* PRICE HISTORY */}
          {history.length > 0 && (
            <div style={{ background: "var(--bg3)", borderRadius: 10, padding: "10px 14px", margin: "6px 0 10px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>Historial de Precios de Compra</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><span style={{ fontSize: 10, color: "var(--tx3)" }}>Precio actual</span><div style={{ fontWeight: 700, fontSize: 15 }}>{money(lastEntry.price)}<span style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 400 }}>/{lastEntry.unit}</span></div><span style={{ fontSize: 10, color: "var(--tx3)" }}>{fDate(lastEntry.date)} · {lastEntry.supplier}</span></div>
                {prevEntry && (
                  <div><span style={{ fontSize: 10, color: "var(--tx3)" }}>Precio anterior</span><div style={{ fontWeight: 600, fontSize: 14, color: "var(--tx2)" }}>{money(prevEntry.price)}<span style={{ fontSize: 10, color: "var(--tx3)", fontWeight: 400 }}>/{prevEntry.unit}</span></div><span style={{ fontSize: 10, color: "var(--tx3)" }}>{fDate(prevEntry.date)} · {prevEntry.supplier}</span></div>
                )}
              </div>
              {prevEntry && (
                <div style={{ display: "flex", gap: 12, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--br)" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: priceDiff > 0 ? "var(--rd)" : priceDiff < 0 ? "var(--gn)" : "var(--tx3)" }}>
                    {priceDiff > 0 ? "▲" : priceDiff < 0 ? "▼" : "="} {money(Math.abs(priceDiff))} ({priceDiff >= 0 ? "+" : ""}{pricePct.toFixed(1)}%)
                  </span>
                  <span style={{ fontSize: 11, color: "var(--tx3)" }}>{history.length} compras registradas</span>
                </div>
              )}
            </div>
          )}

          <div className="fr3">
            <div className="fg">
              <label className="fl">Margen (%)</label>
              <input className="fi" type="number" step="0.1" min="0" value={f.marginPercent} onChange={e => set("marginPercent", parseFloat(e.target.value) || 0)} />
              <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, display: "block" }}>Sobre P.Compra + IVA</span>
            </div>
            <div className="fg">
              <label className="fl">Precio Venta</label>
              <input className="fi" type="number" step="0.01" min="0" value={f.salePrice || ""} onChange={e => set("salePrice", parseFloat(e.target.value) || 0)} placeholder="0.00" />
              <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, display: "block" }}>= (P.Compra + IVA) + {f.marginPercent}%</span>
            </div>
            <div className="fg">
              <label className="fl">Ganancia Unit.</label>
              <input className="fi" readOnly value={f.salePrice > 0 ? money(f.salePrice - priceWithIva) : "—"} style={{ background: "var(--gnL)", color: "var(--gn)", fontWeight: 600 }} />
            </div>
          </div>
          <div className="fr">
            <div className="fg"><label className="fl">Stock Actual</label><input className="fi" type="number" step="0.01" min="0" value={f.stock} onChange={e => setF(p => ({ ...p, stock: parseFloat(e.target.value) || 0 }))} /><span style={{ fontSize: 10, color: "var(--tx3)", display: "block", marginTop: 2 }}>Ajustable manualmente</span></div>
            <div className="fg"><label className="fl">Stock Mínimo</label><input className="fi" type="number" step="0.01" min="0" value={f.minStock || 5} onChange={e => setF(p => ({ ...p, minStock: parseFloat(e.target.value) || 0 }))} /></div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "10px 0 4px", fontSize: 13, fontWeight: 500, color: f.isCorte ? "var(--ac)" : "var(--tx2)" }}>
            <input type="checkbox" checked={!!f.isCorte} onChange={e => setF(p => ({ ...p, isCorte: e.target.checked }))} style={{ accentColor: "var(--ac)", width: 16, height: 16 }} />
            ¿Es artículo de corte?
            <span style={{ fontSize: 10, fontWeight: 400, color: "var(--tx3)" }}>Aparece en el cierre diario de merma</span>
          </label>
          {f.id && (<>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "6px 0 4px", fontSize: 13, fontWeight: 500, color: f.active !== false ? "var(--gn)" : "var(--rd)" }}>
              <input type="checkbox" checked={f.active !== false} onChange={e => { if (!e.target.checked) setConfirmInactive(true); else setF(p => ({ ...p, active: true })); }} style={{ accentColor: f.active !== false ? "var(--gn)" : "var(--rd)", width: 16, height: 16 }} />
              Artículo activo
              {f.active === false && <span style={{ padding: "1px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700, background: "#FEE2E2", color: "#DC2626" }}>INACTIVO</span>}
            </label>
            {confirmInactive && (
              <div style={{ background: "#FEF2F2", borderRadius: 10, padding: 12, margin: "4px 0 8px", border: "1px solid #FECACA" }}>
                <p style={{ fontSize: 12, color: "#DC2626", margin: "0 0 10px", lineHeight: 1.5 }}>¿Confirmás que querés inactivar este artículo? No aparecerá en nuevas ventas, compras ni operaciones futuras, pero todos sus registros históricos se mantendrán intactos.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-s" style={{ fontSize: 12, padding: "4px 12px" }} onClick={() => setConfirmInactive(false)}>Cancelar</button>
                  <button className="btn" style={{ fontSize: 12, padding: "4px 12px", background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }} onClick={() => { setF(p => ({ ...p, active: false })); setConfirmInactive(false); }}>Sí, inactivar</button>
                </div>
              </div>
            )}
          </>)}
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
function PurchasesPage({ articles, purchases, priceHistory, refresh, devoluciones, notify }) {
  const [modal, setModal] = useState(false);
  const [editPurch, setEditPurch] = useState(null);
  const [view, setView] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);
  const sorted = useMemo(() => [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date)), [purchases]);

  const handleSave = async (data) => {
    try {
      const { _newArticles: newArts, _editId, _devolucionId, ...purchaseData } = data;
      for (const art of (newArts||[])) { try { await db.insertArticle(art); } catch(e) { console.error(e); } }
      if (_editId) {
        await db.updatePurchase(_editId, purchaseData, purchaseData.items);
        notify("Compra actualizada");
      } else {
        await db.insertPurchase(purchaseData, purchaseData.items);
        if (_devolucionId) { await db.updateDevolucionStatus(_devolucionId, "repuesto"); }
        // Record price history entries
        const phEntries = (purchaseData.items || []).map(item => {
          const oldArt = articles.find(a => a.id === item.articleId);
          if (!oldArt || !(item.unitCost > 0)) return null;
          return { articleId: item.articleId, articleName: item.articleName, date: new Date().toISOString(), price: item.unitCost, prevPrice: oldArt.purchasePrice || 0, supplier: purchaseData.supplier, unit: item.unit };
        }).filter(Boolean);
        if (phEntries.length > 0) db.insertPriceHistoryEntries(phEntries);
        notify(purchaseData.isReposition ? "Reposición registrada" : "Compra registrada: " + money(purchaseData.total));
      }
      await refresh();
      setModal(false);
      setEditPurch(null);
    } catch (err) {
      console.error("Error en handleSave compra:", err);
      notify("⚠ Error al guardar: " + (err.message || "desconocido"));
    }
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
    setEditPurch(p); setModal(true);
  };

  const pendingDevols = (devoluciones || []).filter(d => d.status === "pendiente" || d.status === "credito");

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

      {modal && <PurchaseModal articles={articles} purchases={purchases} priceHistory={priceHistory} editData={editPurch} pendingDevols={pendingDevols} onSave={handleSave} onClose={() => { setModal(false); setEditPurch(null); }} />}
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

function PurchaseModal({ articles, purchases, priceHistory, editData, pendingDevols, onSave, onClose }) {
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
  const [newArt, setNewArt] = useState({ name: "", category: "Otros", units: ["kg"], iva: 21, marginPercent: 30, minStock: 5, stock: 0, purchasePrice: 0, salePrice: 0 });
  const [linkIdx, setLinkIdx] = useState(-1);
  const [linkQ, setLinkQ] = useState("");
  const [devolucionId, setDevolucionId] = useState(editData?.devolucionId || "");

  const allArticles = useMemo(() => [...articles, ...newArticles], [articles, newArticles]);
  const avail = q ? allArticles.filter(a => a.active !== false && (a.name || "").toLowerCase().includes(q.toLowerCase()) && !items.find(i => i.articleId === a.id)) : [];

  const addExisting = (id, name, units, price, iva) => {
    const iv = iva ?? 21;
    setItems(prev => [...prev, { _key: uid(), articleId: id, articleName: name, unit: (units || ["kg"])[0], quantity: 1, unitCost: price || 0, subtotal: (price || 0) * (1 + iv / 100), iva: iv, isNew: false }]);
    setQ(""); setShowDD(false);
  };

  const updItem = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const upd = { ...it, [key]: val };
      if (key === "quantity" || key === "unitCost" || key === "iva") upd.subtotal = (upd.quantity || 0) * (upd.unitCost || 0) * (1 + (upd.iva || 0) / 100);
      return upd;
    }));
    if (key === "articleName") {
      const artId = items[idx]?.articleId;
      const na = artId && newArticles.find(a => a.id === artId);
      if (na) setNewArticles(prev => prev.map(a => a.id === artId ? { ...a, name: val } : a));
    }
  };

  const doLink = (idx, a) => {
    const iv = a.iva ?? 21;
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, articleId: a.id, articleName: a.name || "", unit: (a.units || ["kg"])[0], unitCost: a.purchasePrice || 0, subtotal: (it.quantity || 1) * (a.purchasePrice || 0) * (1 + iv / 100), iva: iv, isNew: false }));
    setLinkIdx(-1); setLinkQ("");
  };

  const total = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const isDupName = (name) => allArticles.some(a => (a.name || "").trim().toLowerCase() === name.trim().toLowerCase());

  const handleInlineCreate = () => {
    if (!newArt.name.trim() || isDupName(newArt.name)) return;
    const art = { ...newArt, id: uid(), createdAt: new Date().toISOString(), salePrice: calcSale(newArt.purchasePrice, newArt.iva, newArt.marginPercent) };
    setNewArticles(prev => [...prev, art]);
    setItems(prev => [...prev, { _key: uid(), articleId: art.id, articleName: art.name, unit: (art.units || ["kg"])[0], quantity: 1, unitCost: art.purchasePrice || 0, subtotal: (art.purchasePrice || 0) * (1 + (art.iva || 0) / 100), iva: art.iva ?? 21, isNew: true }]);
    setNewArt({ name: "", category: "Otros", units: ["kg"], iva: 21, marginPercent: 30, minStock: 5, stock: 0, purchasePrice: 0, salePrice: 0 });
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
          const iv = art.iva ?? 21;
          newItems.push({ _key: uid(), articleId: art.id, articleName: art.name, unit: pi.unit || (art.units || ["kg"])[0], quantity: pi.quantity || 1, unitCost: pi.unitCost || art.purchasePrice || 0, subtotal: (pi.quantity || 1) * (pi.unitCost || art.purchasePrice || 0) * (1 + iv / 100), iva: iv, isNew: !articles.find(a => a.id === art.id) });
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
    onSave({ supplier, invoiceNum, items: resolvedItems, total, _newArticles: newArticles, _editId: editData?.id || null, _devolucionId: devolucionId || null });
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
            {(pendingDevols || []).length > 0 && !editData && (
              <div className="fg" style={{ marginBottom: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: devolucionId ? "var(--ac)" : "var(--tx3)", marginBottom: 6 }}>
                  ¿Es reposición de devolución?
                </label>
                <select className="fs" value={devolucionId} onChange={e => setDevolucionId(e.target.value)}>
                  <option value="">No — compra normal</option>
                  {(pendingDevols || []).map(d => (
                    <option key={d.id} value={d.id}>Dev. {d.supplier} · {(d.items || []).map(it => it.articleName).join(", ")} · {fDate(d.date)} ({d.status === "credito" ? "Con Crédito" : "Pendiente"})</option>
                  ))}
                </select>
                {devolucionId && <span style={{ fontSize: 10, color: "var(--ac)", display: "block", marginTop: 4 }}>Esta compra no sumará al costo del período y la devolución se marcará como "Repuesto"</span>}
              </div>
            )}
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
                      <div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addExisting(a.id, a.name, a.units, a.purchasePrice, a.iva); }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                  <div className="fg"><label className="fl">P. Compra</label><input className="fi" type="number" step="0.01" min="0" value={newArt.purchasePrice || ""} onChange={e => setNewArt(p => ({ ...p, purchasePrice: parseFloat(e.target.value) || 0 }))} /></div>
                  <div className="fg"><label className="fl">IVA %</label><select className="fs" value={newArt.iva ?? 21} onChange={e => setNewArt(p => ({ ...p, iva: parseFloat(e.target.value) }))}>{IVA_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
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
                  <div className="ti-r ti-h" style={{ gridTemplateColumns: "2fr 60px 80px 55px 90px 90px 36px" }}><span>Artículo</span><span>Cant.</span><span>Unidad</span><span>IVA</span><span>Costo U.</span><span>Subtotal</span><span></span></div>
                  {items.map((it, idx) => {
                    const resolvedName = it.articleName || allArticles.find(a => a.id === it.articleId)?.name || "";
                    const ph = getPriceHistory(it.articleId, purchases || [], priceHistory || []);
                    const lastP = ph.length > 0 ? ph[ph.length - 1] : null;
                    const costUp = lastP && it.unitCost > 0 && it.unitCost > lastP.price;
                    const costDn = lastP && it.unitCost > 0 && it.unitCost < lastP.price;
                    return (
                    <div className="ti-r" key={it._key || it.articleId || idx} style={{ gridTemplateColumns: "2fr 60px 80px 55px 90px 90px 36px" }}>
                      <div>
                        {it.isNew ? (
                          <input className="fi" value={resolvedName} onChange={e => updItem(idx, "articleName", e.target.value)} style={{ padding: "4px 7px", fontSize: 12, fontWeight: 500 }} />
                        ) : (
                          <div style={{ fontWeight: 500, fontSize: 12, padding: "4px 0", minHeight: 24 }}>{resolvedName}</div>
                        )}
                        <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                          {it.isNew && <span className="scan-new">NUEVO</span>}
                          <button className="btn-i" title="Vincular" onClick={() => { setLinkIdx(linkIdx === idx ? -1 : idx); setLinkQ(""); }} style={{ padding: 2, color: linkIdx === idx ? "var(--ac)" : "var(--tx3)", fontSize: 10 }}>{I.search}</button>
                        </div>
                        {linkIdx === idx && (
                          <div style={{ marginTop: 4 }}>
                            <input className="fi" placeholder="Buscar artículo..." value={linkQ} onChange={e => setLinkQ(e.target.value)} style={{ padding: "4px 8px", fontSize: 11, background: "var(--acL)", border: "1px solid var(--ac)" }} autoFocus />
                            {linkResults.length > 0 && (
                              <div style={{ border: "1px solid var(--br)", borderRadius: "0 0 8px 8px", background: "var(--bg2)", maxHeight: 150, overflowY: "auto" }}>
                                {linkResults.map(a => (<div key={a.id} className="dd-i" onClick={() => doLink(idx, a)}><span style={{ fontSize: 12 }}>{a.name}</span><span style={{ fontSize: 10, color: "var(--tx3)" }}>{money(a.purchasePrice)}</span></div>))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, "quantity", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12 }} />
                      <select className="fs" value={it.unit} onChange={e => updItem(idx, "unit", e.target.value)} style={{ padding: "5px 7px", fontSize: 12 }}>{UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
                      <select className="fs" value={it.iva ?? 21} onChange={e => updItem(idx, "iva", parseFloat(e.target.value))} style={{ padding: "5px 7px", fontSize: 11 }}>{IVA_RATES.map(r => <option key={r.value} value={r.value}>{r.value}%</option>)}</select>
                      <div>
                        <input className="fi" type="number" step="0.01" min="0" value={it.unitCost} onChange={e => updItem(idx, "unitCost", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12, borderColor: costUp ? "#F0B8B8" : costDn ? "#A8D5BA" : "var(--br)" }} />
                        {lastP && <div style={{ fontSize: 9, color: costUp ? "var(--rd)" : costDn ? "var(--gn)" : "var(--tx3)", marginTop: 1 }}>Últ: {money(lastP.price)} · {fDate(lastP.date)}</div>}
                      </div>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <button className="btn btn-p" disabled={items.length === 0 || !supplier.trim() || scanning} onClick={handleSave}>{editData ? "Guardar Cambios" : "Registrar Compra"}</button>
            {(items.length === 0 || !supplier.trim()) && !scanning && (
              <span style={{ fontSize: 10, color: "var(--rd)", fontWeight: 500 }}>
                {!supplier.trim() && items.length === 0 ? "Falta proveedor y artículos" : !supplier.trim() ? "⚠ Ingresá el proveedor" : "Agregá al menos un artículo"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ SALES ============
function SalesPage({ articles, sales, refresh, payMethods, combos, notify }) {
  const [modal, setModal] = useState(false);
  const [editSale, setEditSale] = useState(null);
  const [view, setView] = useState(null);
  const [search, setSearch] = useState("");
  const [pmFilter, setPmFilter] = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  const [showProfit, setShowProfit] = useState(false);
  const sorted = useMemo(() => [...sales].sort((a, b) => new Date(b.date) - new Date(a.date)), [sales]);
  const filtered = sorted.filter(s =>
    ((s.client || "").toLowerCase().includes(search.toLowerCase()) || s.items.some(i => (i.articleName || "").toLowerCase().includes(search.toLowerCase())))
    && (!pmFilter || s.payMethod === pmFilter)
  );
  const activePM = payMethods.filter(pm => pm.active);

  const deductStock = (upd, saleItems, factor) => {
    saleItems.forEach(it => {
      if (it.isComboPrice) return;
      if (it.isComboItem) {
        const idx = upd.findIndex(a => a.id === it.articleId);
        if (idx > -1) upd[idx] = { ...upd[idx], stock: Math.max(0, (upd[idx].stock || 0) + factor * (it.quantity || 0)) };
        return;
      }
      if (it.isComposite && it.ingredients) {
        it.ingredients.forEach(ing => {
          const idx = upd.findIndex(a => a.id === ing.articleId);
          if (idx > -1) upd[idx] = { ...upd[idx], stock: Math.max(0, (upd[idx].stock || 0) + factor * (ing.qty || 0) * (it.quantity || 1)) };
        });
      } else {
        const idx = upd.findIndex(a => a.id === it.articleId);
        if (idx > -1) upd[idx] = { ...upd[idx], stock: Math.max(0, (upd[idx].stock || 0) + factor * it.quantity) };
      }
    });
  };

  const handleSave = async (data) => {
    const { _editId, ...saleData } = data;
    try {
      const upd = [...articles];
      if (_editId) {
        const old = sales.find(x => x.id === _editId);
        if (old) deductStock(upd, old.items, +1);
        deductStock(upd, saleData.items, -1);
        await db.updateSale(_editId, saleData, saleData.items);
        notify("Venta actualizada");
      } else {
        deductStock(upd, saleData.items, -1);
        await db.insertSale(saleData, saleData.items);
        notify("Venta registrada: " + money(saleData.total));
      }
      await Promise.all(upd.filter(a => { const orig = articles.find(x => x.id === a.id); return orig && orig.stock !== a.stock; }).map(a => db.updateArticleStock(a.id, a.stock)));
      await refresh();
    } catch(e) { notify("Error: "+e.message); }
    setModal(false); setEditSale(null);
  };

  const handleDel = async (id) => {
    const s = sales.find(x => x.id === id);
    if (!s) return;
    if (isPrevMonth(s.date)) { notify("⚠ No se puede eliminar: período cerrado"); setDelConfirm(null); return; }
    const upd = [...articles];
    deductStock(upd, s.items, +1);
    await db.deleteSale(id);
    await Promise.all(upd.filter(a => { const orig = articles.find(x => x.id === a.id); return orig && orig.stock !== a.stock; }).map(a => db.updateArticleStock(a.id, a.stock)));
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
          <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th><div style={{ display: "flex", alignItems: "center", gap: 6 }}>Ganancia<button onClick={() => setShowProfit(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--tx3)", display: "flex", alignItems: "center", lineHeight: 1 }} title={showProfit ? "Ocultar ganancia" : "Mostrar ganancia"}>{showProfit ? I.eye : I.eyeOff}</button></div></th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay ventas registradas</p></div></td></tr> :
              filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: "var(--tx3)" }}>#{sorted.length - sorted.indexOf(s)}</td>
                  <td style={{ fontSize: 12 }}>{fDateTime(s.date)}</td>
                  <td style={{ fontWeight: 500 }}>{s.client || "—"}</td>
                  <td><span className="pm-badge">{pmName(s.payMethod)}</span></td>
                  <td style={{ fontWeight: 600 }}>{money(s.total)}</td>
                  <td><span className="badge b-gn">{showProfit ? money(s.profit) : "$ ••••••"}</span></td>
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

      {modal && <SaleModal articles={articles} payMethods={activePM} combos={combos} editData={editSale} onSave={handleSave} onClose={() => { setModal(false); setEditSale(null); }} showProfit={showProfit} />}
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
                <tbody>{view.items.map((it, i) => {
                  if (it.isComboItem) return (
                    <tr key={i} style={{ background: "var(--bg3)", opacity: 0.85 }}>
                      <td style={{ paddingLeft: 20, fontSize: 12, color: "var(--tx3)" }}>└ {it.articleName}</td>
                      <td style={{ fontSize: 12, color: "var(--tx3)" }}>{it.quantity}</td>
                      <td style={{ fontSize: 12, color: "var(--tx3)" }}>{unitLabel(it.unit)}</td>
                      <td style={{ fontSize: 12, color: "var(--tx3)" }}>—</td>
                      <td style={{ fontSize: 12, color: "var(--tx3)" }}>—</td>
                      <td>—</td>
                    </tr>
                  );
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{it.articleName}{it.isComboPrice && <span className="comp-badge" style={{ background: "var(--ac)", color: "#fff", marginLeft: 6 }}>Combo</span>}</td>
                      <td>{it.quantity}</td>
                      <td>{unitLabel(it.unit)}</td>
                      <td>{money(it.unitPrice)}</td>
                      <td style={{ fontWeight: 600 }}>{money(it.subtotal)}</td>
                      <td><span className="badge b-gn">{showProfit ? money(it.profit) : "$ ••••••"}</span></td>
                    </tr>
                  );
                })}</tbody></table>
              <div className="tt" style={{ marginTop: 14 }}>
                <div><span className="tt-l">Total</span><div style={{ fontSize: 12, color: "var(--gn)", marginTop: 2 }}>Ganancia: {showProfit ? money(view.profit) : "$ ••••••"}</div></div>
                <span className="tt-v">{money(view.total)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaleModal({ articles, payMethods, combos, editData, onSave, onClose, showProfit }) {
  const [client, setClient] = useState(editData?.client || "");
  const [pm1, setPm1] = useState(editData?.payMethod || payMethods[0]?.id || "");
  const [pm1Amount, setPm1Amount] = useState("");
  const [isMixed, setIsMixed] = useState(editData?.payMethod2 ? true : false);
  const [pm2, setPm2] = useState(editData?.payMethod2 || "");
  const [cashReceived, setCashReceived] = useState("");
  const [discountMode, setDiscountMode] = useState(editData?.discountMode || "none"); // none, item, percent
  const [discountPct, setDiscountPct] = useState(editData?.discountPct || 0);
  const [items, setItems] = useState(() => {
    if (!editData) return [];
    return editData.items.map(it => ({ ...it, origPrice: it.unitPrice }));
  });
  const [q, setQ] = useState(""); const [showDD, setShowDD] = useState(false);
  const [showComp, setShowComp] = useState(false);
  const [compName, setCompName] = useState(""); const [compPrice, setCompPrice] = useState("");
  const [compIngr, setCompIngr] = useState([]); const [compQ, setCompQ] = useState(""); const [compDD, setCompDD] = useState(false);
  const [comboQ, setComboQ] = useState(""); const [comboDD, setComboDD] = useState(false);
  const [swapIdx, setSwapIdx] = useState(null); const [swapQ, setSwapQ] = useState("");

  const avail = q ? articles.filter(a => a.active !== false && a.name && a.name.toLowerCase().includes(q.toLowerCase()) && a.salePrice > 0 && !items.find(i => i.articleId === a.id && !i.isComposite && !i.isComboItem)) : [];
  const compAvail = compQ ? articles.filter(a => a.active !== false && a.name && a.name.toLowerCase().includes(compQ.toLowerCase())).slice(0, 8) : [];
  const activeComboList = (combos || []).filter(c => c.active !== false);
  const comboAvail = comboQ ? activeComboList.filter(c => c.name.toLowerCase().includes(comboQ.toLowerCase())).slice(0, 8) : activeComboList.slice(0, 8);
  const swapAvail = articles.filter(a => a.active !== false && a.name && (!swapQ || a.name.toLowerCase().includes(swapQ.toLowerCase()))).slice(0, 8);

  const addExisting = (id, name, units, salePrice, purchasePrice, stock) => {
    setItems(prev => [...prev, { articleId: id, articleName: name, unit: (units || ["kg"])[0], quantity: 1, unitPrice: salePrice, origPrice: salePrice, costPrice: purchasePrice, subtotal: salePrice, profit: salePrice - purchasePrice, stock }]);
    setQ(""); setShowDD(false);
  };
  const updItem = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const upd = { ...it, [key]: val };
      if (key === "quantity" || key === "unitPrice") { upd.subtotal = (upd.quantity || 0) * (upd.unitPrice || 0); upd.profit = (upd.quantity || 0) * ((upd.unitPrice || 0) - (upd.costPrice || 0)); }
      return upd;
    }));
  };
  const addIngr = (a) => { if (compIngr.find(i => i.articleId === a.id)) return; setCompIngr(prev => [...prev, { articleId: a.id, name: a.name, unit: (a.units || ["kg"])[0], qty: 0.1, costPrice: a.purchasePrice || 0 }]); setCompQ(""); setCompDD(false); };
  const updIngr = (idx, key, val) => setCompIngr(prev => prev.map((it, i) => i !== idx ? it : { ...it, [key]: val }));
  const compCost = compIngr.reduce((s, i) => s + (i.qty || 0) * (i.costPrice || 0), 0);
  const addComposite = () => {
    if (!compName.trim() || !compPrice || compIngr.length === 0) return;
    const price = parseFloat(compPrice);
    setItems(prev => [...prev, { articleId: "comp_" + uid(), articleName: compName.trim(), unit: "und", quantity: 1, unitPrice: price, origPrice: price, costPrice: compCost, subtotal: price, profit: price - compCost, isComposite: true, ingredients: compIngr.map(i => ({ ...i })) }]);
    setShowComp(false); setCompName(""); setCompPrice(""); setCompIngr([]);
  };

  const addComboToTicket = (c) => {
    const gid = uid();
    const comboSubtotal = c.items.reduce((s, ci) => { const a = articles.find(x => x.id === ci.articleId); return s + (ci.qty || 0) * (a?.salePrice || 0); }, 0);
    const comboCost = c.items.reduce((s, ci) => { const a = articles.find(x => x.id === ci.articleId); return s + (ci.qty || 0) * (a?.purchasePrice || 0); }, 0);
    const price = c.suggestedPrice || comboSubtotal;
    const priceRow = { articleId: "combo_price_" + gid, articleName: c.name, unit: "und", quantity: 1, unitPrice: price, origPrice: price, costPrice: comboCost, subtotal: price, profit: price - comboCost, isComboPrice: true, comboGroupId: gid };
    const stockRows = c.items.map(ci => { const a = articles.find(x => x.id === ci.articleId); return { articleId: ci.articleId, articleName: a?.name || ci.name, unit: ci.unit || (a?.units || ["kg"])[0], quantity: ci.qty, unitPrice: 0, origPrice: 0, costPrice: a?.purchasePrice || 0, subtotal: 0, profit: 0, isComboItem: true, comboGroupId: gid }; });
    setItems(prev => [...prev, priceRow, ...stockRows]);
    setComboQ(""); setComboDD(false);
  };

  const swapComboItem = (idx, a) => {
    setItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, articleId: a.id, articleName: a.name, costPrice: a.purchasePrice || 0, unit: (a.units || ["kg"])[0] }));
    setSwapIdx(null); setSwapQ("");
  };

  const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const itemDiscount = discountMode === "item" ? items.reduce((s, it) => s + (it.quantity || 0) * ((it.origPrice || 0) - (it.unitPrice || 0)), 0) : 0;
  const pctDiscount = discountMode === "percent" ? Math.round(subtotal * (discountPct || 0) / 100 * 100) / 100 : 0;
  const totalDiscount = discountMode === "item" ? itemDiscount : pctDiscount;
  const total = Math.max(0, subtotal - pctDiscount);
  const profit = items.reduce((s, i) => s + (i.profit || 0), 0) - pctDiscount;

  const pmLabel = (id) => payMethods.find(p => p.id === id)?.name || id || "";
  const isEfectivo = (id) => (pmLabel(id) || "").toLowerCase().includes("efectivo");

  // Payment logic: efectivo = manual entry + vuelto, other = auto-fill with pending amount
  const pm1Pending = total;
  const pm1Auto = !isEfectivo(pm1) && !isMixed;
  const pm1Val = parseFloat(pm1Amount) || 0;
  const pm2Name_ = pmLabel(pm2);
  const isEf2 = isEfectivo(pm2);
  const pm2Pending = Math.max(0, total - pm1Val);
  const pm2Val = parseFloat(cashReceived) || 0; // cashReceived doubles as pm2 manual entry for cash
  const vuelto = isMixed
    ? (isEf2 && pm2Val > pm2Pending ? pm2Val - pm2Pending : 0)
    : (isEfectivo(pm1) && pm1Val > total ? pm1Val - total : 0);

  const handleSave = () => {
    const resolvedItems = items.map(({ origPrice, stock, ...rest }) => ({ ...rest, articleName: rest.articleName || articles.find(a => a.id === rest.articleId)?.name || "" }));
    const saleData = { client, payMethod: pm1, items: resolvedItems, total, profit, discountMode, discountAmount: totalDiscount, _editId: editData?.id || null };
    if (discountMode === "percent") saleData.discountPct = discountPct;
    if (isMixed && pm2) { saleData.payMethod2 = pm2; saleData.pm1Amount = pm1Val; saleData.pm2Amount = pm2Pending; }
    if (!isMixed && isEfectivo(pm1) && pm1Val) saleData.cashReceived = pm1Val;
    if (isMixed && isEf2 && pm2Val) saleData.cashReceived = pm2Val;
    onSave(saleData);
  };

  return (
    <div className="mo" onClick={onClose}>
      <div className="md md-lg" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{editData ? "Editar" : "Nuevo"} Ticket de Venta</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg"><label className="fl">Cliente (opcional)</label><input className="fi" value={client} onChange={e => setClient(e.target.value)} placeholder="Nombre del cliente" /></div>

          {/* ARTICLES */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <div className="fg" style={{ position: "relative", flex: 1, marginBottom: 0, minWidth: 180 }}>
              <label className="fl">Agregar Artículo</label>
              <input className="fi" placeholder="Buscar..." value={q} onChange={e => { setQ(e.target.value); setShowDD(true); }} onFocus={() => q && setShowDD(true)} onBlur={() => setTimeout(() => setShowDD(false), 250)} />
              {showDD && avail.length > 0 && (<div className="dd">{avail.slice(0, 8).map(a => (
                <div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addExisting(a.id, a.name, a.units, a.salePrice, a.purchasePrice, a.stock); }}>
                  <span>{a.name} <span style={{ color: "var(--tx3)", fontSize: 11 }}>({a.stock} {(a.units || [])[0]})</span></span>
                  <span style={{ fontWeight: 600, color: "var(--ac)", fontSize: 12 }}>{money(a.salePrice)}</span>
                </div>))}</div>)}
            </div>
            <button className="btn btn-s" style={{ whiteSpace: "nowrap", marginTop: 16 }} onClick={() => setShowComp(!showComp)}>{I.sandwich} Compuesto</button>
          </div>

          {/* COMBO SELECTOR */}
          {activeComboList.length > 0 && (
            <div className="fg" style={{ position: "relative", marginBottom: 10 }}>
              <label className="fl">Agregar Combo</label>
              <input className="fi" placeholder="Buscar combo..." value={comboQ} onChange={e => { setComboQ(e.target.value); setComboDD(true); }} onFocus={() => setComboDD(true)} onBlur={() => setTimeout(() => setComboDD(false), 250)} />
              {comboDD && comboAvail.length > 0 && (<div className="dd">{comboAvail.map(c => {
                const comboSubtotal = c.items.reduce((s, ci) => { const a = articles.find(x => x.id === ci.articleId); return s + (ci.qty || 0) * (a?.salePrice || 0); }, 0);
                return (<div key={c.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addComboToTicket(c); }}>
                  <span>{c.name} <span style={{ color: "var(--tx3)", fontSize: 11 }}>({c.items.length} artíc.)</span></span>
                  <span style={{ fontWeight: 600, color: "var(--ac)", fontSize: 12 }}>{money(c.suggestedPrice || comboSubtotal)}</span>
                </div>);
              })}</div>)}
            </div>
          )}

          {/* COMPOSITE */}
          {showComp && (
            <div className="comp-ingr" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "var(--ac)", marginBottom: 8, textTransform: "uppercase" }}>Producto Compuesto</div>
              <div className="fr">
                <div className="fg"><label className="fl">Nombre</label><input className="fi" value={compName} onChange={e => setCompName(e.target.value)} placeholder="Ej: Sandwich Jamón y Queso" /></div>
                <div className="fg"><label className="fl">Precio Venta</label><input className="fi" type="number" step="0.01" min="0" value={compPrice} onChange={e => setCompPrice(e.target.value)} /></div>
              </div>
              <div className="fg" style={{ position: "relative" }}>
                <label className="fl">Agregar Ingrediente</label>
                <input className="fi" placeholder="Buscar..." value={compQ} onChange={e => { setCompQ(e.target.value); setCompDD(true); }} onFocus={() => compQ && setCompDD(true)} onBlur={() => setTimeout(() => setCompDD(false), 250)} />
                {compDD && compAvail.length > 0 && (<div className="dd">{compAvail.map(a => (<div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addIngr(a); }}><span>{a.name}</span><span style={{ fontSize: 11, color: "var(--tx3)" }}>{money(a.purchasePrice)}/u</span></div>))}</div>)}
              </div>
              {compIngr.length > 0 && (<div style={{ margin: "8px 0" }}>
                {compIngr.map((ing, idx) => (<div className="comp-ingr-r" key={ing.articleId}><span style={{ flex: 2, fontWeight: 500 }}>{ing.name}</span><input className="fi" type="number" step="0.01" min="0.01" value={ing.qty} onChange={e => updIngr(idx, "qty", parseFloat(e.target.value) || 0)} style={{ width: 70, padding: "4px 7px", fontSize: 12 }} /><span style={{ fontSize: 11, color: "var(--tx3)" }}>{ing.unit} × {money(ing.costPrice)}</span><span style={{ fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: "right" }}>{money(ing.qty * ing.costPrice)}</span><button className="btn-i" onClick={() => setCompIngr(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--rd)", padding: 2 }}>{I.trash}</button></div>))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", borderTop: "1px solid var(--br)", marginTop: 6, fontSize: 12 }}><span style={{ fontWeight: 600 }}>Costo: {money(compCost)}</span>{compPrice && <span style={{ fontWeight: 600, color: "var(--gn)" }}>Ganancia: {money(parseFloat(compPrice) - compCost)}</span>}</div>
              </div>)}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn btn-p btn-sm" disabled={!compName.trim() || !compPrice || compIngr.length === 0} onClick={addComposite}>{I.check} Agregar al Ticket</button>
                <button className="btn btn-s btn-sm" onClick={() => setShowComp(false)}>Cancelar</button>
              </div>
            </div>
          )}

          {/* ITEMS GRID */}
          {items.length > 0 && (<>
            {/* Discount selector */}
            <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "10px 0 6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", textTransform: "uppercase" }}>Descuento:</span>
              {[["none","Sin descuento"],["item","Por ítem"],["percent","% sobre total"]].map(([v,l]) => (
                <label key={v} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 12, fontWeight: discountMode === v ? 600 : 400, color: discountMode === v ? "var(--ac)" : "var(--tx3)" }}>
                  <input type="radio" name="disc" checked={discountMode === v} onChange={() => setDiscountMode(v)} style={{ accentColor: "var(--ac)" }} />{l}
                </label>
              ))}
              {discountMode === "percent" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input className="fi" type="number" step="1" min="0" max="100" value={discountPct || ""} onChange={e => setDiscountPct(parseFloat(e.target.value) || 0)} style={{ width: 60, padding: "4px 8px", fontSize: 13, fontWeight: 600, textAlign: "center" }} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>%</span>
                </div>
              )}
            </div>

            <div className="ti" style={swapIdx !== null ? { overflow: "visible" } : {}}>
              <div className="ti-r ti-h" style={{ gridTemplateColumns: discountMode === "item" ? "2fr 60px 80px 80px 80px 32px" : "2fr 70px 90px 100px 36px" }}>
                <span>Artículo</span><span>Cant.</span><span>Unidad</span>{discountMode === "item" && <span>P.Unit.</span>}<span>Subtotal</span><span></span>
              </div>
              {items.map((it, idx) => {
                const art = articles.find(a => a.id === it.articleId);
                const rn = it.articleName || art?.name || "";
                if (it.isComboItem) {
                  return (
                    <div className="ti-r" key={it.articleId + "_" + idx} style={{ gridTemplateColumns: "2fr 60px 90px 36px 36px", paddingLeft: 16, background: "var(--bg3)", opacity: 0.9 }}>
                      <div style={{ fontSize: 12, color: "var(--tx3)", alignSelf: "center" }}>└ {rn}</div>
                      <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, "quantity", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12 }} />
                      <span style={{ fontSize: 11, color: "var(--tx3)", alignSelf: "center" }}>{unitLabel(it.unit)}</span>
                      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <button className="btn-i" title="Cambiar artículo" onClick={() => { setSwapIdx(swapIdx === idx ? null : idx); setSwapQ(""); }} style={{ fontSize: 11, padding: 3 }}>⇄</button>
                        {swapIdx === idx && (<div className="dd" style={{ top: "100%", right: 0, minWidth: 220, zIndex: 100 }}>
                          <div style={{ padding: "6px 8px 4px" }}><input className="fi" autoFocus placeholder="Buscar..." value={swapQ} onChange={e => setSwapQ(e.target.value)} style={{ fontSize: 12, padding: "4px 8px" }} onBlur={() => setTimeout(() => setSwapIdx(null), 300)} /></div>
                          {swapAvail.map(a => (<div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); swapComboItem(idx, a); }}><span style={{ fontSize: 12 }}>{a.name}</span><span style={{ fontSize: 11, color: "var(--tx3)" }}>{money(a.purchasePrice)}</span></div>))}
                        </div>)}
                      </div>
                      <button className="btn-i" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--rd)", border: "none", padding: 3 }}>{I.trash}</button>
                    </div>
                  );
                }
                return (
                  <div className="ti-r" key={it.articleId || idx} style={{ gridTemplateColumns: discountMode === "item" ? "2fr 60px 80px 80px 80px 32px" : "2fr 70px 90px 100px 36px" }}>
                    <div>
                      <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>{rn}{it.isComposite && <span className="comp-badge">Compuesto</span>}{it.isComboPrice && <span className="comp-badge" style={{ background: "var(--ac)", color: "#fff" }}>Combo</span>}</div>
                      <div style={{ fontSize: 11, color: "var(--ac)" }}>{money(it.unitPrice)}/{it.unit}
                        {discountMode === "item" && it.unitPrice !== it.origPrice && <span style={{ textDecoration: "line-through", color: "var(--tx3)", marginLeft: 4 }}>{money(it.origPrice)}</span>}
                      </div>
                      {it.isComposite && it.ingredients && <div style={{ fontSize: 10, color: "var(--tx3)" }}>{it.ingredients.map(i => `${i.name}(${i.qty}${i.unit})`).join(" + ")}</div>}
                      {!it.isComposite && !it.isComboPrice && it.quantity > (it.stock || 9999) && <div style={{ fontSize: 10, color: "var(--rd)" }}>⚠ Stock: {it.stock}</div>}
                    </div>
                    <input className="fi" type="number" step="0.01" min="0.01" value={it.quantity} onChange={e => updItem(idx, "quantity", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12 }} />
                    <select className="fs" value={it.unit} onChange={e => updItem(idx, "unit", e.target.value)} style={{ padding: "5px 7px", fontSize: 12 }}>
                      {it.isComposite || it.isComboPrice ? <option value="und">Unidad</option> : (art?.units || ["kg"]).map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
                    </select>
                    {discountMode === "item" && <input className="fi" type="number" step="0.01" min="0" value={it.unitPrice} onChange={e => updItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} style={{ padding: "5px 7px", fontSize: 12, background: it.unitPrice !== it.origPrice ? "var(--ywL)" : "var(--bg2)" }} />}
                    <span style={{ fontWeight: 600 }}>{money(it.subtotal)}</span>
                    <button className="btn-i" onClick={() => {
                      if (it.isComboPrice) { setItems(prev => prev.filter(i => i.comboGroupId !== it.comboGroupId)); }
                      else { setItems(prev => prev.filter((_, i) => i !== idx)); }
                    }} style={{ color: "var(--rd)", border: "none", padding: 3 }}>{I.trash}</button>
                  </div>
                );
              })}
            </div>

            {/* TOTALS */}
            <div style={{ marginTop: 10, padding: "12px 16px", background: "var(--bg3)", borderRadius: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>Subtotal</span><span style={{ fontWeight: 600 }}>{money(subtotal)}</span></div>
              {totalDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--rd)", marginTop: 4 }}>
                  <span>Descuento {discountMode === "percent" ? `(${discountPct}%)` : "(por ítem)"}</span>
                  <span style={{ fontWeight: 600 }}>- {money(totalDiscount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginTop: 6, paddingTop: 6, borderTop: "2px solid var(--br)", fontFamily: "'Fraunces',serif" }}>
                <span>Total</span><span style={{ color: "var(--ac)" }}>{money(total)}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--gn)", marginTop: 2 }}>Ganancia: {showProfit ? money(profit) : "$ ••••••"}</div>
            </div>

            {/* PAYMENT */}
            <div style={{ marginTop: 14 }}>
              <label className="fl">Cobro</label>
              <div className="pm-grid" style={{ marginBottom: 8 }}>
                {payMethods.map(pm => (
                  <button key={pm.id} type="button" className={`pm-chip ${pm1 === pm.id ? "on" : ""}`} onClick={() => { setPm1(pm.id); setPm1Amount(""); }}>{pm1 === pm.id && I.check} {pm.name}</button>
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: isMixed ? "var(--ac)" : "var(--tx3)", marginBottom: 8 }}>
                <input type="checkbox" checked={isMixed} onChange={e => { setIsMixed(e.target.checked); setPm1Amount(""); setPm2(""); setCashReceived(""); }} style={{ accentColor: "var(--ac)" }} /> Pago Mixto (2 métodos)
              </label>

              {isMixed ? (
                <div style={{ background: "var(--bg3)", borderRadius: 10, padding: 12 }}>
                  <div className="fr">
                    <div className="fg">
                      <label className="fl">{pmLabel(pm1)} — Monto</label>
                      <input className="fi" type="number" step="0.01" min="0" value={pm1Amount} onChange={e => setPm1Amount(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="fg">
                      <label className="fl">Segundo método</label>
                      <div className="pm-grid">{payMethods.filter(p => p.id !== pm1).map(pm => (
                        <button key={pm.id} type="button" className={`pm-chip ${pm2 === pm.id ? "on" : ""}`} onClick={() => setPm2(pm.id)} style={{ padding: "5px 10px", fontSize: 11 }}>{pm2 === pm.id && I.check} {pm.name}</button>
                      ))}</div>
                    </div>
                  </div>
                  {pm1Val > 0 && pm2 && (
                    <div style={{ marginTop: 8, padding: "8px 10px", background: "var(--bg2)", borderRadius: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{pmLabel(pm2)}: <span style={{ color: "var(--ac)" }}>{money(pm2Pending)}</span></div>
                      {isEf2 && (
                        <div className="fr" style={{ marginTop: 6 }}>
                          <div className="fg" style={{ marginBottom: 0 }}><label className="fl" style={{ fontSize: 10 }}>Recibido en efectivo</label>
                            <input className="fi" type="number" step="0.01" min="0" value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder={money(pm2Pending)} style={{ fontSize: 12 }} /></div>
                          {pm2Val > 0 && <div className="fg" style={{ marginBottom: 0 }}><label className="fl" style={{ fontSize: 10 }}>Vuelto</label>
                            <input className="fi" readOnly value={money(Math.max(0, pm2Val - pm2Pending))} style={{ fontWeight: 600, color: pm2Val > pm2Pending ? "var(--ac)" : "var(--tx3)", background: "var(--bg3)", fontSize: 12 }} /></div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : isEfectivo(pm1) ? (
                <div className="fr">
                  <div className="fg"><label className="fl">Monto recibido</label><input className="fi" type="number" step="0.01" min="0" value={pm1Amount} onChange={e => setPm1Amount(e.target.value)} placeholder={money(total)} /></div>
                  <div className="fg"><label className="fl">Vuelto</label><input className="fi" readOnly value={pm1Val ? money(vuelto) : "—"} style={{ fontWeight: 600, color: vuelto > 0 ? "var(--ac)" : "var(--tx3)", background: "var(--bg3)" }} /></div>
                </div>
              ) : null}
            </div>
          </>)}
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={items.length === 0 || !pm1 || (isMixed && (!pm2 || !pm1Amount))} onClick={handleSave}>
            {editData ? "Guardar Cambios" : "Registrar Venta"}
          </button>
          {items.length > 0 && !pm1 && <span style={{ fontSize: 10, color: "var(--rd)", marginTop: 4 }}>⚠ Seleccioná un método de pago</span>}
          {items.length > 0 && isMixed && (!pm2 || !pm1Amount) && <span style={{ fontSize: 10, color: "var(--rd)", marginTop: 4 }}>⚠ Completá el pago mixto</span>}
        </div>
      </div>
    </div>
  );
}

// ============ DEVOLUCIONES ============
function DevolucionesPage({ articles, purchases, devoluciones, onSave, onDelete, onStatusChange, notify }) {
  const [showForm, setShowForm] = useState(false);
  const [selPurch, setSelPurch] = useState(null);
  const [devItems, setDevItems] = useState([]);
  const [devObs, setDevObs] = useState("");
  const [delConfirm, setDelConfirm] = useState(null);
  const [provFilter, setProvFilter] = useState("");
  const [facSearch, setFacSearch] = useState("");
  const sorted = useMemo(() => [...devoluciones].sort((a, b) => new Date(b.date) - new Date(a.date)), [devoluciones]);
  const [statusEdit, setStatusEdit] = useState(null);

  const STATUSES = [{ value: "pendiente", label: "Pendiente", css: "b-yw" }, { value: "credito", label: "Con Crédito", css: "b-ac" }, { value: "repuesto", label: "Repuesto", css: "b-gn" }];

  const initDev = (p) => {
    setSelPurch(p);
    setDevItems(p.items.map(it => ({ ...it, devQty: 0, selected: false })));
    setDevObs("");
    setShowForm(true);
  };

  const toggleItem = (idx) => setDevItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, selected: !it.selected, devQty: !it.selected ? it.quantity : 0 }));
  const updDevQty = (idx, val) => setDevItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, devQty: val }));

  const saveDev = () => {
    const active = devItems.filter(it => it.selected && it.devQty > 0);
    if (active.length === 0) { notify("⚠ Seleccioná al menos un artículo"); return; }
    const totalVal = active.reduce((s, it) => s + it.devQty * (it.unitCost || 0), 0);
    const dev = {
      purchaseId: selPurch.id, supplier: selPurch.supplier, invoiceNum: selPurch.invoiceNum,
      items: active.map(it => ({ articleId: it.articleId, articleName: it.articleName, devQty: it.devQty, unitCost: it.unitCost, unit: it.unit })),
      totalValue: totalVal, obs: devObs
    };
    onSave(dev);
    setShowForm(false); setSelPurch(null);
  };

  const handleDel = (id) => {
    const ok = onDelete(id);
    if (ok !== false) setDelConfirm(null);
  };

  const totalPend = sorted.filter(d => d.status === "pendiente").reduce((s, d) => s + (d.totalValue || 0), 0);
  const totalCred = sorted.filter(d => d.status === "credito").reduce((s, d) => s + (d.totalValue || 0), 0);
  const totalRep = sorted.filter(d => d.status === "repuesto").reduce((s, d) => s + (d.totalValue || 0), 0);

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Total Devoluciones</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{devoluciones.length}</div><div className="kpi-s">{money(totalPend + totalCred + totalRep)}</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Pendientes</div><div className="kpi-val">{money(totalPend)}</div><div className="kpi-s">{sorted.filter(d => d.status === "pendiente").length} · Monto suspendido</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Con Crédito</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(totalCred)}</div><div className="kpi-s">Reduce costo compras</div></div>
        <div className="kpi kpi-r"><div className="kpi-l">Repuestos</div><div className="kpi-val">{money(totalRep)}</div><div className="kpi-s">{sorted.filter(d => d.status === "repuesto").length} reposiciones</div></div>
      </div>

      {!showForm && (
        <div style={{ marginBottom: 18 }}>
          <label className="fl">Seleccioná una factura de compra para devolver</label>
          <div style={{ display: "flex", gap: 10, marginTop: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="fi" placeholder="Buscar por proveedor o nº factura..." value={facSearch} onChange={e => setFacSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <select className="fs" style={{ width: "auto" }} value={provFilter} onChange={e => setProvFilter(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {[...new Set(purchases.map(p => p.supplier))].sort().map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gap: 8, maxHeight: 300, overflowY: "auto" }}>
            {purchases.length === 0 ? <div className="empty"><p>No hay compras registradas</p></div> :
              [...purchases]
                .filter(p => (!provFilter || p.supplier === provFilter) && (!facSearch || (p.supplier || "").toLowerCase().includes(facSearch.toLowerCase()) || (p.invoiceNum || "").toLowerCase().includes(facSearch.toLowerCase())))
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map(p => (
                <div key={p.id} onClick={() => initDev(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg2)", borderRadius: 8, border: "1px solid var(--br)", cursor: "pointer", transition: "all .15s", fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ac)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--br)"}>
                  <div><span style={{ fontWeight: 600 }}>{p.supplier}</span> <span style={{ color: "var(--tx3)", fontSize: 11 }}>· {p.invoiceNum || "S/N"} · {fDate(p.date)}</span></div>
                  <span style={{ fontWeight: 600 }}>{money(p.total)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {showForm && selPurch && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-h"><h3>Devolver de: {selPurch.supplier} · {selPurch.invoiceNum || "S/N"}</h3><button className="btn-i" onClick={() => setShowForm(false)}>{I.x}</button></div>
          <div className="card-b">
            <div className="merma-grid">
              <div className="merma-row merma-row-h" style={{ gridTemplateColumns: "30px 2fr 70px 70px 80px 80px" }}><span></span><span>Artículo</span><span>Stock</span><span>Comprado</span><span>Devolver</span><span>Valor</span></div>
              {devItems.map((it, idx) => {
                const currentArt = articles.find(a => a.id === it.articleId);
                const currentStock = currentArt?.stock ?? 0;
                return (
                <div className="merma-row" key={idx} style={{ gridTemplateColumns: "30px 2fr 70px 70px 80px 80px", opacity: it.selected ? 1 : 0.5 }}>
                  <input type="checkbox" checked={it.selected} onChange={() => toggleItem(idx)} style={{ accentColor: "var(--ac)" }} />
                  <span style={{ fontWeight: 500 }}>{it.articleName}</span>
                  <span style={{ fontSize: 11, color: currentStock <= 0 ? "var(--rd)" : "var(--gn)", fontWeight: 600 }}>{currentStock.toFixed(2)}</span>
                  <span style={{ fontSize: 12 }}>{it.quantity} {it.unit}</span>
                  <input className="fi" type="number" step="0.01" min="0.01" max={Math.min(it.quantity, currentStock)} value={it.devQty || ""} onChange={e => updDevQty(idx, Math.min(it.quantity, currentStock, parseFloat(e.target.value) || 0))} disabled={!it.selected} style={{ padding: "4px 7px", fontSize: 12 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--rd)" }}>{it.selected && it.devQty > 0 ? money(it.devQty * (it.unitCost || 0)) : "—"}</span>
                </div>);
              })}
            </div>
            <div className="fg" style={{ marginTop: 10 }}><label className="fl">Observaciones</label><input className="fi" value={devObs} onChange={e => setDevObs(e.target.value)} placeholder="Motivo de devolución (opcional)" /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-s" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn btn-p" onClick={saveDev}>Registrar Devolución</button>
            </div>
          </div>
        </div>
      )}

      {/* LIST */}
      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Artículos</th><th>Valor</th><th>Estado</th><th style={{ width: 80 }}></th></tr></thead>
          <tbody>
            {sorted.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>No hay devoluciones registradas</p></div></td></tr> :
              sorted.map(d => {
                const linkedPurch = purchases.find(p => p.devolucionId === d.id);
                return (
                <tr key={d.id}>
                  <td style={{ fontSize: 12 }}>{fDateTime(d.date)}</td>
                  <td style={{ fontWeight: 500 }}>{d.supplier}</td>
                  <td>{d.invoiceNum || "—"}</td>
                  <td style={{ fontSize: 11 }}>
                    {(d.items || []).map(it => `${it.articleName} (${it.devQty})`).join(", ")}
                    {linkedPurch && (
                      <div style={{ fontSize: 10, color: "#7C3AED", marginTop: 2 }}>🔗 Repuesta con compra del {fDate(linkedPurch.date)}</div>
                    )}
                  </td>
                  <td style={{ fontWeight: 600, color: "var(--rd)" }}>{money(d.totalValue)}</td>
                  <td>
                    {statusEdit === d.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        {STATUSES.map(st => (
                          <button key={st.value} className={`btn btn-sm ${d.status === st.value ? "btn-p" : "btn-s"}`} onClick={() => { onStatusChange(d.id, st.value); setStatusEdit(null); }} style={{ padding: "3px 8px", fontSize: 10 }}>{st.label}</button>
                        ))}
                      </div>
                    ) : (
                      <span className={`badge ${STATUSES.find(st => st.value === d.status)?.css || "b-yw"}`} onClick={() => !linkedPurch ? setStatusEdit(d.id) : null} style={{ cursor: linkedPurch ? "default" : "pointer" }}>
                        {STATUSES.find(st => st.value === d.status)?.label || d.status}
                      </span>
                    )}
                  </td>
                  <td><div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {isPrevMonth(d.date) ? <span className="lock-badge">{I.lock}</span> :
                      delConfirm === d.id ? (
                        <><button className="btn-i" onClick={() => handleDel(d.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                        <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                      ) : (<button className="btn-i" onClick={() => setDelConfirm(d.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>)}
                  </div></td>
                </tr>);
              })}
          </tbody>
        </table>
      </div></div></div>

      <div style={{ marginTop: 16, padding: 16, background: "var(--bg3)", borderRadius: 10, fontSize: 12, color: "var(--tx3)" }}>
        <strong style={{ color: "var(--tx2)" }}>Impacto financiero:</strong> Las devoluciones "Pendientes" quedan como monto suspendido. Las "Con Crédito" reducen el costo de compras del período. Las "Repuestas" se cargan como compra nueva vinculada en el módulo de Compras.
      </div>
    </div>
  );
}

// ============ MERMA ============

// ============ MERMA ============
function MermaPage({ articles, mermas, refresh, notify }) {
  const [tab, setTab] = useState("corte");
  const [delConfirm, setDelConfirm] = useState(null);
  const corteArts = articles.filter(a => a.active !== false && a.isCorte);
  const sorted = useMemo(() => [...mermas].sort((a, b) => new Date(b.date) - new Date(a.date)), [mermas]);

  const totalPerdida = mermas.reduce((s, m) => s + (m.lossValue || 0), 0);
  const totalAprov = mermas.filter(m => m.type === "corte").reduce((s, m) => s + (m.items || []).reduce((a, it) => a + (it.aprovQty || 0) * (it.costPrice || 0), 0), 0);
  const countCorte = mermas.filter(m => m.type === "corte").length;
  const countVenc = mermas.filter(m => m.type === "vencimiento").length;

  // Corte form state
  const [corteDate, setCorteDate] = useState(new Date().toISOString().slice(0, 10));
  const [corteItems, setCorteItems] = useState([]);
  const [corteObs, setCorteObs] = useState("");
  const [showCorteForm, setShowCorteForm] = useState(false);

  const initCorte = () => {
    setCorteItems(corteArts.map(a => ({ articleId: a.id, articleName: a.name, lostQty: 0, aprovQty: 0, costPrice: a.purchasePrice || 0, unit: (a.units || ["kg"])[0] })));
    setCorteDate(new Date().toISOString().slice(0, 10));
    setCorteObs("");
    setShowCorteForm(true);
  };

  const updCorte = (idx, key, val) => setCorteItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, [key]: val }));

  const saveCorte = async () => {
    const active = corteItems.filter(it => (it.lostQty > 0 || it.aprovQty > 0));
    if (active.length === 0) { notify("⚠ Ingresá al menos una cantidad"); return; }
    const lossValue = active.reduce((s, it) => s + it.lostQty * it.costPrice, 0);
    const m = { id: uid(), type: "corte", date: new Date(corteDate).toISOString(), items: active, lossValue, obs: corteObs };
    // Deduct stock
    const upd = articles.map(a => ({ ...a }));
    active.forEach(it => {
      const idx = upd.findIndex(a => a.id === it.articleId);
      if (idx > -1) upd[idx] = { ...upd[idx], stock: Math.max(0, (upd[idx].stock || 0) - it.lostQty - it.aprovQty) };
    });
    // Stock deducted by triggers not applicable here - manual update
    for (const it of active) { const a = articles.find(x => x.id === it.articleId); if (a) await db.updateArticle(a.id, { ...a, stock: Math.max(0, a.stock - it.lostQty - it.aprovQty) }); }
    await db.insertMerma(m);
    await refresh();
    setShowCorteForm(false);
    notify(`Merma de corte registrada · Pérdida: ${money(lossValue)}`);
  };

  // Vencimiento form state
  const [showVencForm, setShowVencForm] = useState(false);
  const [vencArt, setVencArt] = useState(null);
  const [vencQ, setVencQ] = useState("");
  const [vencDate, setVencDate] = useState(new Date().toISOString().slice(0, 10));
  const [vencObs, setVencObs] = useState("");
  const [vencSearch, setVencSearch] = useState("");
  const [vencDD, setVencDD] = useState(false);

  const vencAvail = vencSearch ? articles.filter(a => a.active !== false && (a.name || "").toLowerCase().includes(vencSearch.toLowerCase())).slice(0, 8) : [];

  const saveVenc = async () => {
    if (!vencArt || !vencQ || parseFloat(vencQ) <= 0) { notify("⚠ Seleccioná artículo y cantidad"); return; }
    const qty = parseFloat(vencQ);
    const cost = vencArt.purchasePrice || 0;
    const lossValue = qty * cost;
    const m = { id: uid(), type: "vencimiento", date: new Date(vencDate).toISOString(), items: [{ articleId: vencArt.id, articleName: vencArt.name, lostQty: qty, aprovQty: 0, costPrice: cost, unit: (vencArt.units || ["kg"])[0] }], lossValue, obs: vencObs };
    const upd = articles.map(a => ({ ...a }));
    const idx = upd.findIndex(a => a.id === vencArt.id);
    if (idx > -1) upd[idx] = { ...upd[idx], stock: Math.max(0, (upd[idx].stock || 0) - qty) };
    const art = articles.find(x => x.id === vencArt.id);
    if (art) await db.updateArticle(art.id, { ...art, stock: Math.max(0, art.stock - qty) });
    await db.insertMerma(m);
    await refresh();
    setShowVencForm(false); setVencArt(null); setVencQ(""); setVencObs("");
    notify(`Merma por vencimiento registrada · Pérdida: ${money(lossValue)}`);
  };

  const handleDel = async (id) => {
    const m = mermas.find(x => x.id === id);
    if (!m) return;
    if (isPrevMonth(m.date)) { notify("⚠ No se puede eliminar: período cerrado"); setDelConfirm(null); return; }
    // Revert stock
    const upd = articles.map(a => ({ ...a }));
    (m.items || []).forEach(it => {
      const idx = upd.findIndex(a => a.id === it.articleId);
      if (idx > -1) upd[idx] = { ...upd[idx], stock: (upd[idx].stock || 0) + (it.lostQty || 0) + (it.aprovQty || 0) };
    });
    // Revert stock
    for (const it of (m.items||[])) { const a = articles.find(x => x.id === it.articleId); if (a) await db.updateArticle(a.id, { ...a, stock: a.stock + (it.lostQty||0) + (it.aprovQty||0) }); }
    await db.deleteMerma(id);
    await refresh();
    setDelConfirm(null);
    notify("Merma eliminada · Stock revertido");
  };

  const corteLossTotal = corteItems.reduce((s, it) => s + it.lostQty * it.costPrice, 0);

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-r"><div className="kpi-l">Pérdida Total</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(totalPerdida)}</div><div className="kpi-s">{mermas.length} registros</div></div>
        <div className="kpi kpi-y"><div className="kpi-l">Cierres de Corte</div><div className="kpi-val">{countCorte}</div></div>
        <div className="kpi kpi-o"><div className="kpi-l">Vencimientos</div><div className="kpi-val">{countVenc}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Merma Aprovechada</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(totalAprov)}</div><div className="kpi-s">Valor en insumos</div></div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <div className={`tab ${tab === "corte" ? "on" : ""}`} onClick={() => setTab("corte")}>Cierre de Corte</div>
          <div className={`tab ${tab === "vencimiento" ? "on" : ""}`} onClick={() => setTab("vencimiento")}>Vencimiento</div>
          <div className={`tab ${tab === "historial" ? "on" : ""}`} onClick={() => setTab("historial")}>Historial</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tab === "corte" && <button className="btn btn-p" onClick={initCorte}>{I.plus} Cierre de Corte</button>}
          {tab === "vencimiento" && <button className="btn btn-p" onClick={() => setShowVencForm(true)}>{I.plus} Merma por Vencimiento</button>}
        </div>
      </div>

      {/* CORTE FORM */}
      {showCorteForm && tab === "corte" && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-h"><h3>Cierre de Corte Diario</h3><button className="btn-i" onClick={() => setShowCorteForm(false)}>{I.x}</button></div>
          <div className="card-b">
            <div className="fr">
              <div className="fg"><label className="fl">Fecha</label><input className="fi" type="date" value={corteDate} onChange={e => setCorteDate(e.target.value)} /></div>
              <div className="fg"><label className="fl">Observaciones</label><input className="fi" value={corteObs} onChange={e => setCorteObs(e.target.value)} placeholder="Opcional" /></div>
            </div>
            {corteArts.length === 0 ? (
              <div className="empty"><p>No hay artículos marcados como "de corte". Editá un artículo en Inventario y activá el checkbox "Es artículo de corte".</p></div>
            ) : (
              <>
                <div className="merma-grid">
                  <div className="merma-row merma-row-h"><span>Artículo</span><span>Perdida</span><span>Aprovech.</span><span>P.Compra</span><span>Pérdida $</span></div>
                  {corteItems.map((it, idx) => (
                    <div className="merma-row" key={it.articleId}>
                      <div style={{ fontWeight: 500 }}>{it.articleName}<div style={{ fontSize: 10, color: "var(--tx3)" }}>Stock: {articles.find(a => a.id === it.articleId)?.stock?.toFixed(2) || 0} {it.unit}</div></div>
                      <input className="fi" type="number" step="0.01" min="0" value={it.lostQty || ""} onChange={e => updCorte(idx, "lostQty", parseFloat(e.target.value) || 0)} placeholder="0" style={{ padding: "5px 7px", fontSize: 12 }} />
                      <input className="fi" type="number" step="0.01" min="0" value={it.aprovQty || ""} onChange={e => updCorte(idx, "aprovQty", parseFloat(e.target.value) || 0)} placeholder="0" style={{ padding: "5px 7px", fontSize: 12 }} />
                      <span style={{ fontSize: 12, color: "var(--tx2)" }}>{money(it.costPrice)}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: it.lostQty > 0 ? "var(--rd)" : "var(--tx3)" }}>{money(it.lostQty * it.costPrice)}</span>
                    </div>
                  ))}
                </div>
                <div className="tt" style={{ marginTop: 10 }}><span className="tt-l">Pérdida Total del Corte</span><span className="tt-v" style={{ color: "var(--rd)" }}>{money(corteLossTotal)}</span></div>
                <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                  <button className="btn btn-s" onClick={() => setShowCorteForm(false)}>Cancelar</button>
                  <button className="btn btn-p" onClick={saveCorte}>Registrar Cierre de Corte</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* VENCIMIENTO FORM */}
      {showVencForm && tab === "vencimiento" && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-h"><h3>Merma por Vencimiento</h3><button className="btn-i" onClick={() => setShowVencForm(false)}>{I.x}</button></div>
          <div className="card-b">
            <div className="fr">
              <div className="fg"><label className="fl">Fecha</label><input className="fi" type="date" value={vencDate} onChange={e => setVencDate(e.target.value)} /></div>
              <div className="fg" style={{ position: "relative" }}>
                <label className="fl">Artículo</label>
                {vencArt ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--acL)", borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                    {vencArt.name} <button className="btn-i" onClick={() => { setVencArt(null); setVencSearch(""); }} style={{ marginLeft: "auto", padding: 2 }}>{I.x}</button>
                  </div>
                ) : (
                  <>
                    <input className="fi" placeholder="Buscar artículo..." value={vencSearch} onChange={e => { setVencSearch(e.target.value); setVencDD(true); }} onFocus={() => vencSearch && setVencDD(true)} onBlur={() => setTimeout(() => setVencDD(false), 250)} />
                    {vencDD && vencAvail.length > 0 && (
                      <div className="dd">{vencAvail.map(a => (
                        <div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); setVencArt(a); setVencSearch(""); setVencDD(false); }}>
                          <span>{a.name} <span style={{ color: "var(--tx3)", fontSize: 11 }}>({a.stock?.toFixed(2)} {(a.units || [])[0]})</span></span>
                          <span style={{ fontSize: 11, color: "var(--tx3)" }}>{money(a.purchasePrice)}</span>
                        </div>
                      ))}</div>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="fr">
              <div className="fg"><label className="fl">Cantidad Perdida</label><input className="fi" type="number" step="0.01" min="0" value={vencQ} onChange={e => setVencQ(e.target.value)} placeholder={vencArt ? `en ${(vencArt.units || ["kg"])[0]}` : "0"} /></div>
              <div className="fg"><label className="fl">Costo Unitario</label><input className="fi" readOnly value={vencArt ? money(vencArt.purchasePrice || 0) : "—"} /></div>
              <div className="fg"><label className="fl">Valor Pérdida</label><input className="fi" readOnly value={vencArt && vencQ ? money(parseFloat(vencQ) * (vencArt.purchasePrice || 0)) : "—"} style={{ fontWeight: 600, color: "var(--rd)" }} /></div>
            </div>
            <div className="fg"><label className="fl">Observaciones</label><input className="fi" value={vencObs} onChange={e => setVencObs(e.target.value)} placeholder="Motivo, lote, etc. (opcional)" /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <button className="btn btn-s" onClick={() => setShowVencForm(false)}>Cancelar</button>
              <button className="btn btn-p" disabled={!vencArt || !vencQ || parseFloat(vencQ) <= 0} onClick={saveVenc}>Registrar Merma</button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIAL */}
      {(tab === "historial" || (tab === "corte" && !showCorteForm) || (tab === "vencimiento" && !showVencForm)) && (
        <div className="card"><div style={{ padding: 0 }}><div className="tw">
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Artículos</th><th>Pérdida</th><th>Obs</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {sorted.filter(m => tab === "historial" || m.type === tab).length === 0 ? (
                <tr><td colSpan={6}><div className="empty"><p>Sin mermas registradas</p></div></td></tr>
              ) : sorted.filter(m => tab === "historial" || m.type === tab).map(m => (
                <tr key={m.id}>
                  <td style={{ fontSize: 12 }}>{fDateTime(m.date)}</td>
                  <td><span className={`merma-type ${m.type === "corte" ? "merma-perdida" : "merma-venc"}`}>{m.type === "corte" ? "Corte" : "Vencimiento"}</span></td>
                  <td style={{ fontSize: 12 }}>{(m.items || []).map(it => it.articleName).join(", ").slice(0, 50)}{(m.items || []).length > 2 ? "..." : ""}</td>
                  <td style={{ fontWeight: 600, color: "var(--rd)" }}>{money(m.lossValue)}</td>
                  <td style={{ fontSize: 11, color: "var(--tx3)" }}>{m.obs || "—"}</td>
                  <td><div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {isPrevMonth(m.date) ? <span className="lock-badge">{I.lock} Cerrado</span> :
                      delConfirm === m.id ? (
                        <><button className="btn-i" onClick={() => handleDel(m.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button>
                        <button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>
                      ) : (
                        <button className="btn-i" onClick={() => setDelConfirm(m.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>
                      )}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div></div>
      )}
    </div>
  );
}

// ============ COMBOS ============
function CombosPage({ articles, combos, refresh, notify }) {
  const [modal, setModal] = useState(null);
  const [delConfirm, setDelConfirm] = useState(null);

  const handleSave = async (combo) => {
    try {
      if (combo.id) { await db.updateCombo(combo.id, combo); notify("Combo actualizado"); }
      else { await db.insertCombo(combo); notify("Combo creado"); }
      await refresh(); setModal(null);
    } catch(e) { notify("Error: "+e.message); }
  };
  const handleDel = async (id) => { await db.deleteCombo(id); await refresh(); setDelConfirm(null); notify("Combo eliminado"); };
  const toggleActive = async (id) => { const c = combos.find(x => x.id === id); if (c) { await db.updateCombo(id, { ...c, active: !c.active }); await refresh(); } };

  return (
    <div>
      <div className="kpi-g">
        <div className="kpi kpi-o"><div className="kpi-l">Total Combos</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{combos.length}</div></div>
        <div className="kpi kpi-v"><div className="kpi-l">Activos</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{combos.filter(c => c.active !== false).length}</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        <div />
        <button className="btn btn-p" onClick={() => setModal({ name: "", items: [], suggestedPrice: 0 })}>{I.plus} Nuevo Combo</button>
      </div>
      <div className="card"><div style={{ padding: 0 }}><div className="tw">
        <table>
          <thead><tr><th>Combo</th><th>Ítems</th><th>Costo</th><th>Precio Sugerido</th><th>Estado</th><th style={{ width: 100 }}></th></tr></thead>
          <tbody>
            {combos.length === 0 ? <tr><td colSpan={6}><div className="empty"><p>No hay combos. ¡Creá el primero!</p></div></td></tr> :
              combos.map(c => {
                const cost = c.items.reduce((s, ci) => { const a = articles.find(x => x.id === ci.articleId); return s + (ci.qty || 0) * (a?.purchasePrice || 0); }, 0);
                return (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td style={{ fontSize: 11 }}>{c.items.map(ci => { const a = articles.find(x => x.id === ci.articleId); return `${a?.name || ci.name} (${ci.qty} ${ci.unit || "kg"})`; }).join(", ")}</td>
                    <td>{money(cost)}</td>
                    <td style={{ fontWeight: 600, color: "var(--ac)" }}>{money(c.suggestedPrice)}</td>
                    <td><button className={`btn btn-sm ${c.active !== false ? "btn-p" : "btn-s"}`} style={c.active !== false ? { background: "var(--gn)" } : { color: "var(--tx3)" }} onClick={() => toggleActive(c.id)}>{c.active !== false ? <>{I.check} Activo</> : "Inactivo"}</button></td>
                    <td><div style={{ display: "flex", gap: 4 }}>
                      <button className="btn-i" onClick={() => setModal({ ...c })}>{I.edit}</button>
                      {delConfirm === c.id ? (<><button className="btn-i" onClick={() => handleDel(c.id)} style={{ color: "#fff", background: "var(--rd)", border: "1px solid var(--rd)" }}>{I.check}</button><button className="btn-i" onClick={() => setDelConfirm(null)}>{I.x}</button></>) :
                        (<button className="btn-i" onClick={() => setDelConfirm(c.id)} style={{ color: "var(--rd)" }}>{I.trash}</button>)}
                    </div></td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div></div></div>

      {modal && <ComboModal articles={articles} combo={modal} onSave={handleSave} onClose={() => setModal(null)} />}
    </div>
  );
}

function ComboModal({ articles, combo, onSave, onClose }) {
  const [name, setName] = useState(combo.name || "");
  const [comboItems, setComboItems] = useState(combo.items || []);
  const [price, setPrice] = useState(combo.suggestedPrice || 0);
  const [q, setQ] = useState(""); const [dd, setDD] = useState(false);
  const avail = q ? articles.filter(a => a.active !== false && a.name && a.name.toLowerCase().includes(q.toLowerCase()) && !comboItems.find(ci => ci.articleId === a.id)).slice(0, 8) : [];

  const addArt = (a) => {
    setComboItems(prev => [...prev, { articleId: a.id, name: a.name, unit: (a.units || ["kg"])[0], qty: 0.25 }]);
    setQ(""); setDD(false);
  };
  const updCI = (idx, key, val) => setComboItems(prev => prev.map((it, i) => i !== idx ? it : { ...it, [key]: val }));

  const totalCost = comboItems.reduce((s, ci) => { const a = articles.find(x => x.id === ci.articleId); return s + (ci.qty || 0) * (a?.purchasePrice || 0); }, 0);
  const totalRetail = comboItems.reduce((s, ci) => { const a = articles.find(x => x.id === ci.articleId); return s + (ci.qty || 0) * (a?.salePrice || 0); }, 0);

  return (
    <div className="mo" onClick={onClose}>
      <div className="md" onClick={e => e.stopPropagation()}>
        <div className="md-h"><h2>{combo.id ? "Editar" : "Nuevo"} Combo</h2><button className="btn-i" onClick={onClose}>{I.x}</button></div>
        <div className="md-b">
          <div className="fg"><label className="fl">Nombre del Combo</label><input className="fi" value={name} onChange={e => setName(e.target.value)} placeholder='Ej: Combo Yanira' /></div>
          <div className="fg" style={{ position: "relative" }}>
            <label className="fl">Agregar Artículo al Combo</label>
            <input className="fi" placeholder="Buscar artículo..." value={q} onChange={e => { setQ(e.target.value); setDD(true); }} onFocus={() => q && setDD(true)} onBlur={() => setTimeout(() => setDD(false), 250)} />
            {dd && avail.length > 0 && (<div className="dd">{avail.map(a => (<div key={a.id} className="dd-i" onMouseDown={(ev) => { ev.preventDefault(); addArt(a); }}><span>{a.name}</span><span style={{ fontSize: 11, color: "var(--tx3)" }}>{money(a.salePrice)}/u</span></div>))}</div>)}
          </div>
          {comboItems.length > 0 && (
            <div style={{ margin: "8px 0" }}>
              {comboItems.map((ci, idx) => {
                const a = articles.find(x => x.id === ci.articleId);
                return (
                  <div className="comp-ingr-r" key={ci.articleId} style={{ padding: "6px 0" }}>
                    <span style={{ flex: 2, fontWeight: 500 }}>{a?.name || ci.name}</span>
                    <input className="fi" type="number" step="0.01" min="0.01" value={ci.qty} onChange={e => updCI(idx, "qty", parseFloat(e.target.value) || 0)} style={{ width: 70, padding: "4px 7px", fontSize: 12 }} />
                    <select className="fs" value={ci.unit} onChange={e => updCI(idx, "unit", e.target.value)} style={{ width: 80, padding: "4px 7px", fontSize: 12 }}>{UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
                    <span style={{ fontSize: 11, color: "var(--tx3)", minWidth: 65 }}>Vta: {money((ci.qty || 0) * (a?.salePrice || 0))}</span>
                    <button className="btn-i" onClick={() => setComboItems(prev => prev.filter((_, i) => i !== idx))} style={{ color: "var(--rd)", padding: 2 }}>{I.trash}</button>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--br)", marginTop: 6, fontSize: 12 }}>
                <span>Costo total: <strong>{money(totalCost)}</strong></span>
                <span>Precio individual: <strong>{money(totalRetail)}</strong></span>
              </div>
            </div>
          )}
          <div className="fr">
            <div className="fg"><label className="fl">Precio Sugerido del Combo</label><input className="fi" type="number" step="0.01" min="0" value={price || ""} onChange={e => setPrice(parseFloat(e.target.value) || 0)} placeholder="0.00" />
              {price > 0 && totalRetail > 0 && <span style={{ fontSize: 10, color: "var(--gn)", display: "block", marginTop: 2 }}>Descuento implícito: {money(totalRetail - price)} ({((1 - price / totalRetail) * 100).toFixed(1)}% off) · Ganancia: {money(price - totalCost)}</span>}
            </div>
          </div>
        </div>
        <div className="md-f">
          <button className="btn btn-s" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={!name.trim() || comboItems.length === 0 || !price} onClick={() => onSave({ ...combo, name, items: comboItems, suggestedPrice: price })}>
            {combo.id ? "Guardar Cambios" : "Crear Combo"}
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
    await db.deletePayMethod(id); await refresh();
    setDelConfirm(null);
    notify("Método de pago eliminado");
  };

  const toggleActive = async (id) => {
    const pm = payMethods.find(p=>p.id===id); if(pm) { await db.updatePayMethod(id, {...pm, active:!pm.active}); await refresh(); }
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

  const blank = { description: "", category: "Otros", type: "fijo", frequency: "mensual", amount: 0, date: new Date().toISOString().split("T")[0] };

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
          <div className="fr">
            <div className="fg" style={{ flex: 2 }}><label className="fl">Descripción</label><input className="fi" value={f.description} onChange={e => set("description", e.target.value)} placeholder="Ej: Alquiler local Enero 2026" /></div>
            <div className="fg"><label className="fl">Fecha</label><input className="fi" type="date" value={f.date ? (typeof f.date === "string" && f.date.includes("T") ? f.date.split("T")[0] : f.date) : new Date().toISOString().split("T")[0]} onChange={e => set("date", e.target.value)} /></div>
          </div>
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
function AIAdvisorPage({ articles, sales, purchases, expenses, mermas, devoluciones }) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [mode, setMode] = useState("general");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const buildContext = () => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setMonth(now.getMonth() - 1);
    const monthSales = sales.filter(s => new Date(s.date) >= monthAgo);
    const weekSales = sales.filter(s => new Date(s.date) >= weekAgo);
    const prodMap = {};
    monthSales.forEach(s => s.items.forEach(i => {
      if (!prodMap[i.articleId]) prodMap[i.articleId] = { name: i.articleName, rev: 0, qty: 0, count: 0, profit: 0 };
      prodMap[i.articleId].rev += i.subtotal; prodMap[i.articleId].qty += i.quantity;
      prodMap[i.articleId].count++; prodMap[i.articleId].profit += (i.profit || 0);
    }));
    const topProducts = Object.values(prodMap).sort((a, b) => b.rev - a.rev).slice(0, 10);
    const bottomProducts = Object.values(prodMap).sort((a, b) => a.rev - b.rev).slice(0, 5);
    const totalRevMonth = monthSales.reduce((a, s) => a + s.total, 0);
    const totalProfitMonth = monthSales.reduce((a, s) => a + s.profit, 0);
    const totalRevWeek = weekSales.reduce((a, s) => a + s.total, 0);
    const totalExpenses = expenses.reduce((a, e) => a + (e.amount || 0), 0);
    const fixedExpenses = expenses.filter(e => e.type === "fijo").reduce((a, e) => a + (e.amount || 0), 0);
    const lowStock = articles.filter(a => a.active !== false && a.stock > 0 && a.stock <= (a.minStock || 5));
    const outStock = articles.filter(a => a.active !== false && a.stock <= 0 && a.purchasePrice > 0);
    return `DATOS DEL NEGOCIO (fecha: ${fDate(now)}):
VENTAS ÚLTIMO MES: ${money(totalRevMonth)} | Ganancia bruta: ${money(totalProfitMonth)} | Margen: ${totalRevMonth > 0 ? (totalProfitMonth/totalRevMonth*100).toFixed(1) : 0}% | ${monthSales.length} tickets
VENTAS ÚLTIMA SEMANA: ${money(totalRevWeek)} | ${weekSales.length} tickets
GASTOS: ${money(totalExpenses)} (Fijos: ${money(fixedExpenses)}) | Resultado neto: ${money(totalProfitMonth - totalExpenses)}
TOP PRODUCTOS: ${topProducts.map((p,i) => `${i+1}. ${p.name}: ${money(p.rev)} (${p.qty} uds)`).join(", ") || "Sin datos"}
PRODUCTOS LENTOS: ${bottomProducts.map(p => `${p.name}: ${money(p.rev)}`).join(", ") || "Sin datos"}
STOCK CRÍTICO: ${[...outStock.map(a => `SIN STOCK: ${a.name}`), ...lowStock.map(a => `BAJO: ${a.name} (${a.stock})`)].join(", ") || "OK"}
INVENTARIO: ${articles.filter(a => a.active !== false).length} artículos activos`;
  };

  const buildCierreContext = () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const monthNames = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const mesActual = monthNames[now.getMonth()];
    const mesAnterior = monthNames[now.getMonth() === 0 ? 11 : now.getMonth() - 1];

    const mSales = sales.filter(s => new Date(s.date) >= monthStart);
    const pSales = sales.filter(s => { const d = new Date(s.date); return d >= prevMonthStart && d < monthStart; });
    const mPurch = purchases.filter(p => new Date(p.date) >= monthStart);
    const mExp = expenses.filter(e => new Date(e.date) >= monthStart);
    const mMerma = (mermas||[]).filter(m => new Date(m.date) >= monthStart);
    const mDevol = (devoluciones||[]).filter(d => new Date(d.date) >= monthStart);

    const mRev = mSales.reduce((a,s) => a+s.total,0);
    const mProfit = mSales.reduce((a,s) => a+s.profit,0);
    const pRev = pSales.reduce((a,s) => a+s.total,0);
    const pProfit = pSales.reduce((a,s) => a+s.profit,0);
    const mExpTotal = mExp.reduce((a,e) => a+(e.amount||0),0);
    const mMermaVal = mMerma.reduce((a,m) => a+(m.lossValue||0),0);
    const mDevolVal = mDevol.reduce((a,d) => a+(d.totalValue||0),0);
    const mPurchTotal = mPurch.reduce((a,p) => a+p.total,0);
    const netResult = mProfit - mExpTotal - mMermaVal;

    const expByCat = {};
    mExp.forEach(e => { expByCat[e.category] = (expByCat[e.category]||0) + (e.amount||0); });

    const prodMap = {};
    mSales.forEach(s => s.items.forEach(i => {
      if (!prodMap[i.articleId]) prodMap[i.articleId] = { name: i.articleName, rev: 0, qty: 0, profit: 0 };
      prodMap[i.articleId].rev += i.subtotal; prodMap[i.articleId].qty += i.quantity; prodMap[i.articleId].profit += (i.profit||0);
    }));
    const top5 = Object.values(prodMap).sort((a,b) => b.rev - a.rev).slice(0,5);
    const lowStock = articles.filter(a => a.active !== false && a.stock > 0 && a.stock <= (a.minStock||5));
    const outStock = articles.filter(a => a.active !== false && a.stock <= 0 && a.purchasePrice > 0);

    return `CIERRE DE MES — ${mesActual.toUpperCase()} ${now.getFullYear()}:

VENTAS DEL MES: ${money(mRev)} | ${mSales.length} tickets | Ganancia bruta: ${money(mProfit)} | Margen: ${mRev>0?(mProfit/mRev*100).toFixed(1):0}%
COMPRAS DEL MES: ${money(mPurchTotal)} | ${mPurch.length} facturas
GASTOS DEL MES: ${money(mExpTotal)} total
${Object.entries(expByCat).map(([cat,v]) => `  - ${cat}: ${money(v)}`).join("\n") || "  Sin gastos registrados"}
MERMA DEL MES: ${money(mMermaVal)} valorizada | ${mMerma.length} registros
DEVOLUCIONES A PROVEEDOR: ${money(mDevolVal)} | ${mDevol.length} devoluciones
GANANCIA BRUTA: ${money(mProfit)}
GANANCIA NETA: ${money(netResult)} (bruta - gastos - merma)
TOP 5 PRODUCTOS DEL MES:
${top5.map((p,i) => `${i+1}. ${p.name}: ${money(p.rev)} (${p.qty} uds, ganancia: ${money(p.profit)})`).join("\n") || "Sin datos"}
MES ANTERIOR (${mesAnterior}): Ventas: ${money(pRev)} | Ganancia: ${money(pProfit)} | Tickets: ${pSales.length}
VARIACIÓN VS MES ANTERIOR: Ventas ${pRev>0?((mRev-pRev)/pRev*100).toFixed(1):"N/A"}% | Ganancia ${pProfit>0?((mProfit-pProfit)/pProfit*100).toFixed(1):"N/A"}%
ALERTAS DE STOCK AL CIERRE:
${[...outStock.map(a=>`  SIN STOCK: ${a.name}`), ...lowStock.map(a=>`  STOCK BAJO: ${a.name} (${a.stock} ${(a.units||[])[0]||"uds"}, mín: ${a.minStock||5})`)].join("\n") || "  Sin alertas críticas"}`;
  };

  const analyze = async () => {
    setLoading(true); setResponse(null);
    try {
      const prompts = {
        general: `Sos el asesor de negocios de una fiambrería argentina. Analizá los datos y dame un informe ejecutivo completo con recomendaciones accionables.`,
        promos: `Sos el asesor comercial de una fiambrería argentina. Basándote en los datos, recomendá promociones específicas para esta semana. Incluí combos, descuentos por volumen, y estrategias para mover productos lentos.`,
        compras: `Sos el asesor de compras de una fiambrería argentina. Analizá las ventas y stock para recomendar qué comprar esta semana, en qué cantidad, y qué no vale la pena reponer.`,
        costos: `Sos el asesor financiero de una fiambrería argentina. Analizá la estructura de gastos y costos, identificá oportunidades de ahorro, y sugerí cómo mejorar los márgenes.`,
        cierre: `Sos el contador y asesor financiero de una fiambrería argentina. Con los datos del cierre mensual, generá un informe financiero mensual completo: resultado del período, análisis de márgenes, comparativa con el mes anterior, top productos, y recomendaciones concretas para el próximo mes.`,
      };
      const dataContext = mode === "cierre" ? buildCierreContext() : buildContext();
      const resp = await fetch("/api/ai-advisor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompts[mode], dataContext }),
      });
      const data = await resp.json();
      const text = data.text || data.error || "Error";
      setResponse(text);
      const modeLabels = { general: "Informe General", promos: "Promociones", compras: "Qué Comprar", costos: "Optimizar Costos", cierre: "Cierre de Mes" };
      setChatHistory(prev => [...prev, { role: "assistant", text: `[${modeLabels[mode]}]\n${text}` }]);
    } catch (err) {
      setResponse("Error al conectar con el asesor IA. Intentá de nuevo.");
    }
    setLoading(false);
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const ctx = buildContext();
      const systemPrompt = `Sos el asesor de negocios de una fiambrería argentina. Respondé en español argentino, directo y práctico. Basá tus respuestas en los datos reales del negocio que se incluyen en el contexto. Sin markdown excesivo.\n\nCONTEXTO DEL NEGOCIO:\n${ctx}`;
      const apiMessages = [...chatHistory, { role: "user", text: msg }].map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }));
      const resp = await fetch("/api/ai-advisor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, system: systemPrompt }),
      });
      const data = await resp.json();
      const text = data.text || data.error || "Error";
      setChatHistory(prev => [...prev, { role: "assistant", text }]);
    } catch {
      setChatHistory(prev => [...prev, { role: "assistant", text: "Error al conectar con el asesor IA." }]);
    }
    setChatLoading(false);
  };

  const modeLabels = { general: "Informe General", promos: "Promociones Recomendadas", compras: "Recomendaciones de Compra", costos: "Optimización de Costos", cierre: "Cierre de Mes" };

  return (
    <div>
      <div className="ai-card">
        <h3>Asesor Inteligente</h3>
        <p>Claude analiza tus ventas, compras, stock y gastos para darte recomendaciones personalizadas sobre tu fiambrería.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[["general","Informe General"],["promos","Promociones"],["compras","Qué Comprar"],["costos","Optimizar Costos"],["cierre","Cierre de Mes"]].map(([id,label]) => (
            <button key={id} className={`btn btn-sm ${mode === id ? "btn-p" : "btn-s"}`} style={mode !== id ? { background: "rgba(255,255,255,.1)", color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.15)" } : {}} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>
        <button className="ai-btn" onClick={analyze} disabled={loading}>
          {loading ? (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg> Analizando...</>) : (<>{I.brain} Analizar mi negocio</>)}
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
          <div className="card-h"><h3>{modeLabels[mode]}</h3><span style={{ fontSize: 11, color: "var(--tx3)" }}>{fDateTime(new Date())}</span></div>
          <div className="card-b"><div className="ai-resp">{response}</div></div>
        </div>
      )}

      {!response && !loading && chatHistory.length === 0 && (
        <div className="card"><div className="card-b"><div className="empty">
          <div style={{ fontSize: 28, marginBottom: 8 }}>{I.brain}</div>
          <p>Seleccioná un análisis y hacé clic en "Analizar mi negocio", o escribí tu consulta directamente en el chat de abajo.</p>
        </div></div></div>
      )}

      {/* CHAT */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-h">
          <h3>Chat con el Asesor</h3>
          {chatHistory.length > 0 && <button className="btn btn-s" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setChatHistory([])}>Limpiar</button>}
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          {chatHistory.length > 0 && (
            <div style={{ maxHeight: 420, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              {chatHistory.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role === "user" ? "var(--ac)" : "var(--bg3)", color: m.role === "user" ? "#fff" : "var(--tx1)", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {m.text}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2, paddingInline: 4 }}>{m.role === "user" ? "Vos" : "Asesor IA"}</span>
                </div>
              ))}
              {chatLoading && (
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <div style={{ padding: "9px 13px", borderRadius: "12px 12px 12px 2px", background: "var(--bg3)", fontSize: 13, color: "var(--tx3)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginRight: 4 }}><path d="M21 12a9 9 0 11-6.219-8.56"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur=".8s" repeatCount="indefinite"/></path></svg>
                    Pensando...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: chatHistory.length > 0 ? "1px solid var(--br)" : "none" }}>
            <input className="fi" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()} placeholder="Consultá algo sobre tu negocio..." style={{ flex: 1 }} disabled={chatLoading} />
            <button className="btn btn-p" onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{ whiteSpace: "nowrap" }}>Enviar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ REPORTS ============
function ReportsPage({ articles, sales, purchases, expenses, mermas, devoluciones, payMethods, priceHistory }) {
  const [tab, setTab] = useState("pnl");
  const [period, setPeriod] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [priceArtId, setPriceArtId] = useState("");
  const [priceProv, setPriceProv] = useState("");

  const filterP = (arr) => {
    if (customFrom && customTo) {
      const from = new Date(customFrom); from.setHours(0, 0, 0, 0);
      const to = new Date(customTo); to.setHours(23, 59, 59, 999);
      return arr.filter(i => { const d = new Date(i.date); return d >= from && d <= to; });
    }
    if (period === "all") return arr;
    const now = new Date(), start = new Date();
    if (period === "today") start.setHours(0, 0, 0, 0);
    else if (period === "week") start.setDate(now.getDate() - 7);
    else if (period === "month") start.setMonth(now.getMonth() - 1);
    return arr.filter(i => new Date(i.date) >= start);
  };

  const pmName = (id) => (payMethods || []).find(pm => pm.id === id)?.name || id || "Sin definir";

  const pS = filterP(sales), pP = filterP(purchases), pE = filterP(expenses), pM = filterP(mermas || []);
  const pPNormal = pP.filter(p => !p.isReposition);
  const pPRepos = pP.filter(p => p.isReposition);
  const rev = pS.reduce((a, s) => a + s.total, 0);
  const prof = pS.reduce((a, s) => a + s.profit, 0);
  const cost = rev - prof;
  const exp = pPNormal.reduce((a, p) => a + p.total, 0);
  const expRepos = pPRepos.reduce((a, p) => a + p.total, 0);
  const margin = rev > 0 ? (prof / rev * 100) : 0;

  const totalGastos = pE.reduce((a, e) => a + (e.amount || 0), 0);
  const gastosFijos = pE.filter(e => e.type === "fijo").reduce((a, e) => a + (e.amount || 0), 0);
  const gastosVar = pE.filter(e => e.type === "variable").reduce((a, e) => a + (e.amount || 0), 0);

  // Merma analytics
  const mermaCorte = pM.filter(m => m.type === "corte");
  const mermaVenc = pM.filter(m => m.type === "vencimiento");
  const mermaCorteTotal = mermaCorte.reduce((a, m) => a + (m.lossValue || 0), 0);
  const mermaVencTotal = mermaVenc.reduce((a, m) => a + (m.lossValue || 0), 0);
  const mermaTotalLoss = mermaCorteTotal + mermaVencTotal;
  const mermaAprovVal = mermaCorte.reduce((a, m) => a + (m.items || []).reduce((s, it) => s + (it.aprovQty || 0) * (it.costPrice || 0), 0), 0);

  // Merma by article
  const mermaArtMap = {};
  pM.forEach(m => (m.items || []).forEach(it => {
    if (!mermaArtMap[it.articleId]) mermaArtMap[it.articleId] = { name: it.articleName, lostQty: 0, aprovQty: 0, lossVal: 0, count: 0 };
    mermaArtMap[it.articleId].lostQty += it.lostQty || 0;
    mermaArtMap[it.articleId].aprovQty += it.aprovQty || 0;
    mermaArtMap[it.articleId].lossVal += (it.lostQty || 0) * (it.costPrice || 0);
    mermaArtMap[it.articleId].count++;
  }));
  const mermaByArt = Object.values(mermaArtMap).sort((a, b) => b.lossVal - a.lossVal);
  const maxMermaArt = mermaByArt[0]?.lossVal || 1;

  // Devoluciones analytics by status
  const pD = filterP(devoluciones || []);
  const devolTotal = pD.reduce((a, d) => a + (d.totalValue || 0), 0);
  const devolPend = pD.filter(d => d.status === "pendiente");
  const devolCred = pD.filter(d => d.status === "credito");
  const devolRep = pD.filter(d => d.status === "repuesto");
  const devolPendVal = devolPend.reduce((a, d) => a + (d.totalValue || 0), 0);
  const devolCredVal = devolCred.reduce((a, d) => a + (d.totalValue || 0), 0);
  const devolRepVal = devolRep.reduce((a, d) => a + (d.totalValue || 0), 0);

  // Net result: profit - gastos - merma + créditos devol
  const netResult = prof - totalGastos - mermaTotalLoss + devolCredVal;

  // Discount analytics
  const totalDiscounts = pS.reduce((a, s) => a + (s.discountAmount || 0), 0);
  const discItemTotal = pS.filter(s => s.discountMode === "item").reduce((a, s) => a + (s.discountAmount || 0), 0);
  const discPctTotal = pS.filter(s => s.discountMode === "percent").reduce((a, s) => a + (s.discountAmount || 0), 0);

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
  const periodLabel = (customFrom && customTo) ? `${customFrom} al ${customTo}` : period === "all" ? "Todo" : period === "today" ? "Hoy" : period === "week" ? "Semana" : "Mes";

  const downloadExcel = () => {
    const sheets = [];
    // P&L sheet
    const pnlRows = [
      ["Estado de Resultados (P&L)", "", `Período: ${periodLabel}`],
      [],
      ["Concepto", "Monto"],
      ["Ingresos por Ventas", moneyNum(rev)],
      ["(-) Descuentos Otorgados", moneyNum(-totalDiscounts)],
      ["(-) Costo de Mercadería Vendida", moneyNum(-cost)],
      ["= Ganancia Bruta", moneyNum(prof)],
      [],
      ["GASTOS OPERATIVOS", ""],
      ["Gastos Fijos", moneyNum(-gastosFijos)],
      ["Gastos Variables", moneyNum(-gastosVar)],
      ["Total Gastos Operativos", moneyNum(-totalGastos)],
      [],
      ["MERMA / PÉRDIDAS", ""],
      ["Merma por Corte (pérdida)", moneyNum(-mermaCorteTotal)],
      ["Merma por Vencimiento", moneyNum(-mermaVencTotal)],
      ["Merma Aprovechada (informativo)", moneyNum(mermaAprovVal)],
      ["Total Merma (pérdida)", moneyNum(-mermaTotalLoss)],
      [],
      ["DEVOLUCIONES A PROVEEDOR", ""],
      ["Pendientes (suspendido)", moneyNum(devolPendVal)],
      ["Con Crédito (reduce costo)", moneyNum(devolCredVal)],
      ["Repuesto (sin impacto)", moneyNum(devolRepVal)],
      ["Compras de reposición (no suman al costo)", moneyNum(expRepos)],
      [],
      ["= RESULTADO NETO", moneyNum(netResult)],
      [],
      ["Margen Bruto", margin.toFixed(1) + "%"],
      ["Compras normales (ref.)", moneyNum(exp)],
      ["Compras reposición (ref.)", moneyNum(expRepos)],
    ];
    sheets.push({ name: "P&L", rows: pnlRows });

    // Merma sheet
    const mermaRows = [["Fecha", "Tipo", "Artículo", "Perdido", "Aprovechado", "Costo Unit.", "Pérdida $", "Observación"]];
    [...pM].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(m => {
      (m.items || []).forEach(it => {
        mermaRows.push([fDateTime(m.date), m.type === "corte" ? "Corte" : "Vencimiento", it.articleName, moneyNum(it.lostQty), moneyNum(it.aprovQty || 0), moneyNum(it.costPrice), moneyNum((it.lostQty || 0) * (it.costPrice || 0)), m.obs || ""]);
      });
    });
    sheets.push({ name: "Merma", rows: mermaRows });

    // Devoluciones sheet
    const devolRows = [["Fecha", "Proveedor", "Factura", "Artículo", "Cant.", "Valor", "Estado", "Obs"]];
    [...pD].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(d => {
      (d.items || []).forEach(it => devolRows.push([fDateTime(d.date), d.supplier, d.invoiceNum || "—", it.articleName, moneyNum(it.devQty), moneyNum(it.devQty * (it.unitCost || 0)), d.status === "pendiente" ? "Pendiente" : d.status === "credito" ? "Crédito" : "Repuesto", d.obs || ""]));
    });
    sheets.push({ name: "Devoluciones", rows: devolRows });

    // Sales sheet
    const salesRows = [["Fecha", "Cliente", "Método Pago", "Pago Mixto", "Descuento", "Desc. Monto", "Total", "Ganancia"]];
    [...pS].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(s => {
      const pmTxt = s.payMethod2 ? `${pmName(s.payMethod)} + ${pmName(s.payMethod2)}` : pmName(s.payMethod);
      const mixTxt = s.payMethod2 ? `${moneyNum(s.pm1Amount || 0)} + ${moneyNum(s.pm2Amount || 0)}` : "";
      const discTxt = s.discountMode === "item" ? "Por ítem" : s.discountMode === "percent" ? `${s.discountPct || 0}%` : "—";
      salesRows.push([fDateTime(s.date), s.client || "—", pmTxt, mixTxt, discTxt, moneyNum(s.discountAmount || 0), moneyNum(s.total), moneyNum(s.profit)]);
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
    const purchRows = [["Fecha", "Proveedor", "Factura", "Tipo", "Artículos", "Total"]];
    [...pP].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
      purchRows.push([fDateTime(p.date), p.supplier, p.invoiceNum || "—", p.isReposition ? "Reposición" : "Normal", p.items.length, moneyNum(p.total)]);
    });
    sheets.push({ name: "Compras", rows: purchRows });

    // Expenses sheet
    const expRows = [["Fecha", "Descripción", "Categoría", "Tipo", "Frecuencia", "Monto"]];
    [...pE].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(e => {
      expRows.push([fDateTime(e.date), e.description, e.category, e.type === "fijo" ? "Fijo" : "Variable", EXP_FREQ.find(f => f.value === e.frequency)?.label || e.frequency, moneyNum(e.amount)]);
    });
    sheets.push({ name: "Gastos", rows: expRows });

    // Stock sheet
    const stockRows = [["Artículo", "Categoría", "Stock", "Mínimo", "P.Compra", "IVA%", "P.Venta", "Margen%", "Estado"]];
    articles.forEach(a => {
      const st = a.stock <= 0 && a.purchasePrice > 0 ? "Sin Stock" : a.stock <= (a.minStock || 5) && a.purchasePrice > 0 ? "Bajo" : "OK";
      stockRows.push([a.name, a.category, moneyNum(a.stock), a.minStock || 5, moneyNum(a.purchasePrice), a.iva ?? 21, moneyNum(a.salePrice), a.marginPercent, st]);
    });
    sheets.push({ name: "Inventario", rows: stockRows });

    exportToExcel(sheets, `Fiambreria_Reporte_${periodLabel}_${fDate(new Date())}.xls`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {[["pnl", "P&L"], ["sales-r", "Ventas"], ["purch-r", "Compras"], ["exp-r", "Gastos"], ["merma-r", "Merma"], ["devol-r", "Devoluciones"], ["desc-r", "Descuentos"], ["precios-r", "Precios"], ["stock-r", "Stock"]].map(([id, l]) => (
            <div key={id} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{l}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {[["all","Todo"],["today","Hoy"],["week","Semana"],["month","Mes"]].map(([v,l]) => (
            <button key={v} onClick={() => { setPeriod(v); setCustomFrom(""); setCustomTo(""); }}
              style={{ padding: "5px 11px", borderRadius: 6, border: "1px solid var(--br)", cursor: "pointer", fontSize: 12, fontWeight: 500, background: (period === v && !customFrom && !customTo) ? "var(--ac)" : "var(--bg2)", color: (period === v && !customFrom && !customTo) ? "#fff" : "var(--tx2)", transition: "all .15s" }}>{l}</button>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 4, borderLeft: "1px solid var(--br)", paddingLeft: 8 }}>
            <input type="date" value={customFrom} onChange={e => { setCustomFrom(e.target.value); setPeriod("all"); }}
              style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${customFrom && customTo ? "var(--ac)" : "var(--br)"}`, fontSize: 12, background: "var(--bg2)", color: "var(--tx1)", outline: "none" }} />
            <span style={{ fontSize: 11, color: "var(--tx3)" }}>—</span>
            <input type="date" value={customTo} onChange={e => { setCustomTo(e.target.value); setPeriod("all"); }}
              style={{ padding: "4px 7px", borderRadius: 6, border: `1px solid ${customFrom && customTo ? "var(--ac)" : "var(--br)"}`, fontSize: 12, background: "var(--bg2)", color: "var(--tx1)", outline: "none" }} />
            {(customFrom || customTo) && (
              <button onClick={() => { setCustomFrom(""); setCustomTo(""); }} title="Limpiar rango"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", padding: "0 2px", fontSize: 14, lineHeight: 1 }}>×</button>
            )}
          </div>
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
                ...(totalDiscounts > 0 ? [{ label: "(-) Descuentos Otorgados", val: "- " + money(totalDiscounts), color: "var(--rd)", bold: false, bg: false }] : []),
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
                { label: "MERMA / PÉRDIDAS", val: "", color: "var(--tx3)", bold: false, bg: false, header: true },
                { label: "   Merma por Corte (pérdida)", val: "- " + money(mermaCorteTotal), color: "var(--rd)", bold: false, bg: false, indent: true },
                { label: "   Merma por Vencimiento", val: "- " + money(mermaVencTotal), color: "var(--rd)", bold: false, bg: false, indent: true },
                { label: "   Merma Aprovechada (informativo)", val: money(mermaAprovVal), color: "#7C3AED", bold: false, bg: false, indent: true },
                { label: "= Total Merma (pérdida)", val: "- " + money(mermaTotalLoss), color: "var(--rd)", bold: true, bg: "#FEECEC" },
                { label: "", val: "", color: "", bold: false, bg: false, spacer: true },
                { label: "DEVOLUCIONES A PROVEEDOR", val: "", color: "var(--tx3)", bold: false, bg: false, header: true },
                { label: "   Pendientes (suspendido)", val: money(devolPendVal), color: "var(--yw)", bold: false, bg: false, indent: true },
                { label: "   Con Crédito (reduce costo)", val: "+ " + money(devolCredVal), color: "var(--gn)", bold: false, bg: false, indent: true },
                { label: "   Repuesto (sin impacto — compra nueva)", val: money(devolRepVal), color: "var(--tx3)", bold: false, bg: false, indent: true },
                ...(expRepos > 0 ? [{ label: "   Compras de reposición (no suman al costo)", val: money(expRepos), color: "#7C3AED", bold: false, bg: false, indent: true }] : []),
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
            Ref: Compras normales: {money(exp)} ({pPNormal.length} fact.) · Reposiciones: {money(expRepos)} ({pPRepos.length} fact.)
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

      {tab === "merma-r" && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-r"><div className="kpi-l">Pérdida Total</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(mermaTotalLoss)}</div><div className="kpi-s">{pM.length} registros</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Merma Corte</div><div className="kpi-val">{money(mermaCorteTotal)}</div><div className="kpi-s">{mermaCorte.length} cierres</div></div>
            <div className="kpi kpi-o"><div className="kpi-l">Merma Vencimiento</div><div className="kpi-val">{money(mermaVencTotal)}</div><div className="kpi-s">{mermaVenc.length} registros</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">Aprovechada</div><div className="kpi-val" style={{ color: "#7C3AED" }}>{money(mermaAprovVal)}</div><div className="kpi-s">Valor insumos</div></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <div className="card">
              <div className="card-h"><h3>Merma por Artículo (Pérdida)</h3></div>
              <div className="card-b">
                {mermaByArt.length === 0 ? <div className="empty"><p>Sin mermas en este período</p></div> :
                  <div className="bar-c">{mermaByArt.slice(0, 10).map((a, i) => (
                    <div className="bar-r" key={i}><div className="bar-l" title={a.name}>{a.name}</div><div className="bar-t"><div className="bar-f ac" style={{ width: Math.max(8, (a.lossVal / maxMermaArt) * 100) + "%" }}></div></div><div className="bar-v">{money(a.lossVal)}</div></div>
                  ))}</div>}
              </div>
            </div>
            <div className="card">
              <div className="card-h"><h3>Detalle por Artículo</h3></div>
              <div style={{ padding: 0 }}>
                {mermaByArt.length === 0 ? <div className="empty"><p>Sin datos</p></div> :
                  <table><thead><tr><th>Artículo</th><th>Perdido</th><th>Aprovech.</th><th>Pérdida $</th><th>Registros</th></tr></thead>
                    <tbody>{mermaByArt.map((a, i) => (
                      <tr key={i}><td style={{ fontWeight: 500 }}>{a.name}</td><td>{a.lostQty.toFixed(2)}</td><td style={{ color: "#7C3AED" }}>{a.aprovQty.toFixed(2)}</td><td style={{ fontWeight: 600, color: "var(--rd)" }}>{money(a.lossVal)}</td><td>{a.count}</td></tr>
                    ))}</tbody></table>}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-h"><h3>Corte vs Vencimiento</h3></div>
            <div className="card-b">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div style={{ textAlign: "center", padding: 20, background: "var(--rdL)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", marginBottom: 4 }}>CORTE</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--rd)", fontFamily: "'Fraunces',serif" }}>{money(mermaCorteTotal)}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{mermaCorte.length} cierres</div>
                </div>
                <div style={{ textAlign: "center", padding: 20, background: "#FFF7ED", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", marginBottom: 4 }}>VENCIMIENTO</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#C2410C", fontFamily: "'Fraunces',serif" }}>{money(mermaVencTotal)}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>{mermaVenc.length} registros</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "devol-r" && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-o"><div className="kpi-l">Total Devuelto</div><div className="kpi-val" style={{ color: "var(--ac)" }}>{money(devolTotal)}</div><div className="kpi-s">{pD.length} devoluciones</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Pendientes</div><div className="kpi-val">{money(devolPendVal)}</div><div className="kpi-s">{devolPend.length} · Suspendido</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">Con Crédito</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(devolCredVal)}</div><div className="kpi-s">{devolCred.length} · Reduce costo</div></div>
            <div className="kpi kpi-r"><div className="kpi-l">Repuestos</div><div className="kpi-val">{money(devolRepVal)}</div><div className="kpi-s">{devolRep.length} · Compra nueva</div></div>
          </div>
          <div className="card"><div style={{ padding: 0 }}><div className="tw">
            <table>
              <thead><tr><th>Fecha</th><th>Proveedor</th><th>Factura</th><th>Artículo</th><th>Cant.</th><th>Valor</th><th>Estado</th></tr></thead>
              <tbody>
                {pD.length === 0 ? <tr><td colSpan={7}><div className="empty"><p>Sin devoluciones</p></div></td></tr> :
                  pD.map(d => (d.items || []).map((it, i) => (
                    <tr key={d.id + "-" + i}>
                      <td style={{ fontSize: 12 }}>{fDateTime(d.date)}</td>
                      <td style={{ fontWeight: 500 }}>{d.supplier}</td>
                      <td>{d.invoiceNum || "—"}</td>
                      <td>{it.articleName}</td>
                      <td>{it.devQty} {it.unit}</td>
                      <td style={{ fontWeight: 600, color: "var(--rd)" }}>{money(it.devQty * (it.unitCost || 0))}</td>
                      <td><span className={`badge ${d.status === "pendiente" ? "b-yw" : d.status === "credito" ? "b-ac" : "b-gn"}`}>{d.status === "pendiente" ? "Pendiente" : d.status === "credito" ? "Crédito" : "Repuesto"}</span></td>
                    </tr>
                  )))}
              </tbody>
            </table>
          </div></div></div>
        </div>
      )}

      {tab === "desc-r" && (
        <div>
          <div className="kpi-g">
            <div className="kpi kpi-r"><div className="kpi-l">Total Descuentos</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(totalDiscounts)}</div><div className="kpi-s">{pS.filter(s => s.discountAmount > 0).length} ventas con descuento</div></div>
            <div className="kpi kpi-y"><div className="kpi-l">Por Ítem</div><div className="kpi-val">{money(discItemTotal)}</div><div className="kpi-s">{pS.filter(s => s.discountMode === "item").length} ventas</div></div>
            <div className="kpi kpi-o"><div className="kpi-l">Por % Total</div><div className="kpi-val">{money(discPctTotal)}</div><div className="kpi-s">{pS.filter(s => s.discountMode === "percent").length} ventas</div></div>
            <div className="kpi kpi-v"><div className="kpi-l">% sobre Ventas</div><div className="kpi-val">{rev > 0 ? (totalDiscounts / (rev + totalDiscounts) * 100).toFixed(1) : 0}%</div><div className="kpi-s">Impacto en ingresos</div></div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Impacto de Descuentos</h3></div>
            <div className="card-b">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div style={{ textAlign: "center", padding: 20, background: "var(--bg3)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", marginBottom: 4 }}>SIN DESCUENTO</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ac)", fontFamily: "'Fraunces',serif" }}>{money(rev + totalDiscounts)}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Lo que se hubiera cobrado</div>
                </div>
                <div style={{ textAlign: "center", padding: 20, background: "var(--gnL)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tx3)", marginBottom: 4 }}>CON DESCUENTO</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--gn)", fontFamily: "'Fraunces',serif" }}>{money(rev)}</div>
                  <div style={{ fontSize: 11, color: "var(--tx3)", marginTop: 4 }}>Lo que se cobró realmente</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "precios-r" && (() => {
        const allHistory = priceArtId ? getPriceHistory(priceArtId, purchases, priceHistory) : [];
        const filteredH = allHistory.filter(h =>
          (!priceProv || h.supplier === priceProv) &&
          ((customFrom && customTo) ? (() => { const from = new Date(customFrom); from.setHours(0,0,0,0); const to = new Date(customTo); to.setHours(23,59,59,999); const d = new Date(h.date); return d >= from && d <= to; })() : (period === "all" || (() => { const now = new Date(), start = new Date(); if (period === "today") start.setHours(0,0,0,0); else if (period === "week") start.setDate(now.getDate()-7); else if (period === "month") start.setMonth(now.getMonth()-1); return new Date(h.date) >= start; })()))
        );
        const prices = filteredH.map(h => h.price);
        const minP = prices.length > 0 ? Math.min(...prices) : 0;
        const maxP = prices.length > 0 ? Math.max(...prices) : 0;
        const avgP = prices.length > 0 ? prices.reduce((a,b) => a+b, 0) / prices.length : 0;
        const varTotal = prices.length > 1 ? ((prices[prices.length-1] - prices[0]) / prices[0] * 100) : 0;
        const suppliers = [...new Set(allHistory.map(h => h.supplier))].sort();

        return (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <select className="fs" style={{ width: "auto", minWidth: 200 }} value={priceArtId} onChange={e => setPriceArtId(e.target.value)}>
                <option value="">Seleccioná un artículo...</option>
                {articles.filter(a => a.active !== false && a.purchasePrice > 0).sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {suppliers.length > 1 && (
                <select className="fs" style={{ width: "auto" }} value={priceProv} onChange={e => setPriceProv(e.target.value)}>
                  <option value="">Todos los proveedores</option>
                  {suppliers.map(s => <option key={s}>{s}</option>)}
                </select>
              )}
            </div>

            {!priceArtId ? (
              <div className="card"><div className="card-b"><div className="empty"><p>Seleccioná un artículo para ver la evolución de precios</p></div></div></div>
            ) : filteredH.length === 0 ? (
              <div className="card"><div className="card-b"><div className="empty"><p>No hay compras registradas para este artículo en el período</p></div></div></div>
            ) : (
              <>
                <div className="kpi-g">
                  <div className="kpi kpi-v"><div className="kpi-l">Precio Más Bajo</div><div className="kpi-val" style={{ color: "var(--gn)" }}>{money(minP)}</div></div>
                  <div className="kpi kpi-r"><div className="kpi-l">Precio Más Alto</div><div className="kpi-val" style={{ color: "var(--rd)" }}>{money(maxP)}</div></div>
                  <div className="kpi kpi-o"><div className="kpi-l">Promedio</div><div className="kpi-val">{money(avgP)}</div><div className="kpi-s">{filteredH.length} compras</div></div>
                  <div className={`kpi ${varTotal > 0 ? "kpi-r" : varTotal < 0 ? "kpi-v" : "kpi-o"}`}><div className="kpi-l">Variación Total</div><div className="kpi-val" style={{ color: varTotal > 0 ? "var(--rd)" : varTotal < 0 ? "var(--gn)" : "var(--tx)" }}>{varTotal >= 0 ? "+" : ""}{varTotal.toFixed(1)}%</div></div>
                </div>
                <div className="card">
                  <div className="card-h"><h3>Evolución de Precios — {articles.find(a => a.id === priceArtId)?.name}</h3></div>
                  <div style={{ padding: 0 }}><div className="tw">
                    <table>
                      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Precio</th><th>Variación</th></tr></thead>
                      <tbody>
                        {filteredH.map((h, i) => {
                          const prev = i > 0 ? filteredH[i-1] : null;
                          const diff = prev ? h.price - prev.price : 0;
                          const pct = prev && prev.price > 0 ? (diff / prev.price * 100) : 0;
                          return (
                            <tr key={i}>
                              <td style={{ fontSize: 12 }}>{fDateTime(h.date)}</td>
                              <td style={{ fontWeight: 500 }}>{h.supplier}</td>
                              <td style={{ fontWeight: 600 }}>{money(h.price)}<span style={{ fontSize: 10, color: "var(--tx3)" }}>/{h.unit}</span></td>
                              <td>{!prev ? <span style={{ color: "var(--tx3)", fontSize: 12 }}>—</span> : (
                                <span style={{ fontWeight: 600, fontSize: 12, color: diff > 0 ? "var(--rd)" : diff < 0 ? "var(--gn)" : "var(--tx3)" }}>
                                  {diff > 0 ? "▲" : diff < 0 ? "▼" : "="} {money(Math.abs(diff))} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
                                </span>
                              )}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div></div>
                </div>
              </>
            )}
          </div>
        );
      })()}

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

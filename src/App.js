// ─────────────────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS
// 1. Go to supabase.com → New project (free)
// 2. Go to SQL Editor and run the SQL in the comment block below
// 3. Go to Project Settings → API and copy your URL and anon key
// 4. Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your values
// 5. Deploy to Vercel (connect GitHub repo) → share the URL with your household
//
// SQL TO RUN IN SUPABASE:
// ─────────────────────────────────────────────────────────────────────────────
// create table if not exists household_data (
//   key text primary key,
//   value jsonb not null,
//   updated_at timestamptz default now()
// );
// alter table household_data enable row level security;
// create policy "Public read" on household_data for select using (true);
// create policy "Public write" on household_data for insert with check (true);
// create policy "Public update" on household_data for update using (true);
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || "";

// ── Supabase helpers ──────────────────────────────────────────────────────────
const sb = {
async get(key) {
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
try {
const res = await fetch(`${SUPABASE_URL}/rest/v1/household_data?key=eq.${key}&select=value`, {
headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
});
const rows = await res.json();
return rows?.[0]?.value ?? null;
} catch (err) {
console.warn("Supabase fetch failed:", err);
return null;
}
},
async set(key, value, updatedBy = null) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  try {
    const payload = { key, value, updated_at: new Date().toISOString() };
    if (updatedBy) payload.updated_by = updatedBy;
    await fetch(`${SUPABASE_URL}/rest/v1/household_data`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Supabase set failed:", err);
  }
},
subscribe(key, callback) {
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return () => {};
try {
const wsUrl = SUPABASE_URL.replace("https", "wss").replace("http", "ws");
const ws = new WebSocket(`${wsUrl}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`);
ws.onopen = () => {
ws.send(JSON.stringify({ topic: "realtime:public:household_data", event: "phx_join", payload: { config: { broadcast: { self: false }, presence: { key: "" }, postgres_changes: [{ event: "UPDATE", schema: "public", table: "household_data", filter: `key=eq.${key}` }, { event: "INSERT", schema: "public", table: "household_data", filter: `key=eq.${key}` }] } }, ref: "1" }));
};
ws.onmessage = (msg) => {
  try {
    const data = JSON.parse(msg.data);
    if (data.event === "postgres_changes" && data.payload?.data?.record) {
      const record = data.payload.data.record;
      callback(record.value, { updatedBy: record.updated_by || null });
    }
  } catch (_) {}
};
ws.onerror = (err) => console.warn("WebSocket error:", err);
ws.onclose = () => {
  console.warn("WebSocket closed, reconnecting in 3s...");
  setTimeout(() => sb.subscribe(key, callback), 3000);
};
return () => { try { ws.close(); } catch (_) {} };
} catch (err) {
console.warn("WebSocket subscription failed:", err);
return () => {};
}
},
};

// ── User identity ─────────────────────────────────────────────────────────────
const ACTIVE_USER_KEY = "hh_active_user";
function getSavedUser() { try { return localStorage.getItem(ACTIVE_USER_KEY) || null; } catch { return null; } }
function saveUser(name) { try { localStorage.setItem(ACTIVE_USER_KEY, name); } catch {} }
let _currentUser = getSavedUser();
function setCurrentUser(name) { _currentUser = name; }

// ── Constants ─────────────────────────────────────────────────────────────────
const MEMBERS = ["Hayden", "Eilish", "Tyran"];
const MEMBER_INITIALS = { Hayden: "H", Eilish: "E", Tyran: "T" };
const MEMBER_COLORS = { Hayden: "#c8a96e", Eilish: "#a78bca", Tyran: "#5c9fe0" };
const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STORES = ["Woolworths", "Aldi", "Costco", "Market"];
const MAX_GOALS = 5;

const STORE_COLORS = {
Woolworths: { bg: "#1a4a1a", accent: "#4caf50", light: "#4caf5022" },
Aldi:       { bg: "#1a1a3a", accent: "#5c7cfa", light: "#5c7cfa22" },
Costco:     { bg: "#3a1a1a", accent: "#f44336", light: "#f4433622" },
Market:     { bg: "#2a1f0a", accent: "#ff9800", light: "#ff980022" },
};

const MEAL_ICONS = {
  Breakfast: "☀️",
  Lunch: "🥪",
  Dinner: "🍽️",
  Snack: "🍎",
};
const CATEGORIES = ["Meat", "Bread / Dairy", "Pasta", "Vegetables", "Freezer", "Sauces & Spices", "Canned & Jarred", "Snacks & Treats", "Other"];

const CATEGORY_ICONS = {
  "Meat": "🥩",
  "Bread / Dairy": "🥛",
  "Pasta": "🍝",
  "Vegetables": "🥦",
  "Freezer": "❄️",
  "Sauces & Spices": "🫙",
  "Canned & Jarred": "🥫",
  "Snacks & Treats": "🍫",
  "Other": "📦",
};

const MACRO_DB = {
  "light greek yoghurt":      { cal: 74,  carbs: 7.5,  fat: 2.5,  protein: 6.3,  fibre: 0,   sugar: 5 },
  "rolled oats":              { cal: 388, carbs: 52,   fat: 12,   protein: 12,   fibre: 8,   sugar: 4 },
  "black chia seeds":         { cal: 360, carbs: 10,   fat: 20,   protein: 30,   fibre: 34,  sugar: 0 },
  "chocolate protein powder": { cal: 395, carbs: 10,   fat: 3.3,  protein: 79,   fibre: 0,   sugar: 3.3 },
  "almond milk":              { cal: 16,  carbs: 1,    fat: 2,    protein: 1,    fibre: 0,   sugar: 0 },
  "banana":                   { cal: 110, carbs: 27.5, fat: 0,    protein: 0.5,  fibre: 2.6, sugar: 10.5 },
  "frozen blueberries":       { cal: 40,  carbs: 10,   fat: 0,    protein: 0,    fibre: 2.4, sugar: 10 },
  "brown onion":              { cal: 40,  carbs: 8,    fat: 0,    protein: 0.4,  fibre: 1.4, sugar: 0 },
  "green pesto":              { cal: 360, carbs: 7.2,  fat: 34.9, protein: 2.2,  fibre: 0,   sugar: 0 },
  "light thickened cream":    { cal: 335, carbs: 3,    fat: 35.3, protein: 2.3,  fibre: 0,   sugar: 0 },
  "bacon":                    { cal: 91,  carbs: 0.7,  fat: 5.7,  protein: 9.3,  fibre: 0,   sugar: 0 },
  "broccolini":               { cal: 35,  carbs: 0,    fat: 0,    protein: 3.9,  fibre: 2.8, sugar: 0 },
  "high protein pasta":       { cal: 363, carbs: 55,   fat: 4.5,  protein: 21.5, fibre: 4,   sugar: 0 },
  "chicken breast":           { cal: 106, carbs: 0,    fat: 2.5,  protein: 26.5, fibre: 0,   sugar: 0 },
  "green curry paste":        { cal: 108, carbs: 7.9,  fat: 7.9,  protein: 0.9,  fibre: 0,   sugar: 0 },
  "brown sugar":              { cal: 300, carbs: 80,   fat: 0,    protein: 0,    fibre: 0,   sugar: 80 },
  "green beans":              { cal: 31,  carbs: 7.2,  fat: 0,    protein: 1.9,  fibre: 2.7, sugar: 0 },
  "low carb potato":          { cal: 45,  carbs: 9.1,  fat: 0,    protein: 2.4,  fibre: 1.8, sugar: 0 },
  "coconut milk":             { cal: 36,  carbs: 0.2,  fat: 3.4,  protein: 0.4,  fibre: 0,   sugar: 0 },
  "lebanese cucumber":        { cal: 16,  carbs: 2.5,  fat: 0.1,  protein: 0.6,  fibre: 0.5, sugar: 0 },
  "rice (cooked)":        { cal: 113, carbs: 25,   fat: 0.5,  protein: 1.9,  fibre: 0.3, sugar: 0 },
  "black beans":              { cal: 111, carbs: 15.8, fat: 0.7,  protein: 7.8,  fibre: 8.7, sugar: 0 },
  "corn":                     { cal: 77,  carbs: 13.5, fat: 1.6,  protein: 2,    fibre: 2,   sugar: 0 },
  "cherry tomatoes":          { cal: 18,  carbs: 4,    fat: 0,    protein: 0,    fibre: 1.2, sugar: 0 },
  "beef mince (10% lean)":    { cal: 151, carbs: 0,    fat: 8.5,  protein: 19.5, fibre: 0,   sugar: 0 },
  "egg":                      { cal: 140, carbs: 1,    fat: 10,   protein: 12,   fibre: 0,   sugar: 0 },
  "tuna in spring water":     { cal: 104, carbs: 0,    fat: 0.7,  protein: 24.5, fibre: 0,   sugar: 0 },
  "lite milk":                { cal: 45,  carbs: 5,    fat: 1.5,  protein: 3.5,  fibre: 0,   sugar: 5 },
  "lime":                     { cal: 30,  carbs: 10.5, fat: 0.2,  protein: 0.7,  fibre: 2.8, sugar: 1.7 },
  "garlic":                   { cal: 149, carbs: 33,   fat: 0.5,  protein: 6.4,  fibre: 2.1, sugar: 1 },
  "olive oil":                { cal: 884, carbs: 0,    fat: 100,  protein: 0,    fibre: 0,   sugar: 0 },
  "coriander":                { cal: 23,  carbs: 3.7,  fat: 0.5,  protein: 2.1,  fibre: 2.8, sugar: 0 },
  "fish sauce":               { cal: 35,  carbs: 5,    fat: 0,    protein: 5,    fibre: 0,   sugar: 4 },
  "black pepper":             { cal: 255, carbs: 64,   fat: 3.3,  protein: 10,   fibre: 25,  sugar: 0 },
  "crushed tomatoes":         { cal: 32,  carbs: 5.5,  fat: 0.3,  protein: 1.5,  fibre: 1.5, sugar: 4 },
  "passata":                  { cal: 28,  carbs: 4.8,  fat: 0.2,  protein: 1.3,  fibre: 1.2, sugar: 3.5 },
  "carrot":                   { cal: 41,  carbs: 10,   fat: 0.2,  protein: 0.9,  fibre: 2.8, sugar: 5 },
  "zucchini":                 { cal: 17,  carbs: 3.1,  fat: 0.3,  protein: 1.2,  fibre: 1,   sugar: 2.5 },
};

function getMacros(name, standaloneIngs = []) {
  const fromDB = MACRO_DB[name.toLowerCase()] || null;
  if (fromDB) return fromDB;
  const fromStandalone = (standaloneIngs || []).find(i => i.name.toLowerCase() === name.toLowerCase());
  if (fromStandalone?.macros) return fromStandalone.macros;
  return null;
}

const GRAMS_PER_UNIT = {
  "banana":              { whole: 120 },
  "brown onion":         { whole: 150 },
  "broccolini":          { whole: 200 },
  "lebanese cucumber":   { whole: 200 },
  "high protein pasta":  { packet: 500 },
  "chocolate protein powder": { scoops: 30 },
  "green pesto":         { jar: 190 },
  "green curry paste":   { jar: 114 },
  "coconut milk":        { cans: 400 },
  "egg":                 { whole: 60 },
  "lime":                { whole: 67 },
  "garlic":              { cloves: 5 },
  "carrot":              { whole: 80 },
  "zucchini":            { whole: 200 },
};

function getGramsForUnit(name, unit, qty, standaloneIngs = []) {
  const n = name.toLowerCase();
  if (unit === "g") return qty;
  if (unit === "kg") return qty * 1000;
  if (unit === "ml") return qty;
  if (unit === "L") return qty * 1000;
  if (unit === "tbsp") return qty * 15;
  if (unit === "tsp") return qty * 5;
  if (unit === "cups") return qty * 240;
  const custom = GRAMS_PER_UNIT[n]?.[unit];
  if (custom) return qty * custom;
  if (unit === "whole") {
    const standalone = (standaloneIngs || []).find(i => i.name.toLowerCase() === n);
    if (standalone?.gramsPerWhole) return qty * standalone.gramsPerWhole;
  }
  return null;
}

function calcMacrosForRecipe(recipe, standaloneIngs = []) {
  let cal = 0, carbs = 0, fat = 0, protein = 0, fibre = 0, sugar = 0;
  let hasAny = false;
  (recipe.ingredients || []).forEach(ing => {
    const m = getMacros(ing.name, standaloneIngs);
    if (!m) return;
    const qty = parseFloat(ing.qty) || 0;
    const unit = ing.unit || "";
    const grams = getGramsForUnit(ing.name, unit, qty, standaloneIngs);
    if (grams !== null) {
      const scale = grams / 100;
      cal += m.cal * scale;
      carbs += m.carbs * scale;
      fat += m.fat * scale;
      protein += m.protein * scale;
      fibre += m.fibre * scale;
      sugar += m.sugar * scale;
      hasAny = true;
    }
  });
  if (recipe.cookedInOil) {
    const serves = recipe.serves || 1;
    cal += 40 * serves;
    fat += 4.5 * serves;
    hasAny = true;
  }
  if (!hasAny) return null;
  return { cal: Math.round(cal), carbs: Math.round(carbs), fat: Math.round(fat), protein: Math.round(protein), fibre: Math.round(fibre), sugar: Math.round(sugar) };
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/chicken|beef|pork|lamb|bacon|mince|steak|fish|salmon|tuna|prawn|turkey|sausage/.test(n)) return "Meat";
  if (/pasta|spaghetti|penne|fettuccine|linguine|noodle/.test(n)) return "Pasta";
  if (/milk|yoghurt|cream|cheese|butter|egg|oat|bread|rice|flour|cereal/.test(n)) return "Bread / Dairy";
  if (/lettuce|spinach|tomato|cucumber|onion|garlic|broccoli|broccolini|carrot|capsicum|zucchini|potato|bean|corn|pea|mushroom|celery|kale|cabbage|herb|ginger|lemon|lime|avocado|banana|blueberr|berry|fruit|vegetable|salad|coriander/.test(n)) return "Vegetables";
  if (/frozen|ice cream/.test(n)) return "Freezer";
  if (/sauce|spice|seasoning|pepper|salt|curry|pesto|mustard|vinegar|oil|sugar|soy|fish sauce|chilli|cumin|paprika|oregano|basil|thyme|passata/.test(n)) return "Sauces & Spices";
  if (/canned|tinned|crushed tomato|coconut milk|black bean|chickpea|lentil|tuna|sardine/.test(n)) return "Canned & Jarred";
  if (/protein bar|protein powder|nut|almond|cashew|chip|cracker|rice cake|chocolate|lolly|snack/.test(n)) return "Snacks & Treats";
  return "Other";
}

const UNIT_CONVERSIONS = {
  g: { kg: 0.001, g: 1 },
  kg: { g: 1000, kg: 1 },
  ml: { L: 0.001, ml: 1 },
  L: { ml: 1000, L: 1 },
};

function consolidateQuantities(quantities) {
  const compatible = {};
  const incompatible = {};
  const list = Array.isArray(quantities) ? quantities : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const qty = parseFloat(item.qty);
    const unit = String(item.unit || '').trim();
    if (isNaN(qty) || qty <= 0) continue;
    if (unit in UNIT_CONVERSIONS) {
      const base = unit === 'g' || unit === 'kg' ? 'g' : 'ml';
      const converted = qty * (UNIT_CONVERSIONS[unit][base] || 1);
      if (!compatible[base]) compatible[base] = 0;
      compatible[base] += converted;
    } else if (unit) {
      if (!incompatible[unit]) incompatible[unit] = 0;
      incompatible[unit] += qty;
    }
  }
  const parts = [];
  for (const [base, total] of Object.entries(compatible)) {
    const displayUnit = total >= 1000 && base === 'g' ? 'kg' : total >= 1000 && base === 'ml' ? 'L' : base;
    const displayQty = displayUnit === 'kg' || displayUnit === 'L' ? total / 1000 : total;
    if (!isNaN(displayQty) && displayQty > 0) parts.push(`${parseFloat(displayQty.toFixed(2))} ${displayUnit}`);
  }
  for (const [unit, qty] of Object.entries(incompatible)) {
    if (unit && !isNaN(qty) && qty > 0) parts.push(`${parseFloat(qty.toFixed(2))} ${unit}`);
  }
  return parts.length > 0 ? parts.join(', ') : '—';
}

function getQuantitySummary(quantities) {
  const compatible = {};
  const incompatible = {};
  const list = Array.isArray(quantities) ? quantities : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const qty = parseFloat(item.qty);
    const unit = String(item.unit || '').trim();
    if (isNaN(qty) || qty <= 0) continue;
    if (unit in UNIT_CONVERSIONS) {
      const base = unit === 'g' || unit === 'kg' ? 'g' : 'ml';
      const converted = qty * (UNIT_CONVERSIONS[unit][base] || 1);
      if (!compatible[base]) compatible[base] = 0;
      compatible[base] += converted;
    } else if (unit) {
      if (!incompatible[unit]) incompatible[unit] = 0;
      incompatible[unit] += qty;
    }
  }
  const totals = [];
  for (const [base, total] of Object.entries(compatible)) {
    const displayUnit = total >= 1000 && base === 'g' ? 'kg' : total >= 1000 && base === 'ml' ? 'L' : base;
    const displayQty = displayUnit === 'kg' || displayUnit === 'L' ? total / 1000 : total;
    if (!isNaN(displayQty) && displayQty > 0) totals.push({ qty: parseFloat(displayQty.toFixed(2)), unit: displayUnit });
  }
  for (const [unit, qty] of Object.entries(incompatible)) {
    if (unit && !isNaN(qty) && qty > 0) totals.push({ qty: parseFloat(qty.toFixed(2)), unit });
  }
  return totals;
}

const DEFAULT_RECIPES = [
  { id: 1, name: "Banana Overnight Oats", types: ["Breakfast"], serves: 3, ingredients: [
{ name: "Light Greek Yoghurt", qty: 240, unit: "g", store: "Aldi", category: "Bread / Dairy" },
    { name: "Rolled Oats", qty: 75, unit: "g", store: "Woolworths", category: "Bread / Dairy" },
    { name: "Black Chia Seeds", qty: 30, unit: "g", store: "Costco", category: "Snacks & Treats" },
    { name: "Chocolate Protein Powder", qty: 3, unit: "scoops", store: "Costco", category: "Bread / Dairy" },
    { name: "Almond Milk", qty: 300, unit: "ml", store: "Aldi", category: "Bread / Dairy" },
    { name: "Banana", qty: 1.5, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "Frozen Blueberries", qty: 90, unit: "g", store: "Aldi", category: "Freezer" },
  ]},
  { id: 2, name: "Pesto Pasta", types: ["Lunch", "Dinner"], serves: 3, ingredients: [
  { name: "Brown Onion", qty: 0.5, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "Green Pesto", qty: 0.5, unit: "jar", store: "Woolworths", category: "Sauces & Spices" },
    { name: "Light Thickened Cream", qty: 150, unit: "ml", store: "Woolworths", category: "Bread / Dairy" },
    { name: "Bacon", qty: 150, unit: "g", store: "Costco", category: "Meat" },
    { name: "Broccolini", qty: 1, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "High Protein Pasta", qty: 0.5, unit: "packet", store: "Woolworths", category: "Pasta" },
    { name: "Chicken Breast", qty: 500, unit: "g", store: "Costco", category: "Meat" },
  ]},
  { id: 3, name: "Green Curry", types: ["Lunch", "Dinner"], serves: 3, ingredients: [
{ name: "Green Curry Paste", qty: 0.5, unit: "jar", store: "Woolworths", category: "Sauces & Spices" },
    { name: "Brown Sugar", qty: 0.5, unit: "tbsp", store: "Aldi", category: "Sauces & Spices" },
    { name: "Green Beans", qty: 150, unit: "g", store: "Woolworths", category: "Vegetables" },
    { name: "Low Carb Potato", qty: 188, unit: "g", store: "Woolworths", category: "Vegetables" },
    { name: "Chicken Breast", qty: 500, unit: "g", store: "Costco", category: "Meat" },
    { name: "Coconut Milk", qty: 1, unit: "cans", store: "Woolworths", category: "Canned & Jarred" },
  ]},
  { id: 4, name: "Chicken Taco Bowls", types: ["Lunch"], serves: 3, ingredients: [
{ name: "Lebanese Cucumber", qty: 1.33, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "Chicken Breast", qty: 533, unit: "g", store: "Costco", category: "Meat" },
    { name: "Rice (cooked)", qty: 300, unit: "g", store: "Woolworths", category: "Bread / Dairy" },
    { name: "Black Beans", qty: 150, unit: "g", store: "Aldi", category: "Canned & Jarred" },
    { name: "Corn", qty: 167, unit: "g", store: "Aldi", category: "Vegetables" },
    { name: "Light Greek Yoghurt", qty: 100, unit: "g", store: "Aldi", category: "Bread / Dairy" },
    { name: "Cherry Tomatoes", qty: 167, unit: "g", store: "Woolworths", category: "Vegetables" },
  ]},
{ id: 5, name: "Lime Chicken", types: ["Lunch", "Dinner"], serves: 3, cookedInOil: true, ingredients: [
    { name: "Chicken Breast", qty: 600, unit: "g", store: "Costco", category: "Meat" },
    { name: "Lime", qty: 1, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "Garlic", qty: 2, unit: "cloves", store: "Woolworths", category: "Vegetables" },
    { name: "Brown Sugar", qty: 3, unit: "tbsp", store: "Aldi", category: "Other" },
    { name: "Olive Oil", qty: 1, unit: "tbsp", store: "Woolworths", category: "Other" },
    { name: "Coriander", qty: 2, unit: "tbsp", store: "Woolworths", category: "Vegetables" },
    { name: "Fish Sauce", qty: 1, unit: "tbsp", store: "Woolworths", category: "Sauces & Spices" },
    { name: "Black Pepper", qty: 0.25, unit: "tsp", store: "Woolworths", category: "Other" },
  ], steps: [
    "Pound the thick end of each chicken breast to about 1.7cm thickness for even cooking.",
    "Mix lime zest, lime juice, garlic, brown sugar, fish sauce, olive oil and pepper in a bowl to make the marinade.",
    "Place chicken and marinade in a ziplock bag. Massage to coat evenly. Refrigerate for 24 hours (minimum 12 hrs, maximum 48 hrs).",
    "Remove chicken from marinade and discard the marinade.",
    "Brush BBQ grills with oil and heat to medium-high (or medium if your BBQ runs hot). Cook chicken for 3 minutes each side until caramelised and cooked through (internal temp 75°C).",
    "Transfer to a plate, cover loosely with foil and rest for 3 minutes.",
    "Garnish with extra coriander, lime wedges and chilli if desired. Serve immediately.",
  ]},
  { id: 6, name: "Spaghetti Bolognaise", types: ["Lunch", "Dinner"], serves: 3, cookedInOil: true, ingredients: [
    { name: "Beef Mince (10% Lean)", qty: 500, unit: "g", store: "Costco", category: "Meat" },
    { name: "High Protein Pasta", qty: 0.4, unit: "packet", store: "Woolworths", category: "Bread / Dairy" },
    { name: "Crushed Tomatoes", qty: 1, unit: "cans", store: "Woolworths", category: "Canned & Jarred" },
    { name: "Passata", qty: 1, unit: "tbsp", store: "Woolworths", category: "Sauces & Spices" },
    { name: "Carrot", qty: 1, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "Zucchini", qty: 1, unit: "whole", store: "Woolworths", category: "Vegetables" },
    { name: "Bacon", qty: 2, unit: "slices", store: "Costco", category: "Meat" },
  ], steps: [
    "Heat olive oil in a large pot over medium-high heat. Add bacon and cook until golden, then remove and set aside.",
    "Add beef mince to the same pot and cook, breaking it up, until browned all over. Drain excess fat if needed.",
    "Add carrot and zucchini and cook for 3-4 minutes until softened.",
    "Add crushed tomatoes and passata. Stir to combine.",
    "Return bacon to the pot. Season with salt and pepper.",
    "Reduce heat to low and simmer uncovered for 20-25 minutes, stirring occasionally, until sauce thickens.",
    "Meanwhile, cook pasta in a large pot of salted boiling water according to packet directions. Drain.",
    "Serve sauce over pasta.",
  ]},
];

// goals shape: { Hayden: [ { id, text, checks: { Mon: bool, ... } } ], Eilish: [...], Tyran: [...] }
function buildEmptyGoals() {
const g = {};
MEMBERS.forEach(m => { g[m] = []; });
return g;
}

function buildEmptyWeek() {
  const w = {};
  DAYS.forEach(d => {
    w[d] = {};
    MEAL_TYPES.forEach(m => { w[d][m] = { attending: [...MEMBERS], mealId: null, leftovers: false }; });
    MEMBERS.forEach(member => { w[d][`snack_${member}`] = { snacks: [] }; });
  });
  return w;
}

function getWeekStart(offsetWeeks = 0) {
const now = new Date();
const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
const mon = new Date(now);
mon.setDate(now.getDate() + diff + (offsetWeeks * 7));
mon.setHours(0, 0, 0, 0);
return mon;
}

function getWeekKey(startDate) {
const y = startDate.getFullYear();
const m = String(startDate.getMonth() + 1).padStart(2, "0");
const d = String(startDate.getDate()).padStart(2, "0");
return `week-${y}-${m}-${d}`;
}

function addDays(date, days) {
const next = new Date(date);
next.setDate(next.getDate() + days);
return next;
}

// ── useSharedState hook ───────────────────────────────────────────────────────
function useSharedState(key, defaultValue, onRemoteChange) {
  const [state, setState] = useState(defaultValue);
  const [synced, setSynced] = useState(false);
  const localRef = useRef(false);
  const saveTimer = useRef(null);
  const lastSavedRef = useRef(null);

  useEffect(() => {
    setSynced(false);
    setState(defaultValue);
    sb.get(key).then(val => {
      if (val !== null) {
        setState(val);
        lastSavedRef.current = val;
      } else {
        lastSavedRef.current = null;
      }
      setSynced(true);
    }).catch(() => setSynced(true));
  }, [key]);

  useEffect(() => {
    const unsub = sb.subscribe(key, (val, meta) => {
      if (!localRef.current) {
        setState(val);
        lastSavedRef.current = val;
        if (meta?.updatedBy) {
          onRemoteChange?.(key, meta.updatedBy);
        }
      }
    });
    return unsub;
  }, [key]);

  const setAndSave = useCallback((updater) => {
    setState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localRef.current = true;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        sb.set(key, next, _currentUser).finally(() => { localRef.current = false; });
        lastSavedRef.current = next;
      }, 400);
      return next;
    });
  }, [key]);

  return [state, setAndSave, synced];
}

// ── Ingredient editor (shared by add + edit modals) ───────────────────────────
function IngredientAutocomplete({ value, onChange, onSelectFull, recipes, extraIngredients = [] }) {
  const [open, setOpen] = useState(false);
  const allIngredients = useMemo(() => {
    const seen = new Map();
    (recipes || []).forEach(r => r.ingredients.forEach(i => {
      if (i.name.trim() && !seen.has(i.name.toLowerCase())) {
        seen.set(i.name.toLowerCase(), { name: i.name, store: i.store, unit: i.unit, category: i.category || guessCategory(i.name) });
      }
    }));
    (extraIngredients || []).forEach(i => {
      if (i.name.trim() && !seen.has(i.name.toLowerCase())) {
        seen.set(i.name.toLowerCase(), { name: i.name, store: i.store, unit: i.unit || "", category: i.category || guessCategory(i.name) });
      }
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, extraIngredients]);

  const matches = value.trim().length > 0
    ? allIngredients.filter(n => n.name.toLowerCase().includes(value.toLowerCase()) && n.name.toLowerCase() !== value.toLowerCase())
    : [];

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => setOpen(true)}
        placeholder="Ingredient"
        style={{ width: "100%" }}
      />
      {open && matches.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#1e1c18", border: "1px solid #2a2824", borderRadius: 8, zIndex: 100, maxHeight: 140, overflowY: "auto", marginTop: 2 }}>
          {matches.slice(0, 6).map(item => (
            <div key={item.name}
              onMouseDown={() => { onSelectFull(item); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, fontFamily: "DM Sans, sans-serif", color: "#ede8d8", borderBottom: "1px solid #252320" }}
              onMouseEnter={e => e.currentTarget.style.background = "#2a2824"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span>{item.name}</span>
              <span className="dm" style={{ fontSize: 10, color: "#c8a96e88", marginLeft: 8 }}>→ {item.store}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function RecipeForm({ initial, onSave, onClose, title, recipes }) {
const [draft, setDraft] = useState(initial);
const valid = draft.name.trim().length > 0;

function toggleType(mt) {
  const current = draft.types || [];
  const updated = current.includes(mt) ? current.filter(t => t !== mt) : [...current, mt];
  if (updated.length === 0) return;
  setDraft(p => ({ ...p, types: updated }));
}

function updateIng(idx, field, val) {
  const a = [...draft.ingredients];
  a[idx] = { ...a[idx], [field]: val };
  setDraft(p => ({ ...p, ingredients: a }));
}
function removeIng(idx) {
  setDraft(p => ({ ...p, ingredients: p.ingredients.filter((_, i) => i !== idx) }));
}

return (
<div className="sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: "92vh" }}>
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
    <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
    <button onClick={onClose} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
  </div>
  <div style={{ marginBottom: 12 }}>
    <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Name</div>
    <input value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Chicken Parmigiana" style={{ width: "100%" }} />
  </div>
  <div style={{ marginBottom: 16 }}>
    <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Meal type (select all that apply)</div>
    <div style={{ display: "flex", gap: 8 }}>
      {MEAL_TYPES.map(mt => {
        const selected = (draft.types || []).includes(mt);
        return (
          <button key={mt} className="btn" onClick={() => toggleType(mt)}
            style={{ flex: 1, padding: "8px 4px", background: selected ? "#c8a96e" : "#1e1c18", color: selected ? "#0c0c0a" : "#666" }}>
            {MEAL_ICONS[mt]} {mt}
          </button>
        );
      })}
    </div>
  </div>
  <div style={{ marginBottom: 16 }}>
    <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Serves</div>
    <input type="number" min="1" value={draft.serves || ""} onChange={e => setDraft(p => ({ ...p, serves: parseInt(e.target.value) || 1 }))} placeholder="e.g. 4" style={{ width: "100%" }} />
  </div>
  <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Ingredients</div>
  {draft.ingredients.map((ing, idx) => (
    <div key={idx} style={{ marginBottom: 12, padding: "10px", background: "#0c0c0a", borderRadius: 8, border: "1px solid #252320" }}>
      <div style={{ marginBottom: 8 }}>
        <IngredientAutocomplete
          value={ing.name}
          onChange={val => updateIng(idx, "name", val)}
          onSelectFull={item => {
            const a = [...draft.ingredients];
            a[idx] = { ...a[idx], name: item.name, store: item.store || a[idx].store, category: item.category || guessCategory(item.name) };
            setDraft(p => ({ ...p, ingredients: a }));
          }}
          recipes={recipes}
        />
        {ing.name.trim().length > 2 && !recipes.some(r => r.ingredients.some(i => i.name.toLowerCase() === ing.name.toLowerCase())) && (
          <div className="dm" style={{ fontSize: 11, color: "#5c9fe0", marginTop: 5, cursor: "pointer" }}
            onClick={() => setShowAddIngredient({ prefill: ing.name.trim() })}>
            + Add "{ing.name.trim()}" to ingredient database
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="number" value={ing.qty || ""} onChange={e => updateIng(idx, "qty", parseFloat(e.target.value) || 0)} placeholder="Qty" style={{ width: 90 }} />
        <select value={ing.unit} onChange={e => updateIng(idx, "unit", e.target.value)} style={{ width: 80 }}>
          <option value="">None</option>
          <option value="g">g</option>
          <option value="kg">kg</option>
          <option value="ml">ml</option>
          <option value="L">L</option>
          <option value="cups">cups</option>
          <option value="tbsp">tbsp</option>
          <option value="tsp">tsp</option>
          <option value="cans">cans</option>
          <option value="packets">packets</option>
          <option value="slices">slices</option>
          <option value="whole">whole</option>
          <option value="scoops">scoops</option>
          <option value="jar">jar</option>
          <option value="custom">Custom</option>
        </select>
        <select value={ing.store} onChange={e => updateIng(idx, "store", e.target.value)} style={{ flex: 1 }}>
          {STORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => removeIng(idx)}
          style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
      </div>
      <div style={{ marginTop: 8 }}>
        <select value={ing.category || guessCategory(ing.name)} onChange={e => updateIng(idx, "category", e.target.value)}
          style={{ width: "100%", fontSize: 12, padding: "6px 10px" }}>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
        </select>
      </div>
      {ing.unit === "custom" && (
        <input value={ing.customUnit || ""} onChange={e => updateIng(idx, "customUnit", e.target.value)} placeholder="Custom unit" style={{ width: "100%" }} />
      )}
    </div>
  ))}
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "12px 14px", background: "#0c0c0a", borderRadius: 10, border: "1px solid #252320" }}>
    <div onClick={() => setDraft(p => ({ ...p, cookedInOil: !p.cookedInOil }))}
      style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${draft.cookedInOil ? "#c8a96e" : "#555"}`, background: draft.cookedInOil ? "#c8a96e" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {draft.cookedInOil && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0c0c0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
    <div>
      <div className="dm" style={{ fontSize: 13, color: draft.cookedInOil ? "#ede8d8" : "#666" }}>Cooked in olive oil</div>
      <div className="dm" style={{ fontSize: 11, color: "#555" }}>Adds ~40 cal, 4.5g fat per serve</div>
    </div>
  </div>
  <button className="btn" onClick={() => setDraft(p => ({ ...p, ingredients: [...p.ingredients, { name: "", qty: 0, unit: "", store: "Woolworths", customUnit: "" }] }))}
    style={{ background: "#1e1c18", color: "#888", padding: "8px 16px", width: "100%", marginBottom: 14 }}>
    + Add ingredient
  </button>

  <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8, marginTop: 4 }}>Cooking Steps</div>
  {(draft.steps || []).map((step, idx) => (
    <div key={idx} style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div className="dm" style={{ width: 24, height: 24, borderRadius: "50%", background: "#c8a96e22", color: "#c8a96e", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 10 }}>{idx + 1}</div>
      <textarea value={step} onChange={e => {
        const steps = [...(draft.steps || [])];
        steps[idx] = e.target.value;
        setDraft(p => ({ ...p, steps }));
      }} placeholder={`Step ${idx + 1}...`}
        style={{ flex: 1, background: "#0c0c0a", border: "1.5px solid #252320", borderRadius: 10, color: "#ede8d8", padding: "9px 13px", fontFamily: "DM Sans, sans-serif", fontSize: 14, outline: "none", resize: "none", minHeight: 70 }} />
      <button onClick={() => setDraft(p => ({ ...p, steps: (p.steps || []).filter((_, i) => i !== idx) }))}
        style={{ background: "none", border: "none", color: "#555", fontSize: 18, cursor: "pointer", padding: "0 2px", marginTop: 8 }}>×</button>
    </div>
  ))}
  <button className="btn" onClick={() => setDraft(p => ({ ...p, steps: [...(p.steps || []), ""] }))}
    style={{ background: "#1e1c18", color: "#888", padding: "8px 16px", width: "100%", marginBottom: 14 }}>
    + Add step
  </button>
  <button className="btn" onClick={() => valid && onSave(draft)}
    style={{ background: valid ? "#c8a96e" : "#2a2824", color: valid ? "#0c0c0a" : "#555", padding: "13px 20px", width: "100%", cursor: valid ? "pointer" : "default" }}>
    Save Recipe
  </button>
</div>
);
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
const [activeUserName, setActiveUserName] = useState(() => getSavedUser());
const [conflictBanner, setConflictBanner] = useState(null);
const bannerTimer = useRef(null);

function handleRemoteChange(key, who) {
  if (who === activeUserName) return;
  if (key === "shopping" || key.startsWith("shopping-checked-")) return;
  const label = key === "recipes" ? "the recipe book" : key.startsWith("week-") ? "the weekly planner" : key === "goals" ? "the goals" : key === "ingredients" ? "the ingredients" : key;
  setConflictBanner({ who, label });
  clearTimeout(bannerTimer.current);
  bannerTimer.current = setTimeout(() => setConflictBanner(null), 10000);
}

const [view, setView] = useState("week");
const [selectedDay, setSelectedDay] = useState(() => {
  const today = new Date();
  const diff = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const dayIndex = DAYS.findIndex((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toDateString() === today.toDateString();
  });
  return dayIndex >= 0 ? dayIndex : 0;
});
const [weekStart, setWeekStart] = useState(getWeekStart());
const defaultWeek = useMemo(() => buildEmptyWeek(), []);

const [recipes, setRecipes, recipesReady] = useSharedState("recipes", DEFAULT_RECIPES, handleRemoteChange);
const [week, setWeek, weekReady] = useSharedState(getWeekKey(weekStart), defaultWeek, handleRemoteChange);
const [shoppingList, setShoppingList, shopReady] = useSharedState("shopping", [], handleRemoteChange);
const [goals, setGoals, goalsReady] = useSharedState("goals", buildEmptyGoals(), handleRemoteChange);
const [standaloneIngredients, setStandaloneIngredients] = useSharedState("ingredients", [], handleRemoteChange);
const [weightData, setWeightData] = useSharedState(`weight-${activeUserName}`, { stats: { height: "", activeness: "sedentary", goalWeight: "" }, weighins: {}, tdeeOverride: null }, handleRemoteChange);
const [checkedMeat, setCheckedMeat] = useSharedState("shopping-checked-Meat", {}, handleRemoteChange);
const [checkedBreadDairy, setCheckedBreadDairy] = useSharedState("shopping-checked-BreadDairy", {}, handleRemoteChange);
const [checkedPasta, setCheckedPasta] = useSharedState("shopping-checked-Pasta", {}, handleRemoteChange);
const [checkedVegetables, setCheckedVegetables] = useSharedState("shopping-checked-Vegetables", {}, handleRemoteChange);
const [checkedFreezer, setCheckedFreezer] = useSharedState("shopping-checked-Freezer", {}, handleRemoteChange);
const [checkedSauces, setCheckedSauces] = useSharedState("shopping-checked-Sauces", {}, handleRemoteChange);
const [checkedCanned, setCheckedCanned] = useSharedState("shopping-checked-Canned", {}, handleRemoteChange);
const [checkedSnacks, setCheckedSnacks] = useSharedState("shopping-checked-Snacks", {}, handleRemoteChange);
const [checkedOther, setCheckedOther] = useSharedState("shopping-checked-Other", {}, handleRemoteChange);

const categoryChecked = {
  "Meat": checkedMeat,
  "Bread / Dairy": checkedBreadDairy,
  "Pasta": checkedPasta,
  "Vegetables": checkedVegetables,
  "Freezer": checkedFreezer,
  "Sauces & Spices": checkedSauces,
  "Canned & Jarred": checkedCanned,
  "Snacks & Treats": checkedSnacks,
  "Other": checkedOther,
};
const setCategoryChecked = {
  "Meat": setCheckedMeat,
  "Bread / Dairy": setCheckedBreadDairy,
  "Pasta": setCheckedPasta,
  "Vegetables": setCheckedVegetables,
  "Freezer": setCheckedFreezer,
  "Sauces & Spices": setCheckedSauces,
  "Canned & Jarred": setCheckedCanned,
  "Snacks & Treats": setCheckedSnacks,
  "Other": setCheckedOther,
};



const [pickerFor, setPickerFor] = useState(null);
const [pickerLeftovers, setPickerLeftovers] = useState(false);
const [showAddRecipe, setShowAddRecipe] = useState(false);
const [editingRecipe, setEditingRecipe] = useState(null); // recipe object
const [showAddShoppingItem, setShowAddShoppingItem] = useState(false);
const [newShoppingItem, setNewShoppingItem] = useState({ name: "", qty: "", unit: "", store: "Woolworths" });
const [compactShopping, setCompactShopping] = useState(false);
const [shoppingListSnapshot, setShoppingListSnapshot] = useState(null);
const [recipeTab, setRecipeTab] = useState("recipes");
const [newGoalText, setNewGoalText] = useState("");
const [newGoalFrequency, setNewGoalFrequency] = useState(3);
const [goalsTab, setGoalsTab] = useState("goals");
const [weightSection, setWeightSection] = useState("stats");
const [weightViewMode, setWeightViewMode] = useState("graph");
const [newGoalMember, setNewGoalMember] = useState(null);
const [showAddIngredient, setShowAddIngredient] = useState(false);
const [newIngredient, setNewIngredient] = useState({ name: "", brand: "", store: "Woolworths", category: "Other", macros: { cal: "", protein: "", carbs: "", fat: "", fibre: "", sugar: "" } });
const [activeUser, setActiveUser] = useState(null);
const [snackPickerFor, setSnackPickerFor] = useState(null);
const [snackSearch, setSnackSearch] = useState("");
const [selectedSnackIng, setSelectedSnackIng] = useState(null);
const [snackQty, setSnackQty] = useState(1);
const [snackUnit, setSnackUnit] = useState("");
const [ingredientMacroPopup, setIngredientMacroPopup] = useState(null);
const [viewingRecipe, setViewingRecipe] = useState(null);
const [viewingRecipeTab, setViewingRecipeTab] = useState("ingredients");
const [showBackToTop, setShowBackToTop] = useState(false);
const [sidesPickerFor, setSidesPickerFor] = useState(null);
const [sidesSearch, setSidesSearch] = useState("");
const [showMissingMacrosOnly, setShowMissingMacrosOnly] = useState(false);
const [ingredientPopupTab, setIngredientPopupTab] = useState("macros");
const [keyboardHeight, setKeyboardHeight] = useState(0);
useEffect(() => {
  const handler = () => {
    if (window.visualViewport) {
      const kbHeight = window.innerHeight - window.visualViewport.height;
      setKeyboardHeight(kbHeight > 50 ? kbHeight : 0);
    }
  };
  window.visualViewport?.addEventListener("resize", handler);
  return () => window.visualViewport?.removeEventListener("resize", handler);
}, []);

useEffect(() => {
  const handleScroll = () => setShowBackToTop(window.scrollY > 200);
  window.addEventListener("scroll", handleScroll);
  return () => window.removeEventListener("scroll", handleScroll);
}, []);

useEffect(() => {
  const handleFocus = (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") {
      setTimeout(() => {
        e.target.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  };
  document.addEventListener("focusin", handleFocus);
  return () => document.removeEventListener("focusin", handleFocus);
}, []);
const [editingMacros, setEditingMacros] = useState({ cal: "", protein: "", carbs: "", fat: "", fibre: "", sugar: "" });

const loaded = recipesReady && weekReady && shopReady && goalsReady;
const safeShoppingList = Array.isArray(shoppingList) ? shoppingList : [];
const recipesRef = useRef(recipes);
useEffect(() => { recipesRef.current = recipes; }, [recipes]);

useEffect(() => {
  if (!loaded) return;
  const generated = buildShoppingListFromWeek(week, recipesRef.current, standaloneIngredients);
  setShoppingList(prev => mergeGeneratedShoppingList(generated, prev));
}, [loaded, week]);

function mergeGeneratedShoppingList(generated, existing = []) {
  const existingById = new Map((Array.isArray(existing) ? existing : []).map(item => [item.id, item]));
  const generatedIds = new Set(generated.map(item => item.id));
  const merged = generated.map(item => {
    const existingItem = existingById.get(item.id);
    return {
      ...item,
      checked: existingItem?.checked ?? item.checked,
      pantryQty: existingItem?.pantryQty ?? item.pantryQty,
      pantryUnit: existingItem?.pantryUnit ?? item.pantryUnit,
    };
  });
  const customItems = (Array.isArray(existing) ? existing : []).filter(item => String(item.id).startsWith("custom-") && !generatedIds.has(item.id));
  const result = [...merged, ...customItems];
  // If no meals are planned at all, only keep custom items
  if (generated.length === 0) return customItems;
  return result;
}

// ── Meal actions ──────────────────────────────────────────────────────────
function toggleAttending(day, mealType, member) {
setWeek(prev => {
const cur = prev[day][mealType].attending;
return { ...prev, [day]: { ...prev[day], [mealType]: { ...prev[day][mealType], attending: cur.includes(member) ? cur.filter(m => m !== member) : [...cur, member] } } };
});
}

function setMeal(day, mealType, recipeId, leftovers = false) {
  setWeek(prev => {
    const current = prev[day][mealType];
    const newWeek = { ...prev, [day]: { ...prev[day], [mealType]: { ...prev[day][mealType], mealId: recipeId, leftovers } } };
    if (leftovers && mealType !== "Lunch" && recipeId) {
      const dayIndex = DAYS.indexOf(day);
      const nextDay = DAYS[(dayIndex + 1) % 7];
      newWeek[nextDay] = { ...newWeek[nextDay], Lunch: { ...newWeek[nextDay].Lunch, mealId: recipeId, leftovers: true } };
    } else if (!leftovers && current.leftovers && mealType !== "Lunch") {
      const dayIndex = DAYS.indexOf(day);
      const nextDay = DAYS[(dayIndex + 1) % 7];
      const nextLunch = newWeek[nextDay]?.Lunch;
      if (nextLunch?.mealId === current.mealId && nextLunch?.leftovers) {
        newWeek[nextDay] = { ...newWeek[nextDay], Lunch: { ...newWeek[nextDay].Lunch, mealId: null, leftovers: false } };
      }
    }

    return newWeek;
  });
  setPickerFor(null);
}

function changeWeek(offset) {
setWeekStart(prev => addDays(prev, offset));
setSelectedDay(0);
}

function toggleCheck(itemId, category) {
  const cat = category || "Other";
  const setter = setCategoryChecked[cat];
  if (setter) {
    setter(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  }
}

function isChecked(itemId, category) {
  const cat = category || "Other";
  return !!categoryChecked[cat]?.[itemId];
}

function removeItem(itemId) {
setShoppingList(prev => Array.isArray(prev) ? prev.filter(item => item.id !== itemId) : []);
}

function addShoppingItem() {
const name = newShoppingItem.name.trim();
const qty = parseFloat(newShoppingItem.qty) || 0;
if (!name || qty <= 0) return;
setShoppingList(prev => [
  ...(Array.isArray(prev) ? prev : []),
  {
    id: `custom-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    name,
    store: newShoppingItem.store || "Woolworths",
    checked: false,
    pantryQty: 0,
    pantryUnit: newShoppingItem.unit || "",
    quantities: [{ qty, unit: newShoppingItem.unit || "" }],
  }
]);
setShowAddShoppingItem(false);
setNewShoppingItem({ name: "", qty: "", unit: "", store: "Woolworths" });
}

function buildShoppingListFromWeek(currentWeek, currentRecipes = recipes, currentStandaloneIngredients = []) {
  const consolidated = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  DAYS.forEach((day, dayIndex) => {
    const dayDate = addDays(weekStart, dayIndex);
    dayDate.setHours(0, 0, 0, 0);
    const isPast = dayDate < today;
    if (isPast) return;
    // Regular meals
    MEAL_TYPES.forEach(mealType => {
      const slot = currentWeek[day]?.[mealType];
      if (!slot?.mealId || !slot.attending?.length) return;
      const recipe = currentRecipes.find(r => r.id === slot.mealId);
      if (!recipe) return;
      if (slot.leftovers && mealType === "Lunch") return;
      const serves = recipe.serves || 1;
      let totalAttendees = slot.attending.length;
      DAYS.forEach(d => {
        MEAL_TYPES.forEach(mt => {
          const s = currentWeek[d]?.[mt];
          if (s?.mealId === slot.mealId && s?.leftovers && !(d === day && mt === mealType)) {
            totalAttendees += (s.attending?.length || 0);
          }
        });
      });
      const scale = totalAttendees / serves;
      recipe.ingredients.forEach(ing => {
        const store = ing.store || "Woolworths";
        const key = `${ing.name.toLowerCase()}-${store}`;
        if (!consolidated[key]) {
          consolidated[key] = {
            id: key,
            name: ing.name,
            store,
            checked: false,
            pantryQty: 0,
            pantryUnit: ing.unit || "",
            quantities: [],
          };
        }
       consolidated[key].category = ing.category || guessCategory(ing.name);
        // Convert to whole if conversion exists and unit is g or ml
        const standaloneIng = (currentStandaloneIngredients || []).find(s => s.name.toLowerCase() === ing.name.toLowerCase());
        const hardcodedWhole = GRAMS_PER_UNIT[ing.name.toLowerCase()]?.whole;
        const gramsPerWhole = standaloneIng?.gramsPerWhole || hardcodedWhole || null;
        const wholeUnit = standaloneIng?.wholeUnit || "g";
        if (gramsPerWhole && (ing.unit === "g" || ing.unit === "ml" || ing.unit === "kg" || ing.unit === "L")) {
          const totalGrams = getGramsForUnit(ing.name, ing.unit, ing.qty * scale);
          if (totalGrams !== null) {
            const wholeCount = parseFloat((totalGrams / gramsPerWhole).toFixed(2));
            consolidated[key].quantities.push({ qty: wholeCount, unit: "whole" });
          } else {
            consolidated[key].quantities.push({ qty: ing.qty * scale, unit: ing.unit || "" });
          }
        } else {
          consolidated[key].quantities.push({ qty: ing.qty * scale, unit: ing.unit || "" });
        }
      });
      // Add sides to shopping list
      (slot.sides || []).forEach(side => {
        if (side.type === "recipe") {
          const sideRecipe = currentRecipes.find(r => r.id === side.id);
          if (!sideRecipe) return;
          sideRecipe.ingredients.forEach(ing => {
            const store = ing.store || "Woolworths";
            const key = `${ing.name.toLowerCase()}-${store}`;
            if (!consolidated[key]) consolidated[key] = { id: key, name: ing.name, store, checked: false, pantryQty: 0, pantryUnit: ing.unit || "", quantities: [] };
            consolidated[key].category = ing.category || guessCategory(ing.name);
            consolidated[key].quantities.push({ qty: (ing.qty / (sideRecipe.serves || 1)) * (parseFloat(side.qty) || 1), unit: ing.unit || "" });
          });
        } else {
          const ingDetails = [...recipes.flatMap(r => r.ingredients), ...(standaloneIngredients || [])].find(i => i.name.toLowerCase() === side.name.toLowerCase());
          const store = ingDetails?.store || "Woolworths";
          const key = `${side.name.toLowerCase()}-${store}`;
          if (!consolidated[key]) consolidated[key] = { id: key, name: side.name, store, checked: false, pantryQty: 0, pantryUnit: side.unit || "", quantities: [] };
          consolidated[key].category = ingDetails?.category || guessCategory(side.name);
          consolidated[key].quantities.push({ qty: parseFloat(side.qty) || 0, unit: side.unit || "" });
        }
      });
    });

    // Snacks per member
    MEMBERS.forEach(member => {
      const snackKey = `snack_${member}`;
      const slot = currentWeek[day]?.[snackKey];
      const snacks = slot?.snacks || [];
      snacks.forEach(snack => {
        const recipe = currentRecipes.find(r => r.id === snack.mealId);
        if (!recipe) return;
        recipe.ingredients.forEach(ing => {
          const store = ing.store || "Woolworths";
          const key = `${ing.name.toLowerCase()}-${store}`;
          if (!consolidated[key]) {
            consolidated[key] = {
              id: key,
              name: ing.name,
              store,
              checked: false,
              pantryQty: 0,
              pantryUnit: ing.unit || "",
              quantities: [],
            };
          }
          consolidated[key].category = ing.category || guessCategory(ing.name);
          const snackStandaloneIng = (currentStandaloneIngredients || []).find(s => s.name.toLowerCase() === ing.name.toLowerCase());
          const snackHardcodedWhole = GRAMS_PER_UNIT[ing.name.toLowerCase()]?.whole;
          const snackGramsPerWhole = snackStandaloneIng?.gramsPerWhole || snackHardcodedWhole || null;
          const snackWholeUnit = snackStandaloneIng?.wholeUnit || "g";
          const snackConversionUnit = snackStandaloneIng?.conversionUnit || "whole";
          const snackQtyRaw = snack.qty || 1;
          const snackUnitRaw = snack.unit || ing.unit || "";
          if (snackGramsPerWhole && (snackUnitRaw === "g" || snackUnitRaw === "ml" || snackUnitRaw === "kg" || snackUnitRaw === "L")) {
            const totalGrams = getGramsForUnit(ing.name, snackUnitRaw, snackQtyRaw);
            if (totalGrams !== null) {
              const wholeCount = parseFloat((totalGrams / snackGramsPerWhole).toFixed(2));
              consolidated[key].quantities.push({ qty: wholeCount, unit: snackConversionUnit });
            } else {
              consolidated[key].quantities.push({ qty: snackQtyRaw, unit: snackUnitRaw });
            }
          } else {
            consolidated[key].quantities.push({ qty: snackQtyRaw, unit: snackUnitRaw });
          }
        });
      });
    });
  });
  return Object.values(consolidated);
}

function generateShoppingList(switchView = true) {
  consolidated[key].category = ing.category || guessCategory(ing.name);
        consolidated[key].quantities.push({ qty: ing.qty * scale, unit: ing.unit || "" });
  setShoppingList(prev => mergeGeneratedShoppingList(list, prev));
  if (switchView) setView("shopping");
}


function processIngredientsForEdit(ingredients) {
  return ingredients.map(ing => {
    const predefined = ["", "g", "kg", "ml", "L", "cups", "tbsp", "tsp", "cans", "packets", "slices", "whole", "scoops", "jar"];
    if (predefined.includes(ing.unit)) {
      return { ...ing, customUnit: "" };
    } else {
      return { ...ing, unit: "custom", customUnit: ing.unit };
    }
  });
}

function saveNewRecipe(draft) {
  const processedIngredients = draft.ingredients.filter(i => i.name.trim()).map(i => ({
    ...i,
    qty: parseFloat(i.qty) || 0,
    unit: i.unit === "custom" ? i.customUnit || "" : i.unit
  }));
  setRecipes(prev => [...prev, { ...draft, id: Date.now(), types: draft.types || ["Dinner"], serves: draft.serves || 4, ingredients: processedIngredients }]);
  setShowAddRecipe(false);
}

function saveEditedRecipe(draft) {
  const processedIngredients = draft.ingredients.filter(i => i.name.trim()).map(i => ({
    ...i,
    qty: parseFloat(i.qty) || 0,
    unit: i.unit === "custom" ? i.customUnit || "" : i.unit
  }));
  const updated = { ...draft, types: draft.types || ["Dinner"], serves: draft.serves || 4, ingredients: processedIngredients };
  setRecipes(prev => prev.map(r => r.id === draft.id ? updated : r));
  if (viewingRecipe?.id === draft.id) setViewingRecipe(updated);
  setEditingRecipe(null);
}

// ── Goal actions ──────────────────────────────────────────────────────────
function addGoal(member) {
if (!newGoalText.trim()) return;
const memberGoals = goals[member] || [];
if (memberGoals.length >= MAX_GOALS) return;
const checks = {};
DAYS.forEach(d => { checks[d] = false; });
setGoals(prev => ({ ...prev, [member]: [...(prev[member] || []), { id: Date.now(), text: newGoalText.trim(), checks, frequency: newGoalFrequency }] }));
setNewGoalText("");
setNewGoalFrequency(3);
setNewGoalMember(null);
}

function toggleGoalDay(member, goalId, day) {
setGoals(prev => ({
...prev,
[member]: prev[member].map(g => g.id === goalId ? { ...g, checks: { ...g.checks, [day]: !g.checks[day] } } : g),
}));
}

function deleteGoal(member, goalId) {
setGoals(prev => ({ ...prev, [member]: prev[member].filter(g => g.id !== goalId) }));
}
const mealsPlanned = DAYS.reduce((acc, d) => acc + MEAL_TYPES.filter(m => week[d]?.[m]?.mealId).length, 0);
const notConfigured = !SUPABASE_URL || !SUPABASE_ANON_KEY;

function similarItems(a, b) {
  const stopWords = new Set(["the", "a", "an", "and", "or", "of", "in", "with", "low", "high", "light", "dark", "fresh", "frozen", "raw", "cooked", "whole", "brown", "black", "green", "red", "white"]);
  const words1 = a.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const words2 = b.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  if (words1.length === 0 || words2.length === 0) return false;
  const shared = words1.filter(w => words2.includes(w));
  // Only flag if they share a meaningful word AND both have it as a key word
  return shared.length >= 1 && shared.some(w => w.length >= 5);
}

const shoppingWarnings = [];
for (let i = 0; i < safeShoppingList.length; i++) {
  for (let j = i + 1; j < safeShoppingList.length; j++) {
    if (similarItems(safeShoppingList[i].name, safeShoppingList[j].name)) {
      shoppingWarnings.push({ a: safeShoppingList[i].name, b: safeShoppingList[j].name });
    }
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
return (
<div style={{ fontFamily: "'Playfair Display', Georgia, serif", background: "#0c0c0a", minHeight: "100vh", color: "#ede8d8", maxWidth: 480, margin: "0 auto", paddingBottom: 84 }}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap'); *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;} ::-webkit-scrollbar{display:none;} body{background:#0c0c0a;} .dm{font-family:'DM Sans',sans-serif;} .btn{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;border:none;border-radius:100px;cursor:pointer;transition:all .15s;} .card{background:#161512;border-radius:18px;border:1px solid #252320;transition:border-color .2s;} .card:hover{border-color:#353230;} .chip{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;padding:4px 11px;border-radius:100px;cursor:pointer;transition:all .15s;border:1.5px solid transparent;} .chip.on{background:#c8a96e;color:#0c0c0a;border-color:#c8a96e;} .chip.off{background:transparent;color:#555;border-color:#2a2824;} .meal-pill{font-family:'DM Sans',sans-serif;font-size:12px;background:#1e1c18;color:#c8a96e;border:1px solid #c8a96e33;border-radius:100px;padding:4px 12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;} .nav-btn{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:100px;transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:3px;} .nav-btn.active{background:#c8a96e1a;color:#c8a96e;} .nav-btn.inactive{color:#444;} .overlay{position:fixed;inset:0;background:#0c0c0aee;z-index:200;display:flex;align-items:flex-end;} .sheet{background:#161512;border-radius:24px 24px 0 0;width:100%;max-height:85vh;overflow-y:auto;padding:24px;border-top:1px solid #252320;} input,select{background:#0c0c0a;border:1.5px solid #252320;border-radius:10px;color:#ede8d8;padding:9px 13px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .15s;-webkit-appearance:none;} input:focus,select:focus{border-color:#c8a96e55;} input,select,textarea{font-size:16px!important;} .sheet{scroll-padding-bottom:300px;} select option{background:#161512;} .day-tab{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px;border:none;cursor:pointer;transition:all .15s;} .day-tab.active{background:#c8a96e;color:#0c0c0a;} .day-tab.inactive{background:#1a1814;color:#666;} .fadeIn{animation:fadeIn .2s ease;} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} .pulse{animation:pulse 1.5s infinite;} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .check-box{width:22px;height:22px;border-radius:7px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;} .goal-day-btn{font-family:'DM Sans',sans-serif;font-size:9px;font-weight:700;width:30px;height:30px;border-radius:8px;border:none;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;}`}</style>


  {/* ── User Picker ── */}
  {!activeUserName && (
    <div style={{ position: "fixed", inset: 0, background: "#0c0c0aee", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#161512", borderRadius: 24, padding: 28, width: "100%", maxWidth: 360, border: "1px solid #252320" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>Who are you? 👋</h2>
        <div className="dm" style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>This device will remember your choice.</div>
        {MEMBERS.map(m => (
          <button key={m} className="btn" onClick={() => { saveUser(m); setActiveUserName(m); }}
            style={{ display: "block", width: "100%", padding: "14px", marginBottom: 10, background: "#1e1c18", color: MEMBER_COLORS[m], border: `1.5px solid ${MEMBER_COLORS[m]}44`, fontSize: 15, textTransform: "none", letterSpacing: 0 }}>
            {m}
          </button>
        ))}
      </div>
    </div>
  )}

  {/* ── Conflict Banner ── */}
  {conflictBanner && (
    <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 250, padding: "0 14px", paddingTop: 8 }}>
      <div style={{ background: "#2a1f0a", border: "1px solid #ff980088", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <div className="dm" style={{ flex: 1, fontSize: 12, color: "#ff9800", lineHeight: 1.4 }}>
          <strong>{conflictBanner.who}</strong> just updated {conflictBanner.label} — your unsaved changes may conflict.
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button className="btn" onClick={() => window.location.reload()} style={{ background: "#ff980022", color: "#ff9800", padding: "5px 10px", fontSize: 10, border: "1px solid #ff980044" }}>Refresh</button>
          <button className="btn" onClick={() => setConflictBanner(null)} style={{ background: "#1e1c18", color: "#555", padding: "5px 10px", fontSize: 10 }}>Dismiss</button>
        </div>
      </div>
    </div>
  )}

  {/* ── Setup Banner ── */}
  {notConfigured && (
    <div style={{ background: "#2a1a0a", border: "1px solid #c8a96e55", borderRadius: 12, margin: "12px 14px 0", padding: "12px 14px" }}>
      <div className="dm" style={{ fontSize: 12, color: "#c8a96e", fontWeight: 600, marginBottom: 4 }}>⚙️ Supabase not configured</div>
      <div className="dm" style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>Replace SUPABASE_URL and SUPABASE_ANON_KEY at the top of the file to enable real-time sync.</div>
    </div>
  )}

  {/* ── Header ── */}
  <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid #1a1814", position: "sticky", top: 0, zIndex: 100, background: "#0c0c0a", boxShadow: "0 4px 12px #0c0c0a" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div className="dm" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#555", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
          {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "long" })} — Household
          {!loaded && <span className="dm pulse" style={{ fontSize: 9, color: "#c8a96e" }}>syncing...</span>}
          {loaded && !notConfigured && <span className="dm" style={{ fontSize: 9, color: "#4caf50" }}>● live</span>}
{activeUserName && (
  <span className="dm" onClick={() => { saveUser(""); setActiveUserName(null); }}
    style={{ fontSize: 9, color: "#555", marginLeft: 8, cursor: "pointer", textDecoration: "underline" }}>
    ({activeUserName}) switch
  </span>
)}
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>
          {view === "week" ? "Weekly Planner" : view === "day" ? FULL_DAYS[selectedDay] : view === "recipes" ? "Recipe Book" : view === "shopping" ? "Shopping List" : "Weekly Goals"}
        </h1>
        {view === "week" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={() => changeWeek(-7)} style={{ padding: "8px 12px", background: "#1e1c18", color: "#c8a96e" }}>←</button>
            <span className="dm" style={{ fontSize: 12, color: "#aaa" }}>Week of {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
            <button className="btn" onClick={() => changeWeek(7)} style={{ padding: "8px 12px", background: "#1e1c18", color: "#c8a96e" }}>→</button>
{weekStart.toISOString().slice(0,10) !== getWeekStart().toISOString().slice(0,10) && (
  <button className="btn" onClick={() => { setWeekStart(getWeekStart()); setSelectedDay(0); }}
    style={{ padding: "8px 14px", background: "#2a3a2a", color: "#4caf50", border: "1px solid #4caf5044" }}>
    ⌂ Today
  </button>
)}
          </div>
        )}
      </div>
      {view === "week" && mealsPlanned > 0 && (
        <button className="btn" onClick={generateShoppingList} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "9px 15px" }}>🛒 Shop</button>
      )}
           
    </div>
    {view === "day" && (
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 14, paddingBottom: 2 }}>
        {DAYS.map((d, i) => {
          const dayDate = addDays(weekStart, i);
          const today = new Date();
          const isToday = dayDate.toDateString() === today.toDateString();
          const isPast = dayDate < today && !isToday;
          const isSelected = selectedDay === i;
          return (
            <button key={d} onClick={() => setSelectedDay(i)}
              className="day-tab"
              style={{
                background: isSelected ? "#1a2a4a" : isToday ? "#c8a96e33" : isPast ? "#2a1a1a" : "#1a1814",
                color: isSelected ? "#5c9fe0" : isToday ? "#c8a96e" : isPast ? "#f4433688" : "#666",
                border: isSelected ? "1px solid #5c9fe055" : isToday && !isSelected ? "1px solid #c8a96e55" : isPast && !isSelected ? "1px solid #f4433633" : "1px solid transparent",
                position: "relative",
                width: 44,
                minWidth: 44,
                height: 52,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{d}</div>
              <div style={{ fontSize: 11, fontWeight: 700 }}>{dayDate.getDate()}</div>
              {isToday && !isSelected && <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#c8a96e" }} />}
            </button>
          );
        })}
      </div>
    )}
  </div>

  {/* ── Week View ── */}
  {view === "week" && (
    <div style={{ padding: "12px 14px 0" }} className="fadeIn">
      {DAYS.map((day, di) => {
        const dayData = week[day] || {};
        return (
          <div className="card" key={day} style={{ marginBottom: 10, padding: "14px 16px", cursor: "pointer" }}
            onClick={() => { setSelectedDay(di); setView("day"); }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{FULL_DAYS[di]}</span>
                <span className="dm" style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>{addDays(weekStart, di).getDate()} {addDays(weekStart, di).toLocaleDateString("en-AU", { month: "short" })}</span>
              </div>
              <span className="dm" style={{ fontSize: 11, color: "#555" }}>{MEAL_TYPES.filter(m => dayData[m]?.mealId).length}/3</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {MEAL_TYPES.map(mt => {
                const { mealId, attending } = dayData[mt] || { attending: [], mealId: null };
                const recipe = recipes.find(r => r.id === mealId);
                return (
                  <div key={mt} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, width: 20 }}>{MEAL_ICONS[mt]}</span>
                    <span className="dm" style={{ fontSize: 11, color: "#555", width: 56 }}>{mt}</span>
                    <span className="dm" style={{ fontSize: 12, color: recipe ? "#c8a96e" : "#333", flex: 1 }}>{recipe ? recipe.name : "—"}</span>
                    {recipe && (
                      <div style={{ display: "flex", gap: 3 }}>
                        {MEMBERS.map(m => (
                          <span key={m} className="dm" style={{ width: 18, height: 18, borderRadius: "50%", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: attending.includes(m) ? MEMBER_COLORS[m] : "#1e1c18", color: attending.includes(m) ? "#0c0c0a" : "#444", border: `1px solid ${attending.includes(m) ? MEMBER_COLORS[m] : "#2a2824"}` }}>{MEMBER_INITIALS[m]}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  )}

  {/* ── Day View ── */}
  {view === "day" && (
    <div style={{ padding: "14px 14px 0" }} className="fadeIn">
      {MEAL_TYPES.map(mt => {
        const { mealId, attending } = week[DAYS[selectedDay]]?.[mt] || { mealId: null, attending: [] };
        const recipe = recipes.find(r => r.id === mealId);
        return (
          <div className="card" key={mt} style={{ marginBottom: 12, padding: "16px" }}>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{MEAL_ICONS[mt]}</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{mt}</span>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  {MEMBERS.map(m => (
                    <span key={m} className="dm" onClick={() => toggleAttending(DAYS[selectedDay], mt, m)} style={{ width: 32, height: 32, borderRadius: "50%", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: attending.includes(m) ? MEMBER_COLORS[m] : "#1e1c18", color: attending.includes(m) ? "#0c0c0a" : "#444", border: `1px solid ${attending.includes(m) ? MEMBER_COLORS[m] : "#2a2824"}`, transition: "all .15s", cursor: "pointer" }}>{MEMBER_INITIALS[m]}</span>
                  ))}
                </div>
              </div>
              <button className="meal-pill" onClick={() => { setPickerFor({ day: DAYS[selectedDay], mealType: mt }); setPickerLeftovers(week[DAYS[selectedDay]][mt].leftovers || false); }}
                style={{ width: "100%", maxWidth: "100%", textAlign: "left" }}>
                {recipe ? recipe.name : "+ Add meal"}
              </button>
            </div>
                        {recipe && mt !== "Lunch" && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e1c18", display: "flex", alignItems: "center", gap: 8 }}>
                <div onClick={() => {
                  const current = week[DAYS[selectedDay]][mt].leftovers || false;
                  setMeal(DAYS[selectedDay], mt, recipe.id, !current);
                }} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${week[DAYS[selectedDay]][mt].leftovers ? "#c8a96e" : "#555"}`, background: week[DAYS[selectedDay]][mt].leftovers ? "#c8a96e" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {week[DAYS[selectedDay]][mt].leftovers && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0c0c0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="dm" style={{ fontSize: 12, color: week[DAYS[selectedDay]][mt].leftovers ? "#c8a96e" : "#666" }}>
                  Leftovers → {FULL_DAYS[(DAYS.indexOf(DAYS[selectedDay]) + 1) % 7]} Lunch
                </span>
              </div>
            )}
            {recipe && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e1c18" }}>
                {/* Sides */}
                {(week[DAYS[selectedDay]]?.[mt]?.sides || []).length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {(week[DAYS[selectedDay]][mt].sides || []).map((side, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
                        <span className="dm" style={{ fontSize: 12, color: "#888" }}>+ {side.name} <span style={{ color: "#555" }}>{side.qty} {side.unit}</span></span>
                        <button onClick={() => {
                          setWeek(prev => ({
                            ...prev,
                            [DAYS[selectedDay]]: {
                              ...prev[DAYS[selectedDay]],
                              [mt]: { ...prev[DAYS[selectedDay]][mt], sides: (prev[DAYS[selectedDay]][mt].sides || []).filter((_, i) => i !== idx) }
                            }
                          }));
                        }} style={{ background: "none", border: "none", color: "#444", fontSize: 14, cursor: "pointer", padding: "0 2px" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                <button className="dm" onClick={() => { setSidesPickerFor({ day: DAYS[selectedDay], mealType: mt }); setSidesSearch(""); }}
                  style={{ fontSize: 11, color: "#5c9fe0", background: "none", border: "none", cursor: "pointer", padding: "0 0 8px 0" }}>
                  + Add side
                </button>
                {(() => {
                  const m = calcMacrosForRecipe(recipe, standaloneIngredients);
                  const sides = week[DAYS[selectedDay]]?.[mt]?.sides || [];
                  let extraCal = 0, extraProtein = 0, extraCarbs = 0, extraFat = 0;
                  const attendingCount = week[DAYS[selectedDay]]?.[mt]?.attending?.length || 1;
                  sides.forEach(side => {
                    if (side.type === "recipe") {
                      const sideRecipe = recipes.find(r => r.id === side.id);
                      if (sideRecipe) {
                        const sm = calcMacrosForRecipe(sideRecipe, standaloneIngredients);
                        if (sm) {
                          const perPerson = parseFloat(side.qty) || 1;
                          extraCal += (sm.cal / (sideRecipe.serves || 1)) * perPerson / attendingCount;
                          extraProtein += (sm.protein / (sideRecipe.serves || 1)) * perPerson / attendingCount;
                          extraCarbs += (sm.carbs / (sideRecipe.serves || 1)) * perPerson / attendingCount;
                          extraFat += (sm.fat / (sideRecipe.serves || 1)) * perPerson / attendingCount;
                        }
                      }
                    } else {
                      const ing = getMacros(side.name, standaloneIngredients);
                      if (ing) {
                        const totalGrams = getGramsForUnit(side.name, side.unit, parseFloat(side.qty) || 0);
                        if (totalGrams !== null) {
                          const scale = (totalGrams / attendingCount) / 100;
                          extraCal += ing.cal * scale;
                          extraProtein += ing.protein * scale;
                          extraCarbs += ing.carbs * scale;
                          extraFat += ing.fat * scale;
                        }
                      }
                    }
                  });
                  if (!m) return null;
                  const serves = recipe.serves || 1;
                  const perPerson = { cal: Math.round(m.cal / serves + extraCal), carbs: Math.round(m.carbs / serves + extraCarbs), fat: Math.round(m.fat / serves + extraFat), protein: Math.round(m.protein / serves + extraProtein) };
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 6, borderTop: "1px solid #1e1c18" }}>
                      <span className="dm" style={{ fontSize: 16, fontWeight: 700, color: "#c8a96e" }}>{perPerson.cal}</span>
                      <span className="dm" style={{ fontSize: 9, color: "#555" }}>cal</span>
                      {[["P", perPerson.protein, "#5c9fe0"], ["C", perPerson.carbs, "#c8a96e"], ["F", perPerson.fat, "#a78bca"]].map(([label, val, color]) => (
                        <div key={label} className="dm" style={{ fontSize: 11, color }}>
                          <span style={{ fontWeight: 700 }}>{val}g</span> <span style={{ color: "#555", fontSize: 9 }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}



    {/* ── Snack Cards ── */}
      {MEMBERS.filter(m => !activeUser || m === activeUser).map(member => {
        const snackKey = `snack_${member}`;
        const snackSlot = week[DAYS[selectedDay]]?.[snackKey] || { snacks: [] };
        const snacks = snackSlot.snacks || [];
        const color = MEMBER_COLORS[member];
        return (
          <div className="card" key={snackKey} style={{ marginBottom: 12, padding: "16px", borderColor: color + "33" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: snacks.length > 0 ? 12 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>🍎</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{member}'s Snacks</span>
              </div>
              <button className="meal-pill" onClick={() => { setSnackPickerFor({ day: DAYS[selectedDay], member }); setSnackSearch(""); }}
                style={{ borderColor: color + "55", color }}>
                + Add snack
              </button>
            </div>
            {snacks.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {snacks.map((snack, idx) => {
                  const snackRecipe = recipes.find(r => r.id === snack.mealId);
                  if (!snackRecipe) return null;
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0c0c0a", borderRadius: 8, padding: "8px 10px", border: "1px solid #252320" }}>
                      <span className="dm" style={{ fontSize: 13, color: "#ede8d8" }}>{snackRecipe.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="dm" style={{ fontSize: 11, color: "#555" }}>{snack.qty} {snack.unit}</span>
                        <button onClick={() => {
                          setWeek(prev => ({
                            ...prev,
                            [DAYS[selectedDay]]: {
                              ...prev[DAYS[selectedDay]],
                              [snackKey]: { snacks: snacks.filter((_, i) => i !== idx) }
                            }
                          }));
                        }} style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Daily Macro Summary ── */}
      {(() => {
        let totalCal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFibre = 0, totalSugar = 0;
        let hasMacros = false;
        MEAL_TYPES.forEach(mt => {
          const slot = week[DAYS[selectedDay]]?.[mt];
          if (!slot?.mealId) return;
          const recipe = recipes.find(r => r.id === slot.mealId);
          if (!recipe) return;
          const m = calcMacrosForRecipe(recipe, standaloneIngredients);
          if (!m) return;
          const perServe = { cal: m.cal / (recipe.serves || 1), protein: m.protein / (recipe.serves || 1), carbs: m.carbs / (recipe.serves || 1), fat: m.fat / (recipe.serves || 1), fibre: m.fibre / (recipe.serves || 1), sugar: m.sugar / (recipe.serves || 1) };
          totalCal += perServe.cal;
          totalProtein += perServe.protein;
          totalCarbs += perServe.carbs;
          totalFat += perServe.fat;
          totalFibre += perServe.fibre;
          totalSugar += perServe.sugar;
          hasMacros = true;

          // Include sides in daily totals
          const attendingCount = slot.attending?.length || 1;
          (slot.sides || []).forEach(side => {
            if (side.type === "recipe") {
              const sideRecipe = recipes.find(r => r.id === side.id);
              if (sideRecipe) {
                const sm = calcMacrosForRecipe(sideRecipe, standaloneIngredients);
                if (sm) {
                  const qty = parseFloat(side.qty) || 1;
                  totalCal += (sm.cal / (sideRecipe.serves || 1)) * qty / attendingCount;
                  totalProtein += (sm.protein / (sideRecipe.serves || 1)) * qty / attendingCount;
                  totalCarbs += (sm.carbs / (sideRecipe.serves || 1)) * qty / attendingCount;
                  totalFat += (sm.fat / (sideRecipe.serves || 1)) * qty / attendingCount;
                  totalFibre += (sm.fibre / (sideRecipe.serves || 1)) * qty / attendingCount;
                  totalSugar += (sm.sugar / (sideRecipe.serves || 1)) * qty / attendingCount;
                  hasMacros = true;
                }
              }
            } else {
              const ing = getMacros(side.name, standaloneIngredients);
              if (ing) {
                const totalGrams = getGramsForUnit(side.name, side.unit, parseFloat(side.qty) || 0);
                if (totalGrams !== null) {
                  const scale = (totalGrams / attendingCount) / 100;
                  totalCal += ing.cal * scale;
                  totalProtein += ing.protein * scale;
                  totalCarbs += ing.carbs * scale;
                  totalFat += ing.fat * scale;
                  totalFibre += (ing.fibre || 0) * scale;
                  totalSugar += (ing.sugar || 0) * scale;
                  hasMacros = true;
                }
              }
            }
          });
        });
        if (activeUser) {
          const snackKey = `snack_${activeUser}`;
          const slot = week[DAYS[selectedDay]]?.[snackKey];
          const snacks = slot?.snacks || [];
          snacks.forEach(snack => {
            const recipe = recipes.find(r => r.id === snack.mealId);
            if (!recipe) return;
            const m = calcMacrosForRecipe(recipe, standaloneIngredients);
            if (m) {
              totalCal += m.cal;
              totalProtein += m.protein;
              totalCarbs += m.carbs;
              totalFat += m.fat;
              totalFibre += m.fibre;
              totalSugar += m.sugar;
              hasMacros = true;
            }
          });
        }
        return (
          <div className="card" style={{ marginBottom: 12, padding: "16px", borderColor: "#c8a96e33" }}>
            <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 10 }}>
              📊 Daily Totals
            </div>
            <div style={{ marginBottom: 12 }}>
              <select value={activeUser || ""} onChange={e => setActiveUser(e.target.value || null)} style={{ width: "100%", fontSize: 14, padding: "9px 13px", background: "#0c0c0a", border: "1.5px solid #252320", borderRadius: 10, color: "#ede8d8", cursor: "pointer" }}>
                <option value="">Select Person's View to see daily macro totals</option>
                {MEMBERS.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            {activeUser && hasMacros && (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: "#c8a96e", fontFamily: "DM Sans, sans-serif" }}>{Math.round(totalCal)}</span>
                  <span className="dm" style={{ fontSize: 12, color: "#555" }}>calories</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                  {[["Protein", totalProtein, "#5c9fe0"], ["Carbs", totalCarbs, "#c8a96e"], ["Fat", totalFat, "#a78bca"]].map(([label, val, color]) => (
                    <div key={label} style={{ flex: 1, background: "#0c0c0a", borderRadius: 10, padding: "8px 10px", border: `1px solid ${color}33` }}>
                      <div className="dm" style={{ fontSize: 16, fontWeight: 700, color }}>{Math.round(val)}g</div>
                      <div className="dm" style={{ fontSize: 10, color: "#555" }}>{label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["Fibre", totalFibre], ["Sugar", totalSugar]].map(([label, val]) => (
                    <div key={label} style={{ flex: 1, background: "#0c0c0a", borderRadius: 10, padding: "6px 10px", border: "1px solid #252320" }}>
                      <div className="dm" style={{ fontSize: 13, fontWeight: 600, color: "#666" }}>{Math.round(val)}g</div>
                      <div className="dm" style={{ fontSize: 10, color: "#444" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Day Notes (per person) ── */}
      {activeUserName && (() => {
        const day = DAYS[selectedDay];
        const notes = week[day]?.[`notes_${activeUserName}`] || [];
        const color = MEMBER_COLORS[activeUserName];
        return (
          <div className="card" style={{ marginBottom: 12, padding: "16px", borderColor: color + "33" }}>
            <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 10 }}>
              📝 {activeUserName}'s Notes
            </div>
            {notes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {notes.map((note, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0c0c0a", borderRadius: 8, padding: "8px 10px", border: "1px solid #252320" }}>
                    <span className="dm" style={{ fontSize: 13, color: "#ede8d8", flex: 1 }}>{note}</span>
                    <button onClick={() => {
                      setWeek(prev => ({
                        ...prev,
                        [day]: { ...prev[day], [`notes_${activeUserName}`]: (prev[day][`notes_${activeUserName}`] || []).filter((_, i) => i !== idx) }
                      }));
                    }} style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="dayNoteInput"
                placeholder="e.g. Had a pie at lunch..."
                style={{ flex: 1 }}
                onKeyDown={e => {
                  if (e.key === "Enter" && e.target.value.trim()) {
                    const val = e.target.value.trim();
                    setWeek(prev => ({
                      ...prev,
                      [day]: { ...prev[day], [`notes_${activeUserName}`]: [...(prev[day][`notes_${activeUserName}`] || []), val] }
                    }));
                    e.target.value = "";
                  }
                }}
              />
              <button className="btn" onClick={() => {
                const input = document.getElementById("dayNoteInput");
                if (input?.value.trim()) {
                  const val = input.value.trim();
                  setWeek(prev => ({
                    ...prev,
                    [day]: { ...prev[day], [`notes_${activeUserName}`]: [...(prev[day][`notes_${activeUserName}`] || []), val] }
                  }));
                  input.value = "";
                }
              }} style={{ background: color, color: "#0c0c0a", padding: "9px 16px" }}>
                Add
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  )}

  {/* ── Recipes View ── */}
{view === "recipes" && (
  <div style={{ padding: "14px" }} className="fadeIn">
    <div style={{ position: "sticky", top: 76, zIndex: 90, background: "#0c0c0a", paddingBottom: 10, marginBottom: 4, marginLeft: -14, marginRight: -14, paddingLeft: 14, paddingRight: 14, paddingTop: 10, borderBottom: "1px solid #1a1814" }}>
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <button className="btn" onClick={() => setRecipeTab("recipes")}
        style={{ flex: 1, padding: "10px", background: recipeTab === "recipes" ? "#c8a96e" : "#1e1c18", color: recipeTab === "recipes" ? "#0c0c0a" : "#888" }}>
        📖 Recipes
      </button>
      <button className="btn" onClick={() => setRecipeTab("ingredients")}
        style={{ flex: 1, padding: "10px", background: recipeTab === "ingredients" ? "#c8a96e" : "#1e1c18", color: recipeTab === "ingredients" ? "#0c0c0a" : "#888" }}>
        🧺 Ingredients
      </button>
    </div>
    {recipeTab === "recipes" && (
    <button className="btn" onClick={() => setShowAddRecipe(true)}
      style={{ background: "#c8a96e", color: "#0c0c0a", padding: "11px 20px", width: "100%", marginBottom: 4 }}>
      + New Recipe
    </button>
    )}
    </div>
    {recipeTab === "ingredients" && (() => {
      const allIngredients = [];
      recipes.forEach(r => r.ingredients.forEach(i => {
        if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
          const override = (standaloneIngredients || []).find(s => s.name.toLowerCase() === i.name.toLowerCase());
          allIngredients.push({ name: i.name, store: override?.store || i.store, category: override?.category || i.category || guessCategory(i.name), brand: override?.brand || "" });
        }
      }));
      (standaloneIngredients || []).forEach(i => {
        if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
          allIngredients.push({ name: i.name, store: i.store, category: i.category || guessCategory(i.name), brand: i.brand || "" });
        }
      });
      return (
        <div>
          <div style={{ position: "sticky", top: 0, zIndex: 89, background: "#0c0c0a", paddingBottom: 10, marginLeft: -14, marginRight: -14, paddingLeft: 14, paddingRight: 14, paddingTop: 10, borderBottom: "1px solid #1a1814", marginBottom: 14, boxShadow: "0 8px 24px #0c0c0a" }}>
            <button className="btn" onClick={() => setShowAddIngredient(true)}
              style={{ background: "#c8a96e", color: "#0c0c0a", padding: "11px 20px", width: "100%", marginBottom: 8 }}>
              + New Ingredient
            </button>
            <input value={ingredientSearch} onChange={e => setIngredientSearch(e.target.value)} placeholder="Search ingredients..." style={{ width: "100%" }} />
          </div>
          {(() => {
            const allIngredients = [];
            recipes.forEach(r => r.ingredients.forEach(i => {
              if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
                allIngredients.push({ name: i.name });
              }
            }));
            (standaloneIngredients || []).forEach(i => {
              if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
                allIngredients.push({ name: i.name });
              }
            });
            const missing = allIngredients.filter(i => !getMacros(i.name, standaloneIngredients));
            if (missing.length === 0) return null;
            return (
              <div style={{ background: "#2a1a0a", border: "1px solid #c87c3e55", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div className="dm" style={{ fontSize: 12, color: "#c87c3e", fontWeight: 700 }}>⚠️ {missing.length} missing macros</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={() => setShowMissingMacrosOnly(p => !p)}>
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${showMissingMacrosOnly ? "#c87c3e" : "#555"}`, background: showMissingMacrosOnly ? "#c87c3e" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {showMissingMacrosOnly && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0c0c0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span className="dm" style={{ fontSize: 11, color: showMissingMacrosOnly ? "#c87c3e" : "#555" }}>Show missing only</span>
                  </div>
                </div>
                <div className="dm" style={{ fontSize: 11, color: "#888", lineHeight: 1.7 }}>
                  {missing.map(i => i.name).join(", ")}
                </div>
              </div>
            );
          })()}
          {CATEGORIES.filter(cat => allIngredients.some(i => i.category === cat && (!showMissingMacrosOnly || !getMacros(i.name, standaloneIngredients)) && (!ingredientSearch.trim() || i.name.toLowerCase().includes(ingredientSearch.toLowerCase())))).map(cat => (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 8 }}>
                {CATEGORY_ICONS[cat]} {cat}
              </div>
              <div style={{ background: "#161512", borderRadius: 12, border: "1px solid #252320", overflow: "hidden" }}>
                {allIngredients.filter(i => i.category === cat && (!showMissingMacrosOnly || !getMacros(i.name, standaloneIngredients)) && (!ingredientSearch.trim() || i.name.toLowerCase().includes(ingredientSearch.toLowerCase()))).sort((a,b) => a.name.localeCompare(b.name)).map((ing, idx, arr) => {
                  const sc = STORE_COLORS[ing.store] || STORE_COLORS.Woolworths;
                  return (
                    <div key={ing.name} onClick={() => {
  const m = getMacros(ing.name, standaloneIngredients);
  const macros = m || { cal: "", protein: "", carbs: "", fat: "", fibre: "", sugar: "" };
  const existingIng = (standaloneIngredients || []).find(i => i.name.toLowerCase() === ing.name.toLowerCase());
  setIngredientMacroPopup({ name: ing.name, brand: existingIng?.brand || "", ...macros });
  setEditingMacros({ cal: macros.cal ?? "", protein: macros.protein ?? "", carbs: macros.carbs ?? "", fat: macros.fat ?? "", fibre: macros.fibre ?? "", sugar: macros.sugar ?? "", brand: existingIng?.brand || "", category: existingIng?.category || ing.category || guessCategory(ing.name) });
  setIngredientPopupTab("macros");
}}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: idx < arr.length - 1 ? "1px solid #1a1814" : "none", cursor: "pointer" }}>
                      <div>
  <span className="dm" style={{ fontSize: 13, fontWeight: 500, color: getMacros(ing.name, standaloneIngredients) ? "#ede8d8" : "#c87c3e" }}>{ing.name}</span>
  {ing.brand && <span className="dm" style={{ fontSize: 10, color: "#555", marginLeft: 6 }}>{ing.brand}</span>}
</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {getMacros(ing.name, standaloneIngredients) ? <span className="dm" style={{ fontSize: 10, color: "#c8a96e" }}>{getMacros(ing.name, standaloneIngredients).cal} cal</span> : <span className="dm" style={{ fontSize: 10, color: "#c87c3e" }}>No macros</span>}
                        <span className="dm" style={{ fontSize: 11, color: sc.accent, background: sc.light, padding: "2px 8px", borderRadius: 100 }}>{ing.store}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    })()}
    {recipeTab === "recipes" && MEAL_TYPES.map(mt => {
      const filtered = recipes.filter(r => (r.types || [r.type]).includes(mt));
      if (!filtered.length) return null;
      return (
        <div key={mt} style={{ marginBottom: 20 }}>
          <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 8 }}>
            {MEAL_ICONS[mt]} {mt}
          </div>
          {filtered.map(r => (
            <div className="card" key={r.id} style={{ marginBottom: 8, padding: "14px 16px", cursor: "pointer" }} onClick={() => { setViewingRecipe(r); setViewingRecipeTab("ingredients"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{r.name}</span>
                  <span className="dm" style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>serves {r.serves || "?"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
  {(r.types || [r.type]).map(t => (
    <span key={t} className="dm" style={{ fontSize: 9, background: "#1e1c18", color: "#c8a96e", border: "1px solid #c8a96e33", borderRadius: 100, padding: "2px 7px" }}>{t}</span>
  ))}
  {(() => {
    const m = calcMacrosForRecipe(r, standaloneIngredients);
    if (!m) return null;
    const perServe = { cal: Math.round(m.cal / (r.serves || 1)), protein: Math.round(m.protein / (r.serves || 1)) };
    return (
      <>
        <span className="dm" style={{ fontSize: 9, color: "#555" }}>·</span>
        <span className="dm" style={{ fontSize: 9, color: "#c8a96e", fontWeight: 700 }}>{perServe.cal} cal</span>
        <span className="dm" style={{ fontSize: 9, color: "#5c9fe0", fontWeight: 700 }}>{perServe.protein}g P</span>
        <span className="dm" style={{ fontSize: 9, color: "#555" }}>/ serve</span>
      </>
    );
  })()}
</div>
                </div>
                <button className="btn" onClick={e => { e.stopPropagation(); setEditingRecipe({ ...r, types: r.types || [r.type], ingredients: processIngredientsForEdit(r.ingredients.map(i => ({ ...i, qty: i.qty || 0, unit: i.unit || "", customUnit: "" }))) }); }}
                  style={{ background: "#1e2a3a", color: "#5c9fe0", padding: "5px 11px", fontSize: 10 }}>
                  Edit
                </button>
              </div>
              
            </div>
          ))}
        </div>
      );
    })}
  </div>
)}

  {/* ── Shopping View ── */}
{view === "shopping" && (
  <div style={{ padding: "14px" }} className="fadeIn">
    <div style={{ position: "sticky", top: 76, zIndex: 90, background: "#0c0c0a", paddingBottom: 10, marginBottom: 4, marginLeft: -14, marginRight: -14, paddingLeft: 14, paddingRight: 14, paddingTop: 10, borderBottom: "1px solid #1a1814" }}>
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 0, gap: 8 }}>
      <button className="btn" onClick={() => setShowAddShoppingItem(true)} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "9px 15px" }}>+ Custom item</button>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn" onClick={() => setCompactShopping(p => !p)}
          style={{ background: compactShopping ? "#c8a96e22" : "#1e1c18", color: compactShopping ? "#c8a96e" : "#888", padding: "7px 12px", border: `1px solid ${compactShopping ? "#c8a96e55" : "transparent"}` }}>
          {compactShopping ? "⊞ Full" : "⊟ Compact"}
        </button>
        <div className="dm" style={{ fontSize: 11, color: "#555" }}>{safeShoppingList.filter(i => !isChecked(i.id, i.category || guessCategory(i.name))).length} of {safeShoppingList.length} remaining</div>
        {CATEGORIES.some(cat => Object.keys(categoryChecked[cat] || {}).some(id => categoryChecked[cat][id])) && (
          <button className="btn" onClick={() => {
            CATEGORIES.forEach(cat => setCategoryChecked[cat]({}));
          }} style={{ background: "#1e1c18", color: "#888", padding: "5px 12px", fontSize: 10 }}>
            Uncheck all
          </button>
        )}
      </div>
    </div>
    </div>

    {shoppingWarnings.length > 0 && (
  <div style={{ background: "#2a1f0a", border: "1px solid #ff980055", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
    <div className="dm" style={{ fontSize: 12, color: "#ff9800", fontWeight: 700, marginBottom: 6 }}>⚠️ Possible duplicate ingredients</div>
    {shoppingWarnings.map((w, i) => (
      <div key={i} className="dm" style={{ fontSize: 11, color: "#aaa", marginBottom: 3 }}>
        <span style={{ color: "#ff9800" }}>{w.a}</span> and <span style={{ color: "#ff9800" }}>{w.b}</span> may be the same item
      </div>
    ))}
  </div>
)}
    {safeShoppingList.length === 0 ? (
      <div className="dm" style={{ textAlign: "center", padding: 48, color: "#444" }}>No items yet — plan meals first</div>
    ) : (
      <>
        {STORES.map(store => {
          const items = safeShoppingList.filter(i => (i.tempStore || i.store) === store);
          if (!items.length) return null;
          const sc = STORE_COLORS[store];
          const remaining = items.filter(i => !isChecked(i.id, i.category || guessCategory(i.name))).length;
          return (
            <div key={store} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: sc.bg, borderRadius: 12, padding: "10px 14px", marginBottom: 6, border: `1px solid ${sc.accent}33` }}>
                <span className="dm" style={{ fontWeight: 700, fontSize: 13, color: sc.accent, flex: 1 }}>{store}</span>
                <span className="dm" style={{ fontSize: 11, color: sc.accent, opacity: .6 }}>{remaining === 0 ? "✓ done" : `${remaining} left`}</span>
              </div>
              <div style={{ background: "#161512", borderRadius: 12, border: "1px solid #252320", overflow: "hidden" }}>
                {CATEGORIES.filter(cat => items.some(i => (i.category || guessCategory(i.name)) === cat)).map(cat => (
                  <div key={cat}>
                    <div style={{ padding: "6px 14px", background: "#1a1814", borderBottom: "1px solid #252320" }}>
                      <span className="dm" style={{ fontSize: 10, color: "#888", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{CATEGORY_ICONS[cat]} {cat}</span>
                    </div>
                    {items.filter(i => (i.category || guessCategory(i.name)) === cat).map((item, idx, arr) => {
                  // Calculate how much to buy after pantry
                  const totals = getQuantitySummary(item.quantities);
                  const pantryQty = parseFloat(item.pantryQty) || 0;
                  const pantryUnit = item.pantryUnit || (item.quantities?.[0]?.unit || "");
                  const toBuy = Array.isArray(totals) ? totals.filter(t => t && typeof t.qty === 'number' && t.unit).map(t => {
  let left = t.qty;
  if (!isNaN(pantryQty) && pantryQty > 0 && pantryUnit) {
    const base1 = pantryUnit === 'kg' || pantryUnit === 'g' ? 'g' : pantryUnit === 'L' || pantryUnit === 'ml' ? 'ml' : null;
    const base2 = t.unit === 'kg' || t.unit === 'g' ? 'g' : t.unit === 'L' || t.unit === 'ml' ? 'ml' : null;
    if (base1 && base2 && base1 === base2) {
      const pantryInBase = pantryQty * (UNIT_CONVERSIONS[pantryUnit]?.[base1] || 1);
      const needInBase = t.qty * (UNIT_CONVERSIONS[t.unit]?.[base2] || 1);
      const leftInBase = Math.max(needInBase - pantryInBase, 0);
      const displayUnit = leftInBase >= 1000 ? (base1 === 'g' ? 'kg' : 'L') : base1;
      const displayQty = leftInBase >= 1000 ? leftInBase / 1000 : leftInBase;
      return { qty: parseFloat(displayQty.toFixed(2)), unit: displayUnit };
    } else if (pantryUnit === t.unit) {
      left = Math.max(t.qty - pantryQty, 0);
    }
  }
  return { qty: parseFloat(left.toFixed(2)), unit: t.unit };
}).filter(t => t.qty > 0) : [];
                  const toBuyText = toBuy.length > 0 ? toBuy.map(t => `${t.qty} ${t.unit}`).join(", ") : (pantryQty > 0 ? "✓ in pantry" : consolidateQuantities(item.quantities));

                  return (
                    <div key={item.id} style={{ borderBottom: idx < items.length - 1 ? "1px solid #1a1814" : "none" }}>
                      {/* ── Main row — always visible ── */}
                      {(() => {
                        const itemCat = item.category || guessCategory(item.name);
                        const checked = isChecked(item.id, itemCat);
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer" }}
                            onClick={() => toggleCheck(item.id, itemCat)}>
                            <div className="check-box" style={{ border: `2px solid ${checked ? sc.accent : "#333"}`, background: checked ? sc.accent : "transparent", flexShrink: 0 }}>
                              {checked && <svg width="12" height="9" viewBox="0 0 12 9" fill="none"><path d="M1 4L4.5 7.5L11 1" stroke="#0c0c0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <div className="dm" style={{ flex: 1, fontSize: 14, fontWeight: 600, textDecoration: checked ? "line-through" : "none", opacity: checked ? 0.4 : 1 }}>{item.name}</div>
                            <div className="dm" style={{ fontSize: 18, fontWeight: 700, color: checked ? "#555" : "#c8a96e", textDecoration: checked ? "line-through" : "none" }}>{toBuyText}</div>
                            {!compactShopping && (
                              <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                                style={{ background: "none", border: "none", color: "#333", fontSize: 20, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── Expanded row — hidden in compact mode ── */}
                      {!compactShopping && (
                        <div style={{ padding: "0 14px 11px 46px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}
                          onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span className="dm" style={{ fontSize: 10, color: "#555" }}>In pantry:</span>
                            <input type="number" min="0" value={item.pantryQty || ""} onChange={e => {
                              const value = e.target.value;
                              setShoppingList(prev => Array.isArray(prev) ? prev.map(i => i.id === item.id ? { ...i, pantryQty: value === "" ? 0 : parseFloat(value) } : i) : []);
                            }} placeholder="0" style={{ width: 44, background: "#1a1814", border: "1px solid #2a2824", color: "#aaa", borderRadius: 6, padding: "3px 6px", fontSize: 11 }} />
                            <select value={item.pantryUnit || (item.quantities?.[0]?.unit || "")} onChange={e => {
                              setShoppingList(prev => Array.isArray(prev) ? prev.map(i => i.id === item.id ? { ...i, pantryUnit: e.target.value } : i) : []);
                            }} style={{ background: "#1a1814", color: "#aaa", border: "1px solid #2a2824", borderRadius: 6, padding: "3px 5px", fontSize: 11 }}>
                              <option value="">—</option>
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="L">L</option>
                              <option value="cups">cups</option>
                              <option value="tbsp">tbsp</option>
                              <option value="tsp">tsp</option>
                              <option value="cans">cans</option>
                              <option value="packets">packets</option>
                              <option value="slices">slices</option>
                              <option value="whole">whole</option>
                              <option value="scoops">scoops</option>
                            </select>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span className="dm" style={{ fontSize: 10, color: "#555" }}>Store:</span>
                            <select value={item.tempStore || item.store} onChange={e => {
                              const nextStore = e.target.value;
                              setShoppingList(prev => Array.isArray(prev) ? prev.map(i => {
                                if (i.id !== item.id) return i;
                                return { ...i, tempStore: nextStore === i.store ? null : nextStore };
                              }) : []);
                            }} style={{ background: "#1a1814", color: item.tempStore && item.tempStore !== item.store ? "#c8a96e" : "#aaa", border: "1px solid #2a2824", borderRadius: 6, padding: "3px 6px", fontSize: 11 }}>
                              {STORES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            {item.tempStore && item.tempStore !== item.store && (
                              <span className="dm" style={{ fontSize: 9, color: "#c8a96e" }}>(override)</span>
                            )}
                          </div>
                          <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                            style={{ background: "none", border: "none", color: "#444", fontSize: 11, cursor: "pointer", padding: "2px 6px", fontFamily: "DM Sans, sans-serif" }}>remove</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    )}
  </div>
)}


  {showAddShoppingItem && (
    <div className="overlay" onClick={() => setShowAddShoppingItem(false)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Add custom item</h2>
          <button onClick={() => setShowAddShoppingItem(false)} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Item name</div>
          <input value={newShoppingItem.name} onChange={e => setNewShoppingItem(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Bananas" style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Quantity</div>
            <input type="number" value={newShoppingItem.qty} onChange={e => setNewShoppingItem(prev => ({ ...prev, qty: e.target.value }))} placeholder="Qty" style={{ width: "100%" }} />
          </div>
          <div>
            <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Unit</div>
            <input value={newShoppingItem.unit} onChange={e => setNewShoppingItem(prev => ({ ...prev, unit: e.target.value }))} placeholder="e.g. kg, cans" style={{ width: "100%" }} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Store</div>
          <select value={newShoppingItem.store} onChange={e => setNewShoppingItem(prev => ({ ...prev, store: e.target.value }))} style={{ width: "100%" }}>
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="btn" onClick={addShoppingItem} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "13px 20px", width: "100%" }}>
          Add item
        </button>
      </div>
    </div>
  )}

  {/* ── Goals View ── */}
  {view === "goals" && (
    <div style={{ padding: "14px" }} className="fadeIn">
      {/* Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={() => setGoalsTab("goals")}
          style={{ flex: 1, padding: "10px", background: goalsTab === "goals" ? "#c8a96e" : "#1e1c18", color: goalsTab === "goals" ? "#0c0c0a" : "#888" }}>
          🎯 Weekly Goals
        </button>
        <button className="btn" onClick={() => setGoalsTab("weight")}
          style={{ flex: 1, padding: "10px", background: goalsTab === "weight" ? "#c8a96e" : "#1e1c18", color: goalsTab === "weight" ? "#0c0c0a" : "#888" }}>
          ⚖️ Weight
        </button>
      </div>

      {/* ── Weekly Goals ── */}
      {goalsTab === "goals" && MEMBERS.map(member => {
        const memberGoals = goals[member] || [];
        const color = MEMBER_COLORS[member];
        const totalChecks = memberGoals.reduce((acc, g) => acc + Object.values(g.checks).filter(Boolean).length, 0);
        const maxChecks = memberGoals.reduce((acc, g) => acc + (g.frequency || 7), 0);
        const pct = maxChecks > 0 ? Math.round((totalChecks / maxChecks) * 100) : 0;
        return (
          <div key={member} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="dm" style={{ width: 32, height: 32, borderRadius: "50%", background: color + "22", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color }}>
                  {MEMBER_INITIALS[member]}
                </div>
                <span style={{ fontWeight: 700, fontSize: 17 }}>{member}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {maxChecks > 0 && <span className="dm" style={{ fontSize: 11, color: "#555" }}>{pct}% this week</span>}
                {memberGoals.length < MAX_GOALS && (
                  <button className="btn" onClick={() => setNewGoalMember(member)}
                    style={{ background: color + "22", color, padding: "5px 12px", fontSize: 10, border: `1px solid ${color}44` }}>
                    + Goal
                  </button>
                )}
              </div>
            </div>
            {maxChecks > 0 && (
              <div style={{ height: 3, background: "#1e1c18", borderRadius: 100, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 100, transition: "width .3s" }} />
              </div>
            )}
            {memberGoals.length === 0 ? (
              <div className="dm" style={{ fontSize: 12, color: "#444", padding: "12px 0" }}>No goals set yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {memberGoals.map(goal => {
                  const doneCount = Object.values(goal.checks).filter(Boolean).length;
                  return (
                    <div key={goal.id} className="card" style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                          <span className="dm" style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{goal.text}</span>
                          <span className="dm" style={{ fontSize: 10, color: "#555", flexShrink: 0 }}>{doneCount}/{goal.frequency || 7}</span>
                        </div>
                        <button onClick={() => deleteGoal(member, goal.id)}
                          style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1, flexShrink: 0 }}>×</button>
                      </div>
                      <div style={{ display: "flex", gap: 5 }}>
                        {DAYS.map(day => {
                          const done = goal.checks[day];
                          return (
                            <button key={day} className="goal-day-btn"
                              onClick={() => toggleGoalDay(member, goal.id, day)}
                              style={{ background: done ? color : "#1a1814", color: done ? "#0c0c0a" : "#555", border: `1px solid ${done ? color : "#252320"}`, flex: 1 }}>
                              <span style={{ fontSize: 8 }}>{day}</span>
                              {done && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="#0c0c0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Weight Section ── */}
      {goalsTab === "weight" && (() => {
        const color = MEMBER_COLORS[activeUserName] || "#c8a96e";
        const stats = weightData?.stats || {};
        const weighins = weightData?.weighins || {};
        const tdeeOverride = weightData?.tdeeOverride || null;

        const ACTIVENESS = [
          { key: "sedentary", label: "Sedentary", desc: "Little or no exercise", multiplier: 1.2 },
          { key: "light", label: "Lightly Active", desc: "1-3 days/week", multiplier: 1.375 },
          { key: "moderate", label: "Moderately Active", desc: "3-5 days/week", multiplier: 1.55 },
          { key: "active", label: "Very Active", desc: "6-7 days/week", multiplier: 1.725 },
          { key: "extra", label: "Extra Active", desc: "Athlete / physical job", multiplier: 1.9 },
        ];

        // Get latest weight from weighins
        const weighinDates = Object.keys(weighins).sort();
        const latestWeight = weighinDates.length > 0 ? weighins[weighinDates[weighinDates.length - 1]] : null;

        // Calculate BMR (Mifflin-St Jeor — needs gender, use a neutral estimate)
        const heightCm = parseFloat(stats.height) || 0;
        const weightKg = parseFloat(latestWeight) || 0;
        const activeness = ACTIVENESS.find(a => a.key === stats.activeness) || ACTIVENESS[0];
        const bmr = weightKg > 0 && heightCm > 0 ? Math.round(10 * weightKg + 6.25 * heightCm - 5 * 25 + 5) : null;
        const tdee = tdeeOverride || (bmr ? Math.round(bmr * activeness.multiplier) : null);

        const goalWeight = parseFloat(stats.goalWeight) || null;

        // Trendline calculation
        const weighinEntries = weighinDates.map((d, i) => ({ x: i, y: parseFloat(weighins[d]) })).filter(e => !isNaN(e.y));
        let trendSlope = 0, trendIntercept = 0;
        if (weighinEntries.length >= 2) {
          const n = weighinEntries.length;
          const sumX = weighinEntries.reduce((a, e) => a + e.x, 0);
          const sumY = weighinEntries.reduce((a, e) => a + e.y, 0);
          const sumXY = weighinEntries.reduce((a, e) => a + e.x * e.y, 0);
          const sumX2 = weighinEntries.reduce((a, e) => a + e.x * e.x, 0);
          trendSlope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          trendIntercept = (sumY - trendSlope * sumX) / n;
        }

        const todayKey = new Date().toISOString().slice(0, 10);

        return (
          <div>
            {/* Person indicator */}
            <div style={{ background: color + "22", border: `1px solid ${color}44`, borderRadius: 12, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <div className="dm" style={{ width: 28, height: 28, borderRadius: "50%", background: color + "33", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, color }}>
                {MEMBER_INITIALS[activeUserName]}
              </div>
              <span className="dm" style={{ fontSize: 13, color, fontWeight: 600 }}>{activeUserName}'s Weight Data</span>
            </div>

            {/* Section selector */}
            <select value={weightSection} onChange={e => setWeightSection(e.target.value)}
              style={{ width: "100%", marginBottom: 16, fontSize: 14, padding: "11px 14px" }}>
              <option value="stats">📋 Current Stats</option>
              <option value="weighin">⚖️ Weigh In</option>
              <option value="tdee">🔥 TDEE Update</option>
              <option value="progress">📈 Progress</option>
            </select>

            {/* ── Current Stats ── */}
            {weightSection === "stats" && (
              <div>
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>Your Details</div>
                  <div style={{ marginBottom: 12 }}>
                    <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Height (cm)</div>
                    <input type="number" value={stats.height || ""} onChange={e => setWeightData(p => ({ ...p, stats: { ...p.stats, height: e.target.value } }))}
                      placeholder="e.g. 178" style={{ width: "100%" }} />
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Activity Level</div>
                    <select value={stats.activeness || "sedentary"} onChange={e => setWeightData(p => ({ ...p, stats: { ...p.stats, activeness: e.target.value } }))} style={{ width: "100%" }}>
                      {ACTIVENESS.map(a => (
                        <option key={a.key} value={a.key}>{a.label} — {a.desc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ── Goal Card ── */}
                <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: color + "44" }}>
                  <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>🎯 Weight Goal</div>
                  <div style={{ marginBottom: 12 }}>
                    <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Goal Weight (kg)</div>
                    <input type="number" value={stats.goalWeight || ""} onChange={e => setWeightData(p => ({ ...p, stats: { ...p.stats, goalWeight: e.target.value } }))}
                      placeholder="e.g. 80" style={{ width: "100%" }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>Target Date</div>
                    <input type="date" value={stats.goalDate || ""} onChange={e => setWeightData(p => ({ ...p, stats: { ...p.stats, goalDate: e.target.value } }))}
                      style={{ width: "100%" }} />
                  </div>
                  {(() => {
                    if (!stats.goalWeight || !stats.goalDate || !latestWeight || !tdee) return null;
                    const today = new Date();
                    const target = new Date(stats.goalDate);
                    const daysLeft = Math.round((target - today) / (1000 * 60 * 60 * 24));
                    if (daysLeft <= 0) return <div className="dm" style={{ fontSize: 12, color: "#f44336" }}>Target date has passed</div>;
                    const kgToLose = parseFloat(latestWeight) - parseFloat(stats.goalWeight);
                    if (kgToLose <= 0) return (
                      <div style={{ background: "#1a3a1a", borderRadius: 10, padding: "12px 14px", border: "1px solid #4caf5044" }}>
                        <div className="dm" style={{ fontSize: 13, color: "#4caf50", fontWeight: 700 }}>🎉 You've reached your goal weight!</div>
                      </div>
                    );
                    const totalCalDeficit = kgToLose * 7700;
                    const dailyDeficit = totalCalDeficit / daysLeft;
                    const dailyCals = Math.round(tdee - dailyDeficit);
                    const kgPerWeek = parseFloat(((dailyDeficit * 7) / 7700).toFixed(2));
                    const isAggressive = dailyDeficit > 1000;
                    const isTooLow = dailyCals < 1200;
                    return (
                      <div style={{ background: "#0c0c0a", borderRadius: 10, padding: "14px", border: `1px solid ${isTooLow || isAggressive ? "#f4433644" : color + "44"}` }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 28, fontWeight: 700, color: isTooLow ? "#f44336" : color, fontFamily: "DM Sans, sans-serif" }}>{dailyCals}</span>
                          <span className="dm" style={{ fontSize: 12, color: "#555" }}>cal/day needed</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                          <div>
                            <div className="dm" style={{ fontSize: 12, color: "#888" }}>{daysLeft} days left</div>
                          </div>
                          <div>
                            <div className="dm" style={{ fontSize: 12, color: "#888" }}>{kgToLose.toFixed(1)}kg to lose</div>
                          </div>
                          <div>
                            <div className="dm" style={{ fontSize: 12, color: "#5c9fe0" }}>{kgPerWeek}kg/wk</div>
                          </div>
                        </div>
                        {(isTooLow || isAggressive) && (
                          <div className="dm" style={{ fontSize: 11, color: "#f44336", marginTop: 4 }}>
                            ⚠️ {isTooLow ? "This is below a safe minimum of 1200 cal. Consider extending your target date." : "This is an aggressive deficit. Consider extending your target date."}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                {tdee && (
                  <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: color + "44" }}>
                    <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>Your Estimated TDEE</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 36, fontWeight: 700, color, fontFamily: "DM Sans, sans-serif" }}>{tdee}</span>
                      <span className="dm" style={{ fontSize: 13, color: "#555" }}>cal/day</span>
                    </div>
                    <div className="dm" style={{ fontSize: 12, color: "#555" }}>Based on {latestWeight}kg, {heightCm}cm, {activeness.label.toLowerCase()}</div>
                  </div>
                )}
                {tdee && (
                  <div className="card" style={{ padding: 16 }}>
                    <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>🔢 Sensitivity Table</div>
                    <div style={{ background: "#0c0c0a", borderRadius: 10, overflow: "hidden", border: "1px solid #252320" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", background: "#1a1814", padding: "8px 10px" }}>
                        {["Calories", "Deficit", "kg/wk", "→ 5kg", "→ 10kg"].map(h => (
                          <div key={h} className="dm" style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</div>
                        ))}
                      </div>
                      {[100, 250, 500, 750].map(deficit => {
                        const cals = tdee - deficit;
                        const kgPerWeek = parseFloat(((deficit * 7) / 7700).toFixed(2));
                        const weeks5 = Math.round(5 / kgPerWeek);
                        const weeks10 = Math.round(10 / kgPerWeek);
                        return (
                          <div key={deficit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", padding: "10px 10px", borderTop: "1px solid #1a1814" }}>
                            <div className="dm" style={{ fontSize: 13, fontWeight: 700, color }}>{cals}</div>
                            <div className="dm" style={{ fontSize: 12, color: "#888" }}>-{deficit}</div>
                            <div className="dm" style={{ fontSize: 12, color: "#5c9fe0" }}>{kgPerWeek}</div>
                            <div className="dm" style={{ fontSize: 12, color: "#888" }}>{weeks5}wk</div>
                            <div className="dm" style={{ fontSize: 12, color: "#888" }}>{weeks10}wk</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Weigh In ── */}
            {weightSection === "weighin" && (
              <div>
                <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>Today's Weigh In</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" step="0.1" defaultValue={weighins[todayKey] || ""}
                      id="weighinInput" placeholder="e.g. 84.5" style={{ flex: 1 }} />
                    <span className="dm" style={{ fontSize: 13, color: "#555" }}>kg</span>
                    <button className="btn" onClick={() => {
                      const val = parseFloat(document.getElementById("weighinInput").value);
                      if (!val) return;
                      setWeightData(p => ({ ...p, weighins: { ...p.weighins, [todayKey]: val } }));
                    }} style={{ background: color, color: "#0c0c0a", padding: "10px 16px" }}>Save</button>
                  </div>
                  {weighins[todayKey] && (
                    <div className="dm" style={{ fontSize: 12, color: "#4caf50", marginTop: 8 }}>✓ Today logged: {weighins[todayKey]}kg</div>
                  )}
                </div>
                {latestWeight && (
                  <div className="card" style={{ padding: 16, marginBottom: 12 }}>
                    <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>Recent Weigh Ins</div>
                    {[...weighinDates].reverse().slice(0, 7).map(date => (
                      <div key={date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a1814" }}>
                        <span className="dm" style={{ fontSize: 12, color: "#888" }}>{new Date(date).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="dm" style={{ fontSize: 14, fontWeight: 700, color }}>{weighins[date]}kg</span>
                          <button onClick={() => setWeightData(p => {
                            const w = { ...p.weighins };
                            delete w[date];
                            return { ...p, weighins: w };
                          })} style={{ background: "none", border: "none", color: "#444", fontSize: 14, cursor: "pointer" }}>×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── TDEE Update ── */}
            {weightSection === "tdee" && (
              <div className="card" style={{ padding: 16 }}>
                <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Manual TDEE Override</div>
                <div className="dm" style={{ fontSize: 12, color: "#555", marginBottom: 14 }}>Use this if you've had your TDEE professionally measured or prefer a custom value. Leave blank to use the calculated estimate.</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <input type="number" id="tdeeInput" defaultValue={tdeeOverride || ""} placeholder={`Calculated: ${tdee || "—"}`} style={{ flex: 1 }} />
                  <span className="dm" style={{ fontSize: 13, color: "#555" }}>cal</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={() => {
                    const val = parseFloat(document.getElementById("tdeeInput").value);
                    if (!val) return;
                    setWeightData(p => ({ ...p, tdeeOverride: val }));
                  }} style={{ flex: 1, background: color, color: "#0c0c0a", padding: "11px" }}>Save Override</button>
                  {tdeeOverride && (
                    <button className="btn" onClick={() => setWeightData(p => ({ ...p, tdeeOverride: null }))}
                      style={{ background: "#1e1c18", color: "#888", padding: "11px 16px" }}>Clear</button>
                  )}
                </div>
                {tdeeOverride && (
                  <div className="dm" style={{ fontSize: 12, color: "#4caf50", marginTop: 8 }}>✓ Using manual TDEE: {tdeeOverride} cal</div>
                )}
              </div>
            )}

            {/* ── Progress ── */}
            {weightSection === "progress" && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  <button className="btn" onClick={() => setWeightViewMode("graph")}
                    style={{ flex: 1, padding: "9px", background: weightViewMode === "graph" ? color : "#1e1c18", color: weightViewMode === "graph" ? "#0c0c0a" : "#888" }}>
                    📈 Graph
                  </button>
                  <button className="btn" onClick={() => setWeightViewMode("table")}
                    style={{ flex: 1, padding: "9px", background: weightViewMode === "table" ? color : "#1e1c18", color: weightViewMode === "table" ? "#0c0c0a" : "#888" }}>
                    📋 Table
                  </button>
                </div>

                {weighinEntries.length < 2 ? (
                  <div className="dm" style={{ textAlign: "center", padding: 32, color: "#444", fontSize: 13 }}>Log at least 2 weigh-ins to see your progress</div>
                ) : weightViewMode === "graph" ? (() => {
                  const W = 340, H = 200, PAD = 36;
                  const ys = weighinEntries.map(e => e.y);
                  if (goalWeight) ys.push(goalWeight);
                  const minY = Math.min(...ys) - 1;
                  const maxY = Math.max(...ys) + 1;
                  const toX = i => PAD + (i / (weighinEntries.length - 1)) * (W - PAD * 2);
                  const toY = v => H - PAD - ((v - minY) / (maxY - minY)) * (H - PAD * 2);
                  const actualPath = weighinEntries.map((e, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(e.y)}`).join(" ");
                  const trendPath = weighinEntries.length >= 2
                    ? `M${toX(0)},${toY(trendIntercept)} L${toX(weighinEntries.length - 1)},${toY(trendSlope * (weighinEntries.length - 1) + trendIntercept)}`
                    : null;
                  const goalY = goalWeight ? toY(goalWeight) : null;
                  return (
                    <div className="card" style={{ padding: 16 }}>
                      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
                        {/* Grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map(t => {
                          const yVal = minY + t * (maxY - minY);
                          const yPos = toY(yVal);
                          return (
                            <g key={t}>
                              <line x1={PAD} y1={yPos} x2={W - PAD} y2={yPos} stroke="#1e1c18" strokeWidth="1" />
                              <text x={PAD - 4} y={yPos + 4} fill="#555" fontSize="9" textAnchor="end" fontFamily="DM Sans">{yVal.toFixed(1)}</text>
                            </g>
                          );
                        })}
                        {/* Goal weight line */}
                        {goalY !== null && (
                          <>
                            <line x1={PAD} y1={goalY} x2={W - PAD} y2={goalY} stroke={color} strokeWidth="1.5" strokeDasharray="4,4" opacity="0.6" />
                            <text x={W - PAD + 4} y={goalY + 4} fill={color} fontSize="9" fontFamily="DM Sans">Goal</text>
                          </>
                        )}
                        {/* Trend line */}
                        {trendPath && <path d={trendPath} stroke="#a78bca" strokeWidth="1.5" fill="none" strokeDasharray="3,3" opacity="0.8" />}
                        {/* Actual line */}
                        <path d={actualPath} stroke={color} strokeWidth="2" fill="none" />
                        {/* Dots */}
                        {weighinEntries.map((e, i) => (
                          <circle key={i} cx={toX(i)} cy={toY(e.y)} r="3" fill={color} />
                        ))}
                        {/* X axis labels */}
                        {weighinEntries.map((e, i) => {
                          if (i % Math.ceil(weighinEntries.length / 5) !== 0 && i !== weighinEntries.length - 1) return null;
                          const date = weighinDates[i];
                          return (
                            <text key={i} x={toX(i)} y={H - 4} fill="#555" fontSize="8" textAnchor="middle" fontFamily="DM Sans">
                              {new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                            </text>
                          );
                        })}
                      </svg>
                      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 16, height: 2, background: color, borderRadius: 1 }} />
                          <span className="dm" style={{ fontSize: 10, color: "#555" }}>Actual</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div style={{ width: 16, height: 2, background: "#a78bca", borderRadius: 1 }} />
                          <span className="dm" style={{ fontSize: 10, color: "#555" }}>Trend</span>
                        </div>
                        {goalWeight && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 16, height: 2, background: color, borderRadius: 1, opacity: 0.5 }} />
                            <span className="dm" style={{ fontSize: 10, color: "#555" }}>Goal</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })() : (
                  <div className="card" style={{ padding: 16 }}>
                    <div style={{ background: "#0c0c0a", borderRadius: 10, overflow: "hidden", border: "1px solid #252320" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "#1a1814", padding: "8px 12px" }}>
                        {["Date", "Weight", "Change"].map(h => (
                          <div key={h} className="dm" style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: ".08em" }}>{h}</div>
                        ))}
                      </div>
                      {[...weighinDates].reverse().map((date, idx, arr) => {
                        const prev = arr[idx + 1] ? weighins[arr[idx + 1]] : null;
                        const curr = weighins[date];
                        const change = prev ? parseFloat((curr - prev).toFixed(1)) : null;
                        return (
                          <div key={date} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "10px 12px", borderTop: "1px solid #1a1814" }}>
                            <div className="dm" style={{ fontSize: 12, color: "#888" }}>{new Date(date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>
                            <div className="dm" style={{ fontSize: 13, fontWeight: 700, color }}>{curr}kg</div>
                            <div className="dm" style={{ fontSize: 12, color: change === null ? "#555" : change < 0 ? "#4caf50" : change > 0 ? "#f44336" : "#555" }}>
                              {change === null ? "—" : change > 0 ? `+${change}` : change}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  )}

{/* ── Back to Top ── */}
  {view === "recipes" && showBackToTop && (
    <button className="btn" onClick={() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }} style={{ position: "fixed", bottom: 90, left: 20, background: "#c8a96e", color: "#0c0c0a", padding: "10px 16px", zIndex: 150, boxShadow: "0 4px 12px #0c0c0a88" }}>
      ↑ Top
    </button>
  )}

  {/* ── Bottom Nav ── */}
  <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#0c0c0a", borderTop: "1px solid #1a1814", display: "flex", justifyContent: "space-around", padding: "6px 0 16px" }}>
    {[
      { id: "week", icon: "▦", label: "Week" },
      { id: "day", icon: "◻", label: "Day" },
      { id: "recipes", icon: "📖", label: "Recipes" },
      { id: "shopping", icon: "🛒", label: "Shop" },
      { id: "goals", icon: "🎯", label: "Goals" },
    ].map(tab => (
      <button key={tab.id} className={`nav-btn ${view === tab.id ? "active" : "inactive"}`} onClick={() => setView(tab.id)}>
        <span style={{ fontSize: 17 }}>{tab.icon}</span>
        {tab.label}
      </button>
    ))}
  </div>

  {/* ── Meal Picker Modal ── */}
{pickerFor && (
  <div className="overlay" onClick={() => setPickerFor(null)}>
    <div className="sheet" onClick={e => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{MEAL_ICONS[pickerFor.mealType]} {pickerFor.mealType} — {pickerFor.day}</h2>
        <button onClick={() => setPickerFor(null)} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer" }}>×</button>
      </div>
      {(pickerFor.mealType === "Snack"
        ? week[pickerFor.day]?.[`snack_${pickerFor.member}`]?.mealId
        : week[pickerFor.day]?.[pickerFor.mealType]?.mealId) && (
        <button className="btn" onClick={() => {
          if (pickerFor.mealType === "Snack") {
            const snackKey = `snack_${pickerFor.member}`;
            setWeek(prev => ({ ...prev, [pickerFor.day]: { ...prev[pickerFor.day], [snackKey]: { mealId: null } } }));
            setPickerFor(null);
          } else {
            setMeal(pickerFor.day, pickerFor.mealType, null);
            setPickerLeftovers(false);
          }
        }} style={{ background: "#1e1c18", color: "#888", padding: "8px 16px", width: "100%", marginBottom: 10 }}>
          Remove meal
        </button>
      )}
      {recipes.filter(r => pickerFor.mealType === "Snack" || (r.types || [r.type]).includes(pickerFor.mealType)).map(r => {
        const active = week[pickerFor.day]?.[pickerFor.mealType]?.mealId === r.id;
        const currentLeftovers = active ? (pickerLeftovers) : false;
        const dayIndex = DAYS.indexOf(pickerFor.day);
        const nextDay = DAYS[(dayIndex + 1) % 7];
        const nextDayName = FULL_DAYS[(dayIndex + 1) % 7];
        return (
          <div key={r.id} style={{ padding: "13px 15px", borderRadius: 12, marginBottom: 7, background: active ? "#c8a96e1a" : "#0c0c0a", border: `1.5px solid ${active ? "#c8a96e" : "#252320"}` }}>
            <div onClick={() => {
              if (pickerFor.mealType === "Snack") {
                const snackKey = `snack_${pickerFor.member}`;
                setWeek(prev => ({ ...prev, [pickerFor.day]: { ...prev[pickerFor.day], [snackKey]: { mealId: r.id } } }));
                setPickerFor(null);
              } else {
                setMeal(pickerFor.day, pickerFor.mealType, r.id, pickerLeftovers);
              }
            }} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</span>
                <span className="dm" style={{ fontSize: 10, color: "#555" }}>serves {r.serves || "?"}</span>
              </div>
              <div className="dm" style={{ fontSize: 11, color: "#555" }}>{r.ingredients.slice(0, 3).map(i => i.name).join(", ")}{r.ingredients.length > 3 ? "..." : ""}</div>
            </div>
            {active && pickerFor.mealType !== "Lunch" && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e1c18", display: "flex", alignItems: "center", gap: 8 }}
                onClick={e => e.stopPropagation()}>
                <div onClick={() => {
                  const newVal = !pickerLeftovers;
                  setPickerLeftovers(newVal);
                  setMeal(pickerFor.day, pickerFor.mealType, r.id, newVal);
                }} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${pickerLeftovers ? "#c8a96e" : "#555"}`, background: pickerLeftovers ? "#c8a96e" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {pickerLeftovers && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="#0c0c0a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span className="dm" style={{ fontSize: 12, color: pickerLeftovers ? "#c8a96e" : "#666" }}>
                  Leftovers → {nextDayName} Lunch
                </span>
              </div>
            )}
          </div>
        );
      })}
      {recipes.filter(r => (r.types || [r.type]).includes(pickerFor.mealType)).length === 0 && (
        <div className="dm" style={{ color: "#444", textAlign: "center", padding: 24, fontSize: 13 }}>No {pickerFor.mealType.toLowerCase()} recipes yet</div>
      )}
    </div>
  </div>
)}


  {/* ── Add Recipe Modal ── */}
  {showAddRecipe && (
    <div className="overlay" onClick={() => setShowAddRecipe(false)}>
      <RecipeForm
  title="New Recipe"
  recipes={recipes}
  initial={{ name: "", types: ["Dinner"], serves: 4, cookedInOil: false, ingredients: [{ name: "", qty: 0, unit: "", store: "Woolworths", customUnit: "" }] }}
  onSave={saveNewRecipe}
  onClose={() => setShowAddRecipe(false)}
/>
    </div>
  )}

  {/* ── Edit Recipe Modal ── */}
  {editingRecipe && (
    <div className="overlay" onClick={() => setEditingRecipe(null)}>
      <RecipeForm
  title={`Edit: ${editingRecipe.name}`}
  recipes={recipes}
  initial={editingRecipe}
  onSave={saveEditedRecipe}
  onClose={() => setEditingRecipe(null)}
/>
    </div>
  )}

{/* ── Add Ingredient Modal ── */}
  {showAddIngredient && (
    <div className="overlay" onClick={() => { setShowAddIngredient(false); setNewIngredient({ name: "", brand: "", store: "Woolworths", category: "Other", macros: { cal: "", protein: "", carbs: "", fat: "", fibre: "", sugar: "" } }); }}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>New Ingredient</h2>
          <button onClick={() => { setShowAddIngredient(false); setNewIngredient({ name: "", brand: "", store: "Woolworths", category: "Other", macros: { cal: "", protein: "", carbs: "", fat: "", fibre: "", sugar: "" } }); }}
            style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Name</div>
          <IngredientAutocomplete
            value={newIngredient.name}
            onChange={val => setNewIngredient(p => ({ ...p, name: val, category: guessCategory(val) }))}
            onSelectFull={item => setNewIngredient(p => ({ ...p, name: item.name, store: item.store || p.store, category: item.category || guessCategory(item.name) }))}
            recipes={recipes}
            extraIngredients={standaloneIngredients || []}
          />
          {(() => {
            const n = newIngredient.name.trim().toLowerCase();
            if (!n) return null;
            const inRecipes = recipes.some(r => r.ingredients.some(i => i.name.toLowerCase() === n));
            const inStandalone = (standaloneIngredients || []).some(i => i.name.toLowerCase() === n);
            if (inRecipes || inStandalone) return (
              <div className="dm" style={{ fontSize: 11, color: "#ff9800", marginTop: 6 }}>
                ⚠️ This ingredient already exists in your database
              </div>
            );
            return null;
          })()}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Brand <span style={{ color: "#444" }}>(optional)</span></div>
          <input value={newIngredient.brand || ""} onChange={e => setNewIngredient(p => ({ ...p, brand: e.target.value }))} placeholder="e.g. Optimum Nutrition" style={{ width: "100%" }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Store</div>
          <select value={newIngredient.store} onChange={e => setNewIngredient(p => ({ ...p, store: e.target.value }))} style={{ width: "100%" }}>
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Category</div>
          <select value={newIngredient.category} onChange={e => setNewIngredient(p => ({ ...p, category: e.target.value }))} style={{ width: "100%" }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Whole unit conversion <span style={{ color: "#444" }}>(optional)</span></div>
          <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 8 }}>If sold/measured as "whole" (e.g. 1 apple), enter the weight of 1 whole item</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select id="conversionFromUnit" defaultValue="whole" style={{ width: 90 }}>
                  {["whole", "slices", "cans", "jar", "packet", "scoops", "cups"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="dm" style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>=</span>
            <input type="number" min="0" value={newIngredient.gramsPerWhole || ""} onChange={e => setNewIngredient(p => ({ ...p, gramsPerWhole: parseFloat(e.target.value) || "" }))} placeholder="e.g. 120" style={{ width: 90 }} />
            <select value={newIngredient.wholeUnit || "g"} onChange={e => setNewIngredient(p => ({ ...p, wholeUnit: e.target.value }))} style={{ width: 80 }}>
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </div>
        </div>

        {/* ── Macros section ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em" }}>Macros per 100g</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button className="btn" onClick={() => setNewIngredient(p => ({ ...p, _useKj: !p._useKj }))}
                style={{ padding: "4px 10px", background: newIngredient._useKj ? "#1e2a3a" : "#1a1814", color: newIngredient._useKj ? "#5c9fe0" : "#555", fontSize: 10, border: `1px solid ${newIngredient._useKj ? "#5c9fe044" : "transparent"}` }}>
                {newIngredient._useKj ? "kJ" : "kcal"}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[["cal", newIngredient._useKj ? "Energy (kJ)" : "Calories (kcal)"], ["protein", "Protein (g)"], ["carbs", "Carbs (g)"], ["fat", "Fat (g)"], ["fibre", "Fibre (g)"], ["sugar", "Sugar (g)"]].map(([key, label]) => (
              <div key={key}>
                <div className="dm" style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{label}</div>
                <input type="number" min="0" value={newIngredient.macros?.[key] ?? ""} onChange={e => {
                  let val = parseFloat(e.target.value);
                  if (key === "cal" && newIngredient._useKj && !isNaN(val)) val = Math.round(val / 4.184);
                  setNewIngredient(p => ({ ...p, macros: { ...p.macros, [key]: isNaN(val) ? "" : val } }));
                }} placeholder="—" style={{ width: "100%", padding: "7px 10px", fontSize: 13 }} />
              </div>
            ))}
          </div>
          {newIngredient._useKj && newIngredient.macros?.cal && (
            <div className="dm" style={{ fontSize: 11, color: "#5c9fe0", marginTop: 6 }}>
              = {newIngredient.macros.cal} kcal stored
            </div>
          )}
        </div>

        <button className="btn" onClick={() => {
          const name = newIngredient.name.trim();
          if (!name) return;
          const exists = (standaloneIngredients || []).find(i => i.name.toLowerCase() === name.toLowerCase());
          const macros = newIngredient.macros;
          const hasMacros = macros && Object.values(macros).some(v => v !== "" && v !== null);
          const parsedMacros = hasMacros ? {
            cal: parseFloat(macros.cal) || 0,
            protein: parseFloat(macros.protein) || 0,
            carbs: parseFloat(macros.carbs) || 0,
            fat: parseFloat(macros.fat) || 0,
            fibre: parseFloat(macros.fibre) || 0,
            sugar: parseFloat(macros.sugar) || 0,
          } : null;
          if (!exists) {
            const gramsPerWhole = newIngredient.gramsPerWhole ? parseFloat(newIngredient.gramsPerWhole) : null;
            const wholeUnit = newIngredient.wholeUnit || "g";
            setStandaloneIngredients(prev => [...(Array.isArray(prev) ? prev : []), { name, brand: newIngredient.brand?.trim() || "", store: newIngredient.store, category: newIngredient.category || guessCategory(name), ...(parsedMacros ? { macros: parsedMacros } : {}), ...(gramsPerWhole ? { gramsPerWhole, wholeUnit } : {}) }]);
          }
          setShowAddIngredient(false);
          setNewIngredient({ name: "", brand: "", store: "Woolworths", category: "Other", macros: { cal: "", protein: "", carbs: "", fat: "", fibre: "", sugar: "" } });
        }} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "13px 20px", width: "100%" }}>
          Save Ingredient
        </button>
      </div>
    </div>
  )}
{/* ── Recipe View Modal ── */}
  {viewingRecipe && (
    <div className="overlay" onClick={() => setViewingRecipe(null)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{viewingRecipe.name}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setEditingRecipe({ ...viewingRecipe, types: viewingRecipe.types || [viewingRecipe.type], ingredients: processIngredientsForEdit(viewingRecipe.ingredients.map(i => ({ ...i, qty: i.qty || 0, unit: i.unit || "", customUnit: "" }))) }); setViewingRecipe(null); }}
              style={{ background: "#1e2a3a", border: "none", color: "#5c9fe0", borderRadius: 100, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontSize: 11, fontWeight: 600 }}>Edit</button>
            <button onClick={() => setViewingRecipe(null)} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
  <div className="dm" style={{ fontSize: 11, color: "#555" }}>Serves {viewingRecipe.serves || "?"}</div>
  {viewingRecipe.cookedInOil && (
    <span className="dm" style={{ fontSize: 10, background: "#2a1f0a", color: "#ff9800", border: "1px solid #ff980044", borderRadius: 100, padding: "2px 8px" }}>🫒 Cooked in olive oil</span>
  )}
</div>

        {/* Macros */}
        {(() => {
          const m = calcMacrosForRecipe(viewingRecipe, standaloneIngredients);
          if (!m) return null;
          const ps = { cal: Math.round(m.cal / (viewingRecipe.serves || 1)), protein: Math.round(m.protein / (viewingRecipe.serves || 1)), carbs: Math.round(m.carbs / (viewingRecipe.serves || 1)), fat: Math.round(m.fat / (viewingRecipe.serves || 1)), fibre: Math.round(m.fibre / (viewingRecipe.serves || 1)), sugar: Math.round(m.sugar / (viewingRecipe.serves || 1)) };
          return (
            <div style={{ background: "#0c0c0a", borderRadius: 12, padding: "14px", marginBottom: 16, border: "1px solid #252320" }}>
              <div className="dm" style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Per serve</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#c8a96e", fontFamily: "DM Sans, sans-serif" }}>{ps.cal}</span>
                <span className="dm" style={{ fontSize: 12, color: "#555" }}>calories</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {[["Protein", ps.protein, "#5c9fe0"], ["Carbs", ps.carbs, "#c8a96e"], ["Fat", ps.fat, "#a78bca"]].map(([label, val, color]) => (
                  <div key={label} style={{ flex: 1, background: "#161512", borderRadius: 8, padding: "8px", border: `1px solid ${color}33` }}>
                    <div className="dm" style={{ fontSize: 15, fontWeight: 700, color }}>{val}g</div>
                    <div className="dm" style={{ fontSize: 10, color: "#555" }}>{label}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["Fibre", ps.fibre], ["Sugar", ps.sugar]].map(([label, val]) => (
                  <div key={label} style={{ flex: 1, background: "#161512", borderRadius: 8, padding: "6px 8px", border: "1px solid #252320" }}>
                    <div className="dm" style={{ fontSize: 13, fontWeight: 600, color: "#666" }}>{val}g</div>
                    <div className="dm" style={{ fontSize: 10, color: "#444" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Tab toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button className="btn" onClick={() => setViewingRecipeTab("ingredients")}
            style={{ flex: 1, padding: "9px", background: viewingRecipeTab === "ingredients" ? "#c8a96e" : "#1e1c18", color: viewingRecipeTab === "ingredients" ? "#0c0c0a" : "#888" }}>
            🧺 Ingredients
          </button>
          <button className="btn" onClick={() => setViewingRecipeTab("steps")}
            style={{ flex: 1, padding: "9px", background: viewingRecipeTab === "steps" ? "#c8a96e" : "#1e1c18", color: viewingRecipeTab === "steps" ? "#0c0c0a" : "#888" }}>
            👨‍🍳 Steps
          </button>
        </div>

        {/* Ingredients tab */}
        {viewingRecipeTab === "ingredients" && (
          <div style={{ background: "#0c0c0a", borderRadius: 12, border: "1px solid #252320", overflow: "hidden" }}>
            {viewingRecipe.ingredients.map((ing, idx) => {
              const sc = STORE_COLORS[ing.store] || STORE_COLORS.Woolworths;
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: idx < viewingRecipe.ingredients.length - 1 ? "1px solid #1a1814" : "none" }}>
                  <span className="dm" style={{ fontSize: 13 }}>{ing.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="dm" style={{ fontSize: 12, color: "#888" }}>{ing.qty} {ing.unit}</span>
                    <span className="dm" style={{ fontSize: 11, color: sc.accent, background: sc.light, padding: "2px 8px", borderRadius: 100 }}>{ing.store}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Steps tab */}
        {viewingRecipeTab === "steps" && (
          <div>
            {(viewingRecipe.steps || []).length === 0 ? (
              <div className="dm" style={{ textAlign: "center", padding: 32, color: "#444", fontSize: 13 }}>No steps added yet — tap Edit to add them</div>
            ) : (
              (viewingRecipe.steps || []).map((step, idx) => (
                <div key={idx} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div className="dm" style={{ width: 28, height: 28, borderRadius: "50%", background: "#c8a96e22", color: "#c8a96e", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{idx + 1}</div>
                  <div className="dm" style={{ fontSize: 14, color: "#ede8d8", lineHeight: 1.6, paddingTop: 4 }}>{step}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )}

  {/* ── Ingredient Macro Popup ── */}
  {ingredientMacroPopup && (
    <div className="overlay" onClick={() => setIngredientMacroPopup(null)}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{ingredientMacroPopup.name}</h2>
          <button onClick={() => setIngredientMacroPopup(null)} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {[["macros", "📊 Macros"], ["conversions", "⚖️ Conversions"], ["recipes", "📖 Used In"]].map(([tab, label]) => (
            <button key={tab} className="btn" onClick={() => setIngredientPopupTab(tab)}
              style={{ flex: 1, padding: "8px 4px", background: ingredientPopupTab === tab ? "#c8a96e" : "#1e1c18", color: ingredientPopupTab === tab ? "#0c0c0a" : "#888", fontSize: 10 }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Macros tab ── */}
        {ingredientPopupTab === "macros" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Category</div>
              <select value={editingMacros.category || guessCategory(ingredientMacroPopup.name)} onChange={e => setEditingMacros(p => ({ ...p, category: e.target.value }))} style={{ width: "100%" }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Brand <span style={{ color: "#444" }}>(optional)</span></div>
              <input value={editingMacros.brand ?? ""} onChange={e => setEditingMacros(p => ({ ...p, brand: e.target.value }))} placeholder="e.g. Woolworths" style={{ width: "100%" }} />
            </div>
            <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 14 }}>Per 100g</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[["cal", "Calories"], ["protein", "Protein (g)"], ["carbs", "Carbs (g)"], ["fat", "Fat (g)"], ["fibre", "Fibre (g)"], ["sugar", "Sugar (g)"]].map(([key, label]) => (
                <div key={key}>
                  <div className="dm" style={{ fontSize: 9, color: "#444", marginBottom: 4 }}>{label}</div>
                  <input type="number" min="0" value={editingMacros[key] ?? ""} onChange={e => setEditingMacros(p => ({ ...p, [key]: e.target.value }))}
                    placeholder="—" style={{ width: "100%", padding: "7px 10px", fontSize: 13 }} />
                </div>
              ))}
            </div>
            <button className="btn" onClick={() => {
              const name = ingredientMacroPopup.name;
              const parsedMacros = {
                cal: parseFloat(editingMacros.cal) || 0,
                protein: parseFloat(editingMacros.protein) || 0,
                carbs: parseFloat(editingMacros.carbs) || 0,
                fat: parseFloat(editingMacros.fat) || 0,
                fibre: parseFloat(editingMacros.fibre) || 0,
                sugar: parseFloat(editingMacros.sugar) || 0,
              };
              const brand = editingMacros.brand?.trim() || "";
              const category = editingMacros.category || guessCategory(name);
              setStandaloneIngredients(prev => {
                const list = Array.isArray(prev) ? prev : [];
                const exists = list.find(i => i.name.toLowerCase() === name.toLowerCase());
                if (exists) {
                  return list.map(i => i.name.toLowerCase() === name.toLowerCase() ? { ...i, brand, category, macros: parsedMacros } : i);
                } else {
                  return [...list, { name, brand, category, store: "Woolworths", macros: parsedMacros }];
                }
              });
              setIngredientMacroPopup(null);
            }} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "13px 20px", width: "100%" }}>
              Save
            </button>
          </>
        )}

        {/* ── Conversions tab ── */}
        {ingredientPopupTab === "conversions" && (() => {
          const name = ingredientMacroPopup.name;
          const existing = (standaloneIngredients || []).find(i => i.name.toLowerCase() === name.toLowerCase());
          const hardcoded = GRAMS_PER_UNIT[name.toLowerCase()];
          const gramsPerWhole = existing?.gramsPerWhole || (hardcoded?.whole) || null;
          const wholeUnit = existing?.wholeUnit || "g";
          const conversionUnit = existing?.conversionUnit || "whole";
          return (
            <>
              <div style={{ background: "#0c0c0a", borderRadius: 12, padding: "14px", marginBottom: 16, border: "1px solid #252320" }}>
                <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Saved conversion</div>
                {gramsPerWhole ? (
                  <>
                    <div className="dm" style={{ fontSize: 16, color: "#ede8d8", marginBottom: 6 }}>
                      1 {conversionUnit} = <span style={{ color: "#c8a96e", fontWeight: 700 }}>{gramsPerWhole}{wholeUnit}</span>
                    </div>
                    <div className="dm" style={{ fontSize: 13, color: "#555" }}>
                      100{wholeUnit} = {parseFloat((100 / gramsPerWhole).toFixed(2))} {conversionUnit}
                    </div>
                  </>
                ) : (
                  <div className="dm" style={{ fontSize: 13, color: "#444" }}>No conversion saved yet</div>
                )}
              </div>
              <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Set conversion</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
                <span className="dm" style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>1</span>
                <select id="conversionFromUnit" defaultValue={conversionUnit} style={{ width: 90 }}>
                  {["whole", "slices", "cans", "jar", "packet", "scoops", "cups"].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="dm" style={{ fontSize: 13, color: "#555", whiteSpace: "nowrap" }}>=</span>
                <input type="number" min="0" id="conversionInput" defaultValue={gramsPerWhole || ""} placeholder="e.g. 200" style={{ flex: 1 }} />
                <select id="conversionUnit" defaultValue={wholeUnit} style={{ width: 70 }}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
              <button className="btn" onClick={() => {
                const val = parseFloat(document.getElementById("conversionInput").value);
                const unit = document.getElementById("conversionUnit").value;
                const fromUnit = document.getElementById("conversionFromUnit").value;
                if (!val) return;
                setStandaloneIngredients(prev => {
                  const list = Array.isArray(prev) ? prev : [];
                  const exists = list.find(i => i.name.toLowerCase() === name.toLowerCase());
                  if (exists) {
                    return list.map(i => i.name.toLowerCase() === name.toLowerCase() ? { ...i, gramsPerWhole: val, wholeUnit: unit, conversionUnit: fromUnit } : i);
                  } else {
                    return [...list, { name, store: "Woolworths", category: guessCategory(name), gramsPerWhole: val, wholeUnit: unit, conversionUnit: fromUnit }];
                  }
                });
                setIngredientMacroPopup(null);
              }} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "13px 20px", width: "100%" }}>
                Save Conversion
              </button>
            </>
          );
        })()}

        {/* ── Used In tab ── */}
        {ingredientPopupTab === "recipes" && (() => {
          const name = ingredientMacroPopup.name;
          const usedIn = recipes.filter(r => r.ingredients.some(i => i.name.toLowerCase() === name.toLowerCase()) && !r.id?.toString().startsWith("snack-ing-"));
          return (
            <>
              {usedIn.length === 0 ? (
                <div className="dm" style={{ textAlign: "center", padding: 32, color: "#444", fontSize: 13 }}>Not used in any recipes</div>
              ) : (
                <div style={{ background: "#0c0c0a", borderRadius: 12, border: "1px solid #252320", overflow: "hidden" }}>
                  {usedIn.map((r, idx) => {
                    const ing = r.ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
                    return (
                      <div key={r.id} onClick={() => { setViewingRecipe(r); setIngredientMacroPopup(null); }}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: idx < usedIn.length - 1 ? "1px solid #1a1814" : "none", cursor: "pointer" }}>
                        <div>
                          <div className="dm" style={{ fontSize: 13, fontWeight: 600, color: "#ede8d8" }}>{r.name}</div>
                          <div className="dm" style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{ing?.qty} {ing?.unit}</div>
                        </div>
                        <span className="dm" style={{ fontSize: 11, color: "#c8a96e" }}>→</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  )}

{/* ── Snack Picker Modal ── */}
  {snackPickerFor && (
    <div className="overlay" onClick={() => setSnackPickerFor(null)} style={{ alignItems: "flex-start", paddingTop: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#161512", borderRadius: "0 0 24px 24px", width: "100%", maxWidth: 480, maxHeight: "80vh", overflowY: "auto", padding: 24, paddingBottom: 40, borderBottom: "1px solid #252320", borderLeft: "1px solid #252320", borderRight: "1px solid #252320" }}>
        <div style={{ position: "sticky", top: 0, background: "#161512", paddingBottom: 12, zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>🍎 {snackPickerFor.member}'s Snack</h2>
            <button onClick={() => { setSnackPickerFor(null); setSelectedSnackIng(null); }} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer" }}>×</button>
          </div>
          <input
            value={snackSearch}
            onChange={e => setSnackSearch(e.target.value)}
            placeholder="Search ingredients..."
            style={{ width: "100%" }}
            autoFocus
          />
        </div>
        {(() => {
          const snackKey = `snack_${snackPickerFor.member}`;
          const currentSnack = week[snackPickerFor.day]?.[snackKey]?.mealId;
          const currentSnackRecipe = currentSnack ? recipes.find(r => r.id === currentSnack) : null;
          const allIngredients = [];
          recipes.forEach(r => r.ingredients.forEach(i => {
            if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
              allIngredients.push({ name: i.name, store: i.store, category: i.category || guessCategory(i.name) });
            }
          }));
          (standaloneIngredients || []).forEach(i => {
            if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
              allIngredients.push({ name: i.name, store: i.store, category: i.category || guessCategory(i.name) });
            }
          });
          const filtered = snackSearch.trim().length > 0
            ? allIngredients.filter(i => i.name.toLowerCase().includes(snackSearch.toLowerCase()))
            : allIngredients;
          const grouped = CATEGORIES.filter(cat => filtered.some(i => (i.category || guessCategory(i.name)) === cat));
          return (
            <>
              {currentSnackRecipe && (
                <button className="btn" onClick={() => {
                  setWeek(prev => ({ ...prev, [snackPickerFor.day]: { ...prev[snackPickerFor.day], [snackKey]: { mealId: null } } }));
                  setSnackPickerFor(null);
                }} style={{ background: "#1e1c18", color: "#888", padding: "8px 16px", width: "100%", marginBottom: 10 }}>
                  Remove snack
                </button>
              )}
              {grouped.map(cat => (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>
                    {CATEGORY_ICONS[cat]} {cat}
                  </div>
                  {filtered.filter(i => (i.category || guessCategory(i.name)) === cat).sort((a,b) => a.name.localeCompare(b.name)).map(ing => {
                    const sc = STORE_COLORS[ing.store] || STORE_COLORS.Woolworths;
                    const isSelected = selectedSnackIng?.name === ing.name;
                    return (
                      <div key={ing.name}>
                        <div onClick={() => {
                          const allIngs = [];
                          const snackId = `snack-ing-${ing.name.toLowerCase().replace(/\s+/g, "-")}`;
                          recipes.forEach(r => r.ingredients.forEach(i => { if (i.name.toLowerCase() === ing.name.toLowerCase() && r.id !== snackId) allIngs.push(i); }));
                          const matched = allIngs[0];
                          const unit = matched?.unit || ing.unit || "whole";
                          setSelectedSnackIng({ ...ing, unit });
                          setSnackQty(1);
                          setSnackUnit(unit);
                        }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, marginBottom: 4, background: isSelected ? "#c8a96e1a" : "#0c0c0a", border: `1.5px solid ${isSelected ? "#c8a96e" : "#252320"}`, cursor: "pointer" }}>
                          <span className="dm" style={{ fontSize: 13, fontWeight: 500 }}>{ing.name}</span>
                          {(() => {
                            const standalone = (standaloneIngredients || []).find(i => i.name.toLowerCase() === ing.name.toLowerCase());
                            const brand = standalone?.brand;
                            return brand
                              ? <span className="dm" style={{ fontSize: 11, color: "#888", padding: "2px 8px", borderRadius: 100, background: "#1e1c18" }}>{brand}</span>
                              : <span className="dm" style={{ fontSize: 11, color: sc.accent, background: sc.light, padding: "2px 8px", borderRadius: 100 }}>{ing.store}</span>;
                          })()}
                        </div>
                        {isSelected && (
                          <div style={{ padding: "10px 12px", background: "#0c0c0a", borderRadius: 10, marginBottom: 8, border: "1.5px solid #c8a96e" }}>
                            <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Total qty for whole meal</div>
                            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                              <input type="number" value={snackQty} onChange={e => setSnackQty(parseFloat(e.target.value) || 1)}
                                style={{ width: 70 }} min="0.1" step="0.5" />
                              <select value={snackUnit} onChange={e => setSnackUnit(e.target.value)} style={{ flex: 1 }}>
                                <option value="whole">whole</option>
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                                <option value="ml">ml</option>
                                <option value="L">L</option>
                                <option value="cups">cups</option>
                                <option value="tbsp">tbsp</option>
                                <option value="tsp">tsp</option>
                                <option value="cans">cans</option>
                                <option value="scoops">scoops</option>
                                <option value="slices">slices</option>
                                <option value="packets">packets</option>
                              </select>
                            </div>
                            <button className="btn" onClick={() => {
                              const snackId = `snack-ing-${ing.name.toLowerCase().replace(/\s+/g, "-")}`;
                              const snackRecipeObj = { id: snackId, name: ing.name, types: ["Snack"], serves: 1, ingredients: [{ name: ing.name, qty: snackQty, unit: snackUnit, store: ing.store, category: ing.category || guessCategory(ing.name) }] };
                              setRecipes(prev => {
                                const exists = prev.find(r => r.id === snackId);
                                if (exists) return prev.map(r => r.id === snackId ? snackRecipeObj : r);
                                return [...prev, snackRecipeObj];
                              });
                              setWeek(prev => {
                                const existing = prev[snackPickerFor.day]?.[snackKey]?.snacks || [];
                                return {
                                  ...prev,
                                  [snackPickerFor.day]: {
                                    ...prev[snackPickerFor.day],
                                    [snackKey]: { snacks: [...existing, { mealId: snackId, qty: snackQty, unit: snackUnit }] }
                                  }
                                };
                              });
                              setSelectedSnackIng(null);
                              setSnackPickerFor(null);
                            }} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "10px 16px", width: "100%" }}>
                              Add Snack
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="dm" style={{ textAlign: "center", padding: 24, color: "#444", fontSize: 13 }}>No ingredients found</div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  )}
{/* ── Sides Picker Modal ── */}
  {sidesPickerFor && (
    <div className="overlay" onClick={() => { setSidesPickerFor(null); setSelectedSnackIng(null); }}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>+ Add Side</h2>
          <button onClick={() => { setSidesPickerFor(null); setSelectedSnackIng(null); }} style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer" }}>×</button>
        </div>
        <input value={sidesSearch} onChange={e => setSidesSearch(e.target.value)} placeholder="Search ingredients or recipes..." style={{ width: "100%", marginBottom: 14 }} autoFocus />
        {(() => {
          const allIngredients = [];
          recipes.forEach(r => r.ingredients.forEach(i => {
            if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
              allIngredients.push({ type: "ingredient", name: i.name, store: i.store, category: i.category || guessCategory(i.name) });
            }
          }));
          (standaloneIngredients || []).forEach(i => {
            if (!allIngredients.find(x => x.name.toLowerCase() === i.name.toLowerCase())) {
              allIngredients.push({ type: "ingredient", name: i.name, store: i.store, category: i.category || guessCategory(i.name) });
            }
          });
          const allRecipes = recipes.filter(r => !r.id?.toString().startsWith("snack-ing-"));
          const filteredIngs = sidesSearch.trim().length > 0 ? allIngredients.filter(i => i.name.toLowerCase().includes(sidesSearch.toLowerCase())) : allIngredients;
          const filteredRecipes = sidesSearch.trim().length > 0 ? allRecipes.filter(r => r.name.toLowerCase().includes(sidesSearch.toLowerCase())) : allRecipes;
          return (
            <>
              {filteredRecipes.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>📖 Recipes</div>
                  {filteredRecipes.map(r => (
                    <div key={r.id}>
                      <div onClick={() => { setSelectedSnackIng({ type: "recipe", id: r.id, name: r.name }); setSnackQty(1); }}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, marginBottom: 4, background: selectedSnackIng?.id === r.id ? "#c8a96e1a" : "#0c0c0a", border: `1.5px solid ${selectedSnackIng?.id === r.id ? "#c8a96e" : "#252320"}`, cursor: "pointer" }}>
                        <span className="dm" style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                        <span className="dm" style={{ fontSize: 11, color: "#555" }}>serves {r.serves}</span>
                      </div>
                      {selectedSnackIng?.id === r.id && (
                        <div style={{ padding: "10px 12px", background: "#0c0c0a", borderRadius: 10, marginBottom: 8, border: "1.5px solid #c8a96e" }}>
                          <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>
                            Will be added for all attending members.
                          </div>
                          <button className="btn" onClick={() => {
                            const attending = week[sidesPickerFor.day]?.[sidesPickerFor.mealType]?.attending?.length || 1;
                            setWeek(prev => ({
                              ...prev,
                              [sidesPickerFor.day]: {
                                ...prev[sidesPickerFor.day],
                                [sidesPickerFor.mealType]: {
                                  ...prev[sidesPickerFor.day][sidesPickerFor.mealType],
                                  sides: [...(prev[sidesPickerFor.day][sidesPickerFor.mealType].sides || []), { type: "recipe", id: r.id, name: r.name, qty: attending, unit: "serves" }]
                                }
                              }
                            }));
                            setSidesPickerFor(null); setSelectedSnackIng(null);
                          }} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "10px 16px", width: "100%" }}>
                            Add {r.name} for all
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {CATEGORIES.filter(cat => filteredIngs.some(i => i.category === cat)).map(cat => (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 6 }}>{CATEGORY_ICONS[cat]} {cat}</div>
                  {filteredIngs.filter(i => i.category === cat).sort((a,b) => a.name.localeCompare(b.name)).map(ing => {
                    const sc = STORE_COLORS[ing.store] || STORE_COLORS.Woolworths;
                    return (
                      <div key={ing.name}>
                        <div onClick={() => { setSelectedSnackIng({ type: "ingredient", name: ing.name }); setSnackQty(100); setSnackUnit("g"); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, marginBottom: 4, background: selectedSnackIng?.name === ing.name && selectedSnackIng?.type === "ingredient" ? "#c8a96e1a" : "#0c0c0a", border: `1.5px solid ${selectedSnackIng?.name === ing.name && selectedSnackIng?.type === "ingredient" ? "#c8a96e" : "#252320"}`, cursor: "pointer" }}>
                          <span className="dm" style={{ fontSize: 13, fontWeight: 500 }}>{ing.name}</span>
                          <span className="dm" style={{ fontSize: 11, color: sc.accent, background: sc.light, padding: "2px 8px", borderRadius: 100 }}>{ing.store}</span>
                        </div>
                        {selectedSnackIng?.name === ing.name && selectedSnackIng?.type === "ingredient" && (
                          <div style={{ padding: "10px 12px", background: "#0c0c0a", borderRadius: 10, marginBottom: 8, border: "1.5px solid #c8a96e" }}>
                            <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Total qty for whole meal</div>
                            {(() => {
                              const attending = week[sidesPickerFor.day]?.[sidesPickerFor.mealType]?.attending?.length || 1;
                              const perPerson = snackQty > 0 ? parseFloat((snackQty / attending).toFixed(1)) : 0;
                              return (
                                <div className="dm" style={{ fontSize: 11, color: "#5c9fe0", marginBottom: 8 }}>
                                  = {perPerson} {snackUnit} per person ({attending} attending)
                                </div>
                              );
                            })()}
                            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                              <input type="number" value={snackQty} onChange={e => setSnackQty(parseFloat(e.target.value) || 0)} style={{ width: 80 }} min="0" />
                              <select value={snackUnit} onChange={e => setSnackUnit(e.target.value)} style={{ flex: 1 }}>
                                <option value="g">g</option>
                                <option value="kg">kg</option>
                                <option value="ml">ml</option>
                                <option value="L">L</option>
                                <option value="cups">cups</option>
                                <option value="tbsp">tbsp</option>
                                <option value="tsp">tsp</option>
                                <option value="whole">whole</option>
                                <option value="slices">slices</option>
                              </select>
                            </div>
                            <button className="btn" onClick={() => {
                              setWeek(prev => ({
                                ...prev,
                                [sidesPickerFor.day]: {
                                  ...prev[sidesPickerFor.day],
                                  [sidesPickerFor.mealType]: {
                                    ...prev[sidesPickerFor.day][sidesPickerFor.mealType],
                                    sides: [...(prev[sidesPickerFor.day][sidesPickerFor.mealType].sides || []), { type: "ingredient", name: ing.name, qty: snackQty, unit: snackUnit }]
                                  }
                                }
                              }));
                              setSidesPickerFor(null); setSelectedSnackIng(null);
                            }} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "10px 16px", width: "100%" }}>
                              Add Side
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              {filteredIngs.length === 0 && filteredRecipes.length === 0 && (
                <div className="dm" style={{ textAlign: "center", padding: 24, color: "#444", fontSize: 13 }}>No results found</div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  )}

  {/* ── Add Goal Modal ── */}
  {newGoalMember && (
    <div className="overlay" onClick={() => { setNewGoalMember(null); setNewGoalText(""); }}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>New goal for {newGoalMember}</h2>
          <button onClick={() => { setNewGoalMember(null); setNewGoalText(""); }}
            style={{ background: "#252320", border: "none", color: "#888", borderRadius: 100, width: 28, height: 28, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div className="dm" style={{ fontSize: 11, color: "#555", marginBottom: 10 }}>
          {(goals[newGoalMember] || []).length}/{MAX_GOALS} goals set
        </div>
        <input
          value={newGoalText}
          onChange={e => setNewGoalText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addGoal(newGoalMember)}
          placeholder="e.g. Go to the gym, Read 20 pages..."
          style={{ width: "100%", marginBottom: 14 }}
          autoFocus
        />
        <div style={{ marginBottom: 14 }}>
          <div className="dm" style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8 }}>Target frequency</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[1,2,3,4,5,6,7].map(n => (
              <button key={n} className="btn" onClick={() => setNewGoalFrequency(n)}
                style={{ flex: 1, padding: "8px 4px", background: newGoalFrequency === n ? MEMBER_COLORS[newGoalMember] : "#1e1c18", color: newGoalFrequency === n ? "#0c0c0a" : "#555" }}>
                {n}
              </button>
            ))}
          </div>
          <div className="dm" style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{newGoalFrequency}x per week</div>
        </div>
        <button className="btn" onClick={() => addGoal(newGoalMember)}
          style={{ background: MEMBER_COLORS[newGoalMember], color: "#0c0c0a", padding: "13px 20px", width: "100%" }}>
          Add Goal
        </button>
      </div>
    </div>
  )}
</div>
);
}
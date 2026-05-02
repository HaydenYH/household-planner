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
async set(key, value) {
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
try {
await fetch(`${SUPABASE_URL}/rest/v1/household_data`, {
method: "POST",
headers: {
apikey: SUPABASE_ANON_KEY,
Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
"Content-Type": "application/json",
Prefer: "resolution=merge-duplicates",
},
body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
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
callback(data.payload.data.record.value);
}
} catch (_) {}
};
ws.onerror = (err) => console.warn("WebSocket error:", err);
return () => { try { ws.close(); } catch (_) {} };
} catch (err) {
console.warn("WebSocket subscription failed:", err);
return () => {};
}
},
};

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
};

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
    { name: "Light Greek Yoghurt", qty: 240, unit: "g", store: "Aldi" },
    { name: "Rolled Oats", qty: 75, unit: "g", store: "Woolworths" },
    { name: "Black Chia Seeds", qty: 30, unit: "g", store: "Costco" },
    { name: "Chocolate Protein Powder", qty: 3, unit: "scoops", store: "Costco" },
    { name: "Almond Milk", qty: 300, unit: "ml", store: "Aldi" },
    { name: "Banana", qty: 1.5, unit: "whole", store: "Woolworths" },
    { name: "Frozen Blueberries", qty: 90, unit: "g", store: "Aldi" },
  ]},
  { id: 2, name: "Pesto Pasta", types: ["Lunch", "Dinner"], serves: 3, ingredients: [
    { name: "Brown Onion", qty: 0.5, unit: "whole", store: "Woolworths" },
    { name: "Green Pesto", qty: 0.5, unit: "jar", store: "Woolworths" },
    { name: "Light Thickened Cream", qty: 150, unit: "ml", store: "Woolworths" },
    { name: "Bacon", qty: 150, unit: "g", store: "Costco" },
    { name: "Broccolini", qty: 1, unit: "whole", store: "Woolworths" },
    { name: "High Protein Pasta", qty: 0.5, unit: "packet", store: "Woolworths" },
    { name: "Chicken Breast", qty: 500, unit: "g", store: "Woolworths" },
  ]},
  { id: 3, name: "Green Curry", types: ["Lunch", "Dinner"], serves: 3, ingredients: [
    { name: "Green Curry Paste", qty: 0.5, unit: "jar", store: "Woolworths" },
    { name: "Brown Sugar", qty: 0.5, unit: "tbsp", store: "Aldi" },
    { name: "Green Beans", qty: 150, unit: "g", store: "Woolworths" },
    { name: "Low Carb Potato", qty: 188, unit: "g", store: "Woolworths" },
    { name: "Chicken Breast", qty: 500, unit: "g", store: "Woolworths" },
    { name: "Coconut Milk", qty: 1, unit: "cans", store: "Woolworths" },
  ]},
  { id: 4, name: "Chicken Taco Bowls", types: ["Lunch"], serves: 3, ingredients: [
    { name: "Lebanese Cucumber", qty: 1.33, unit: "whole", store: "Woolworths" },
    { name: "Chicken Breast", qty: 533, unit: "g", store: "Costco" },
    { name: "Rice", qty: 300, unit: "g", store: "Woolworths" },
    { name: "Black Beans", qty: 150, unit: "g", store: "Aldi" },
    { name: "Corn", qty: 167, unit: "g", store: "Aldi" },
    { name: "Light Greek Yoghurt", qty: 100, unit: "g", store: "Aldi" },
    { name: "Cherry Tomatoes", qty: 167, unit: "g", store: "Woolworths" },
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
DAYS.forEach(d => { w[d] = {}; MEAL_TYPES.forEach(m => { w[d][m] = { attending: [...MEMBERS], mealId: null, leftovers: false }; }); });
return w;
}

function getWeekStart() {
const now = new Date();
const diff = now.getDay() === 0 ? -6 : 1 - now.getDay();
const mon = new Date(now);
mon.setDate(now.getDate() + diff);
return mon;
}

function getWeekKey(startDate) {
return `week-${startDate.toISOString().slice(0, 10)}`;
}

function addDays(date, days) {
const next = new Date(date);
next.setDate(next.getDate() + days);
return next;
}

// ── useSharedState hook ───────────────────────────────────────────────────────
function useSharedState(key, defaultValue) {
const [state, setState] = useState(defaultValue);
const [synced, setSynced] = useState(false);
const localRef = useRef(false);
const saveTimer = useRef(null);

useEffect(() => {
setState(defaultValue);
sb.get(key).then(val => {
setState(val !== null ? val : defaultValue);
setSynced(true);
}).catch(() => setSynced(true));
}, [key]);

useEffect(() => {
const unsub = sb.subscribe(key, (val) => {
if (!localRef.current) setState(val);
});
return unsub;
}, [key]);

const setAndSave = useCallback((updater) => {
setState(prev => {
const next = typeof updater === "function" ? updater(prev) : updater;
localRef.current = true;
clearTimeout(saveTimer.current);
saveTimer.current = setTimeout(() => {
sb.set(key, next).finally(() => { localRef.current = false; });
}, 400);
return next;
});
}, [key]);

return [state, setAndSave, synced];
}

// ── Ingredient editor (shared by add + edit modals) ───────────────────────────
function IngredientAutocomplete({ value, onChange, onSelectFull, recipes }) {
  const [open, setOpen] = useState(false);
  const allIngredients = useMemo(() => {
    const seen = new Map();
    (recipes || []).forEach(r => r.ingredients.forEach(i => {
      if (i.name.trim() && !seen.has(i.name.toLowerCase())) {
        seen.set(i.name.toLowerCase(), { name: i.name, store: i.store, unit: i.unit });
      }
    }));
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes]);

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
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: ing.unit === "custom" ? 8 : 0 }}>
        <IngredientAutocomplete
  value={ing.name}
  onChange={val => updateIng(idx, "name", val)}
  onSelectFull={item => {
    const a = [...draft.ingredients];
    a[idx] = { ...a[idx], name: item.name, store: item.store || a[idx].store };
    setDraft(p => ({ ...p, ingredients: a }));
  }}
  recipes={recipes}
/>
        <input type="number" value={ing.qty} onChange={e => updateIng(idx, "qty", parseFloat(e.target.value) || 0)} placeholder="Qty" style={{ width: 60 }} />
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
      {ing.unit === "custom" && (
        <input value={ing.customUnit || ""} onChange={e => updateIng(idx, "customUnit", e.target.value)} placeholder="Custom unit" style={{ width: "100%" }} />
      )}
    </div>
  ))}
  <button className="btn" onClick={() => setDraft(p => ({ ...p, ingredients: [...p.ingredients, { name: "", qty: 0, unit: "", store: "Woolworths", customUnit: "" }] }))}
    style={{ background: "#1e1c18", color: "#888", padding: "8px 16px", width: "100%", marginBottom: 14 }}>
    + Add ingredient
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
const [view, setView] = useState("week");
const [selectedDay, setSelectedDay] = useState(0);
const [weekStart, setWeekStart] = useState(getWeekStart());
const defaultWeek = useMemo(() => buildEmptyWeek(), []);

const [recipes, setRecipes, recipesReady] = useSharedState("recipes", DEFAULT_RECIPES);
const [week, setWeek, weekReady] = useSharedState(getWeekKey(weekStart), defaultWeek);
const [shoppingList, setShoppingList, shopReady] = useSharedState("shopping", []);
const [goals, setGoals, goalsReady] = useSharedState("goals", buildEmptyGoals());

const [pickerFor, setPickerFor] = useState(null);
const [pickerLeftovers, setPickerLeftovers] = useState(false);
const [showAddRecipe, setShowAddRecipe] = useState(false);
const [editingRecipe, setEditingRecipe] = useState(null); // recipe object
const [showAddShoppingItem, setShowAddShoppingItem] = useState(false);
const [newShoppingItem, setNewShoppingItem] = useState({ name: "", qty: "", unit: "", store: "Woolworths" });
const [compactShopping, setCompactShopping] = useState(false);
const [newGoalMember, setNewGoalMember] = useState(null);
const [newGoalText, setNewGoalText] = useState("");

const loaded = recipesReady && weekReady && shopReady && goalsReady;

// ── Meal actions ──────────────────────────────────────────────────────────
function toggleAttending(day, mealType, member) {
setWeek(prev => {
const cur = prev[day][mealType].attending;
return { ...prev, [day]: { ...prev[day], [mealType]: { ...prev[day][mealType], attending: cur.includes(member) ? cur.filter(m => m !== member) : [...cur, member] } } };
});
}

function setMeal(day, mealType, recipeId, leftovers = false) {
setWeek(prev => {
  const newWeek = { ...prev, [day]: { ...prev[day], [mealType]: { ...prev[day][mealType], mealId: recipeId, leftovers } } };
  if (leftovers && mealType !== "Lunch") {
    // Auto-assign leftovers to next day's lunch
    const dayIndex = DAYS.indexOf(day);
    const nextDay = DAYS[(dayIndex + 1) % 7];
    newWeek[nextDay] = { ...newWeek[nextDay], Lunch: { ...newWeek[nextDay].Lunch, mealId: recipeId, leftovers: true } };
  }
  return newWeek;
});
setPickerFor(null);
}

function changeWeek(offset) {
setWeekStart(prev => addDays(prev, offset));
setSelectedDay(0);
}

function toggleCheck(itemId) {
setShoppingList(prev => Array.isArray(prev) ? prev.map(item => item.id === itemId ? { ...item, checked: !item.checked } : item) : []);
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

function generateShoppingList() {
  const consolidated = {};

  DAYS.forEach(day => {
    MEAL_TYPES.forEach(mealType => {
      const slot = week[day]?.[mealType];
      if (!slot?.mealId || !slot.attending?.length) return;
      const recipe = recipes.find(r => r.id === slot.mealId);
      if (!recipe) return;
      if (slot.leftovers) return;
      const serves = recipe.serves || 1;

      let totalAttendees = slot.attending.length;
      DAYS.forEach(d => {
        MEAL_TYPES.forEach(mt => {
          const s = week[d]?.[mt];
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
        consolidated[key].quantities.push({ qty: ing.qty * scale, unit: ing.unit || "" });
      });
    });
  });

  setShoppingList(Object.values(consolidated));
  setView("shopping");
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
  setRecipes(prev => prev.map(r => r.id === draft.id ? { ...draft, types: draft.types || ["Dinner"], serves: draft.serves || 4, ingredients: processedIngredients } : r));
  setEditingRecipe(null);
}

// ── Goal actions ──────────────────────────────────────────────────────────
function addGoal(member) {
if (!newGoalText.trim()) return;
const memberGoals = goals[member] || [];
if (memberGoals.length >= MAX_GOALS) return;
const checks = {};
DAYS.forEach(d => { checks[d] = false; });
setGoals(prev => ({ ...prev, [member]: [...(prev[member] || []), { id: Date.now(), text: newGoalText.trim(), checks }] }));
setNewGoalText("");
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
const safeShoppingList = Array.isArray(shoppingList) ? shoppingList : [];

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
<style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500;600&display=swap'); *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;} ::-webkit-scrollbar{display:none;} body{background:#0c0c0a;} .dm{font-family:'DM Sans',sans-serif;} .btn{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;border:none;border-radius:100px;cursor:pointer;transition:all .15s;} .card{background:#161512;border-radius:18px;border:1px solid #252320;transition:border-color .2s;} .card:hover{border-color:#353230;} .chip{font-family:'DM Sans',sans-serif;font-size:11px;font-weight:500;padding:4px 11px;border-radius:100px;cursor:pointer;transition:all .15s;border:1.5px solid transparent;} .chip.on{background:#c8a96e;color:#0c0c0a;border-color:#c8a96e;} .chip.off{background:transparent;color:#555;border-color:#2a2824;} .meal-pill{font-family:'DM Sans',sans-serif;font-size:12px;background:#1e1c18;color:#c8a96e;border:1px solid #c8a96e33;border-radius:100px;padding:4px 12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;} .nav-btn{font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;background:none;border:none;cursor:pointer;padding:6px 8px;border-radius:100px;transition:all .15s;display:flex;flex-direction:column;align-items:center;gap:3px;} .nav-btn.active{background:#c8a96e1a;color:#c8a96e;} .nav-btn.inactive{color:#444;} .overlay{position:fixed;inset:0;background:#0c0c0aee;z-index:200;display:flex;align-items:flex-end;} .sheet{background:#161512;border-radius:24px 24px 0 0;width:100%;max-height:85vh;overflow-y:auto;padding:24px;border-top:1px solid #252320;} input,select{background:#0c0c0a;border:1.5px solid #252320;border-radius:10px;color:#ede8d8;padding:9px 13px;font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .15s;-webkit-appearance:none;} input:focus,select:focus{border-color:#c8a96e55;} select option{background:#161512;} .day-tab{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;padding:6px 14px;border-radius:100px;border:none;cursor:pointer;transition:all .15s;} .day-tab.active{background:#c8a96e;color:#0c0c0a;} .day-tab.inactive{background:#1a1814;color:#666;} .fadeIn{animation:fadeIn .2s ease;} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} .pulse{animation:pulse 1.5s infinite;} @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}} .check-box{width:22px;height:22px;border-radius:7px;flex-shrink:0;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;} .goal-day-btn{font-family:'DM Sans',sans-serif;font-size:9px;font-weight:700;width:30px;height:30px;border-radius:8px;border:none;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;}`}</style>


  {/* ── Setup Banner ── */}
  {notConfigured && (
    <div style={{ background: "#2a1a0a", border: "1px solid #c8a96e55", borderRadius: 12, margin: "12px 14px 0", padding: "12px 14px" }}>
      <div className="dm" style={{ fontSize: 12, color: "#c8a96e", fontWeight: 600, marginBottom: 4 }}>⚙️ Supabase not configured</div>
      <div className="dm" style={{ fontSize: 11, color: "#888", lineHeight: 1.5 }}>Replace SUPABASE_URL and SUPABASE_ANON_KEY at the top of the file to enable real-time sync.</div>
    </div>
  )}

  {/* ── Header ── */}
  <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid #1a1814" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div className="dm" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#555", marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
          {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "long" })} — Household
          {!loaded && <span className="dm pulse" style={{ fontSize: 9, color: "#c8a96e" }}>syncing...</span>}
          {loaded && !notConfigured && <span className="dm" style={{ fontSize: 9, color: "#4caf50" }}>● live</span>}
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>
          {view === "week" ? "Weekly Planner" : view === "day" ? FULL_DAYS[selectedDay] : view === "recipes" ? "Recipe Book" : view === "shopping" ? "Shopping List" : "Weekly Goals"}
        </h1>
        {view === "week" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={() => changeWeek(-7)} style={{ padding: "8px 12px", background: "#1e1c18", color: "#c8a96e" }}>←</button>
            <span className="dm" style={{ fontSize: 12, color: "#aaa" }}>Week of {weekStart.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
            <button className="btn" onClick={() => changeWeek(7)} style={{ padding: "8px 12px", background: "#1e1c18", color: "#c8a96e" }}>→</button>
          </div>
        )}
      </div>
      {(view === "week" || view === "day") && mealsPlanned > 0 && (
        <button className="btn" onClick={generateShoppingList} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "9px 15px" }}>🛒 Shop</button>
      )}
    </div>
    {view === "day" && (
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 14, paddingBottom: 2 }}>
        {DAYS.map((d, i) => (
          <button key={d} className={`day-tab ${selectedDay === i ? "active" : "inactive"}`} onClick={() => setSelectedDay(i)}>
            <div>{d}</div>
            <div style={{ fontSize: 10, opacity: .7 }}>{weekStart.getDate() + i}</div>
          </button>
        ))}
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
                <span className="dm" style={{ fontSize: 12, color: "#555", marginLeft: 8 }}>{weekStart.getDate() + di} {weekStart.toLocaleDateString("en-AU", { month: "short" })}</span>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>{MEAL_ICONS[mt]}</span>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{mt}</span>
                {recipe && (
                  <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
                    {MEMBERS.map(m => (
                      <span key={m} className="dm" style={{ width: 20, height: 20, borderRadius: "50%", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", background: attending.includes(m) ? MEMBER_COLORS[m] : "#1e1c18", color: attending.includes(m) ? "#0c0c0a" : "#444", border: `1px solid ${attending.includes(m) ? MEMBER_COLORS[m] : "#2a2824"}`, transition: "all .15s" }}>{MEMBER_INITIALS[m]}</span>
                    ))}
                  </div>
                )}
              </div>
              <button className="meal-pill" onClick={() => { setPickerFor({ day: DAYS[selectedDay], mealType: mt }); setPickerLeftovers(week[DAYS[selectedDay]][mt].leftovers || false); }}>
                {recipe ? recipe.name : "+ Add meal"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MEMBERS.map(member => (
                <button key={member} className={`chip ${attending.includes(member) ? "on" : "off"}`}
                  style={attending.includes(member) ? { background: MEMBER_COLORS[member], borderColor: MEMBER_COLORS[member] } : {}}
                  onClick={() => toggleAttending(DAYS[selectedDay], mt, member)}>
                  {member}
                </button>
              ))}
            </div>
            {recipe && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #1e1c18" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {recipe.ingredients.slice(0, 4).map((ing, idx) => {
                    const sc = STORE_COLORS[ing.store] || STORE_COLORS.Woolworths;
                    return <span key={idx} className="dm" style={{ fontSize: 10, background: sc.light, color: sc.accent, border: `1px solid ${sc.accent}33`, borderRadius: 100, padding: "2px 8px" }}>{ing.name}</span>;
                  })}
                  {recipe.ingredients.length > 4 && <span className="dm" style={{ fontSize: 10, color: "#555", padding: "2px 4px" }}>+{recipe.ingredients.length - 4} more</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  )}

  {/* ── Recipes View ── */}
{view === "recipes" && (
  <div style={{ padding: "14px" }} className="fadeIn">
    <button className="btn" onClick={() => setShowAddRecipe(true)}
      style={{ background: "#c8a96e", color: "#0c0c0a", padding: "11px 20px", width: "100%", marginBottom: 14 }}>
      + New Recipe
    </button>
    {MEAL_TYPES.map(mt => {
      const filtered = recipes.filter(r => (r.types || [r.type]).includes(mt));
      if (!filtered.length) return null;
      return (
        <div key={mt} style={{ marginBottom: 20 }}>
          <div className="dm" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#555", marginBottom: 8 }}>
            {MEAL_ICONS[mt]} {mt}
          </div>
          {filtered.map(r => (
            <div className="card" key={r.id} style={{ marginBottom: 8, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{r.name}</span>
                  <span className="dm" style={{ fontSize: 11, color: "#555", marginLeft: 8 }}>serves {r.serves || "?"}</span>
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    {(r.types || [r.type]).map(t => (
                      <span key={t} className="dm" style={{ fontSize: 9, background: "#1e1c18", color: "#c8a96e", border: "1px solid #c8a96e33", borderRadius: 100, padding: "2px 7px" }}>{t}</span>
                    ))}
                  </div>
                </div>
                <button className="btn" onClick={() => setEditingRecipe({ ...r, types: r.types || [r.type], ingredients: processIngredientsForEdit(r.ingredients.map(i => ({ ...i, qty: i.qty || 0, unit: i.unit || "", customUnit: "" }))) })}
                  style={{ background: "#1e2a3a", color: "#5c9fe0", padding: "5px 11px", fontSize: 10 }}>
                  Edit
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {r.ingredients.map((ing, idx) => {
                  const sc = STORE_COLORS[ing.store] || STORE_COLORS.Woolworths;
                  return <span key={idx} className="dm" style={{ fontSize: 10, background: sc.light, color: sc.accent, border: `1px solid ${sc.accent}33`, borderRadius: 100, padding: "2px 8px" }}>{ing.name} · {ing.qty}{ing.unit ? ` ${ing.unit}` : ""}</span>;
                })}
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8 }}>
      <button className="btn" onClick={() => setShowAddShoppingItem(true)} style={{ background: "#c8a96e", color: "#0c0c0a", padding: "9px 15px" }}>+ Custom item</button>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn" onClick={() => setCompactShopping(p => !p)}
          style={{ background: compactShopping ? "#c8a96e22" : "#1e1c18", color: compactShopping ? "#c8a96e" : "#888", padding: "7px 12px", border: `1px solid ${compactShopping ? "#c8a96e55" : "transparent"}` }}>
          {compactShopping ? "⊞ Full" : "⊟ Compact"}
        </button>
        <div className="dm" style={{ fontSize: 11, color: "#555" }}>{safeShoppingList.filter(i => !i.checked).length} of {safeShoppingList.length} remaining</div>
        {safeShoppingList.some(i => i.checked) && (
          <button className="btn" onClick={() => setShoppingList(prev => Array.isArray(prev) ? prev.map(i => ({ ...i, checked: false })) : [])}
            style={{ background: "#1e1c18", color: "#888", padding: "5px 12px", fontSize: 10 }}>
            Uncheck all
          </button>
        )}
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
          const remaining = items.filter(i => !i.checked).length;
          return (
            <div key={store} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: sc.bg, borderRadius: 12, padding: "10px 14px", marginBottom: 6, border: `1px solid ${sc.accent}33` }}>
                <span className="dm" style={{ fontWeight: 700, fontSize: 13, color: sc.accent, flex: 1 }}>{store}</span>
                <span className="dm" style={{ fontSize: 11, color: sc.accent, opacity: .6 }}>{remaining === 0 ? "✓ done" : `${remaining} left`}</span>
              </div>
              <div style={{ background: "#161512", borderRadius: 12, border: "1px solid #252320", overflow: "hidden" }}>
                {items.map((item, idx) => {
                  // Calculate how much to buy after pantry
                  const totals = getQuantitySummary(item.quantities);
                  const pantryQty = parseFloat(item.pantryQty) || 0;
                  const pantryUnit = item.pantryUnit || (item.quantities?.[0]?.unit || "");
                  const toBuy = Array.isArray(totals) ? totals.filter(t => t && typeof t.qty === 'number' && t.unit).map(t => {
                    let left = t.qty;
                    if (pantryUnit && pantryUnit === t.unit && !isNaN(pantryQty) && pantryQty > 0) {
                      left = Math.max(t.qty - pantryQty, 0);
                    }
                    return { qty: parseFloat(left.toFixed(2)), unit: t.unit };
                  }).filter(t => t.qty > 0) : [];
                  const toBuyText = toBuy.length > 0 ? toBuy.map(t => `${t.qty} ${t.unit}`).join(", ") : consolidateQuantities(item.quantities);

                  return (
                    <div key={item.id} style={{ borderBottom: idx < items.length - 1 ? "1px solid #1a1814" : "none" }}>
                      {/* ── Main row — always visible ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", cursor: "pointer" }}
                        onClick={() => toggleCheck(item.id)}>
                        <div className="check-box" style={{ border: `2px solid ${item.checked ? sc.accent : "#333"}`, background: item.checked ? sc.accent : "transparent", flexShrink: 0 }}>
                          {item.checked && <svg width="12" height="9" viewBox="0 0 12 9" fill="none"><path d="M1 4L4.5 7.5L11 1" stroke="#0c0c0a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div className="dm" style={{ flex: 1, fontSize: 14, fontWeight: 600, textDecoration: item.checked ? "line-through" : "none", opacity: item.checked ? 0.4 : 1 }}>{item.name}</div>
                        <div className="dm" style={{ fontSize: 18, fontWeight: 700, color: item.checked ? "#555" : "#c8a96e", textDecoration: item.checked ? "line-through" : "none" }}>{toBuyText}</div>
                        {!compactShopping && (
                          <button onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                            style={{ background: "none", border: "none", color: "#333", fontSize: 20, cursor: "pointer", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}>×</button>
                        )}
                      </div>

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
      {MEMBERS.map(member => {
        const memberGoals = goals[member] || [];
        const color = MEMBER_COLORS[member];
        const totalChecks = memberGoals.reduce((acc, g) => acc + Object.values(g.checks).filter(Boolean).length, 0);
        const maxChecks = memberGoals.length * 7;
        const pct = maxChecks > 0 ? Math.round((totalChecks / maxChecks) * 100) : 0;

        return (
          <div key={member} style={{ marginBottom: 20 }}>
            {/* Member header */}
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

            {/* Progress bar */}
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
                          <span className="dm" style={{ fontSize: 10, color: "#555", flexShrink: 0 }}>{doneCount}/7</span>
                        </div>
                        <button onClick={() => deleteGoal(member, goal.id)}
                          style={{ background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1, flexShrink: 0 }}>×</button>
                      </div>
                      {/* Day tick buttons */}
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
    </div>
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
      {week[pickerFor.day]?.[pickerFor.mealType]?.mealId && (
        <button className="btn" onClick={() => { setMeal(pickerFor.day, pickerFor.mealType, null); setPickerLeftovers(false); }}
          style={{ background: "#1e1c18", color: "#888", padding: "8px 16px", width: "100%", marginBottom: 10 }}>
          Remove meal
        </button>
      )}
      {recipes.filter(r => (r.types || [r.type]).includes(pickerFor.mealType)).map(r => {
        const active = week[pickerFor.day]?.[pickerFor.mealType]?.mealId === r.id;
        const currentLeftovers = active ? (pickerLeftovers) : false;
        const dayIndex = DAYS.indexOf(pickerFor.day);
        const nextDay = DAYS[(dayIndex + 1) % 7];
        const nextDayName = FULL_DAYS[(dayIndex + 1) % 7];
        return (
          <div key={r.id} style={{ padding: "13px 15px", borderRadius: 12, marginBottom: 7, background: active ? "#c8a96e1a" : "#0c0c0a", border: `1.5px solid ${active ? "#c8a96e" : "#252320"}` }}>
            <div onClick={() => setMeal(pickerFor.day, pickerFor.mealType, r.id, pickerLeftovers)} style={{ cursor: "pointer" }}>
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
  initial={{ name: "", types: ["Dinner"], serves: 4, ingredients: [{ name: "", qty: 0, unit: "", store: "Woolworths", customUnit: "" }] }}
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
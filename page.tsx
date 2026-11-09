"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "../lib/supabase";

type Ingredient = { id: string; label: string; icon: string; required: boolean };
type GameState = {
  started: boolean; finished: boolean; seconds: number; step: number;
  inventory: string[]; tasks: string[]; score: number; twist: string | null;
  dishSubmitted: boolean; chefLead: string; notes: string[];
};
type RoomRow = { code: string; host_name: string; guest_name: string | null; game_state: GameState; status: string };

const ingredients: Ingredient[] = [
  { id: "salmon", label: "Salmon fillet", icon: "🐟", required: true },
  { id: "arborio", label: "Arborio rice", icon: "🍚", required: true },
  { id: "saffron", label: "Saffron", icon: "🌼", required: true },
  { id: "stock", label: "Vegetable stock", icon: "🥣", required: true },
  { id: "shallot", label: "Shallots", icon: "🧅", required: true },
  { id: "asparagus", label: "Asparagus", icon: "🥬", required: true },
  { id: "butter", label: "Butter & lemon", icon: "🍋", required: true }
];

const recipeSteps = [
  { title: "Prepare the aromatics", detail: "Finely dice the shallots. Trim the asparagus and keep the tips intact.", station: "PREP STATION", role: "Sous chef can prep while the lead chef plans the risotto." },
  { title: "Build the saffron risotto", detail: "Toast Arborio rice with shallots. Add warm stock gradually, stirring until creamy. Bloom saffron in a spoonful of warm stock.", station: "SAUCE & RISOTTO", role: "Lead chef guides consistency; sous chef keeps stock warm." },
  { title: "Sear the salmon", detail: "Pat the salmon dry, season it, then sear skin-side down until crisp. Turn briefly to finish.", station: "HOT LINE", role: "Coordinate the salmon timing with the risotto finish." },
  { title: "Finish the accompaniments", detail: "Sauté asparagus until bright and tender-crisp. Whisk butter and lemon into a glossy beurre blanc-style sauce.", station: "FINISHING", role: "One player handles asparagus while the other finishes the sauce." },
  { title: "Plate like a finalist", detail: "Spoon saffron risotto, place salmon neatly, add asparagus and finish with lemon butter sauce.", station: "PASS / PLATING", role: "Agree on a composition before the final plate is submitted." }
];

const initialState: GameState = {
  started: false, finished: false, seconds: 420, step: 0,
  inventory: [], tasks: [], score: 0, twist: null, dishSubmitted: false,
  chefLead: "Lead Chef", notes: ["Welcome to the culinary arena. Invite your partner to join your room."]
};

function code() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
function fmt(n: number) { return `${Math.floor(n / 60).toString().padStart(2,"0")}:${(n % 60).toString().padStart(2,"0")}`; }

export default function Home() {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [role, setRole] = useState<"host" | "guest" | null>(null);
  const [state, setState] = useState<GameState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(false);
  const [toast, setToast] = useState("");
  const channelRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const supabase = useMemo(() => {
    try { return getSupabase(); } catch { return null; }
  }, []);

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get("room");
    if (inviteCode) setRoomCode(inviteCode.toUpperCase());
  }, []);

  useEffect(() => {
    if (!supabase || !room) return;
    const channel = supabase.channel(`room-${room.code}`, { config: { broadcast: { self: false }, presence: { key: name || "player" } } });
    channel
      .on("broadcast", { event: "game-state" }, ({ payload }) => {
        if (payload?.state) setState(payload.state as GameState);
        if (payload?.guestName && role === "host") setRoom(prev => prev ? { ...prev, guest_name: payload.guestName } : prev);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "kc_rooms", filter: `code=eq.${room.code}` }, (payload: any) => {
        const updated = payload.new as RoomRow;
        setRoom(updated);
        if (updated.game_state) setState(updated.game_state);
      })
      .on("presence", { event: "sync" }, () => {
        const count = Object.keys(channel.presenceState()).length;
        setOnline(count >= 2);
      })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name, role, joinedAt: new Date().toISOString() });
          setToast("Connected to your private kitchen.");
        }
      });
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [supabase, room?.code, name, role]);

  useEffect(() => {
    if (!state.started || state.finished || role !== "host") return;
    timerRef.current = setInterval(() => {
      setState(prev => {
        if (!prev.started || prev.finished || prev.seconds <= 0) return prev;
        const next = { ...prev, seconds: prev.seconds - 1 };
        if (next.seconds === 0) { next.finished = true; next.started = false; next.notes = ["Time is up. Submit or review your plate.", ...next.notes].slice(0,5); }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [state.started, state.finished, role]);

  useEffect(() => {
    if (!state.started || !role) return;
    const sync = setTimeout(() => broadcastState(state), 180);
    return () => clearTimeout(sync);
  }, [state, role]);

  function broadcastState(next: GameState) {
    if (channelRef.current) channelRef.current.send({ type: "broadcast", event: "game-state", payload: { state: next } });
  }

  async function createRoom() {
    if (!supabase) { setError("Connect Supabase first. Follow the SETUP.md instructions in the project download."); return; }
    if (!name.trim()) { setError("Enter your chef name first."); return; }
    setBusy(true); setError("");
    try {
      const newCode = code();
      const { data, error: dbError } = await supabase.from("kc_rooms").insert({
        code: newCode, host_name: name.trim(), guest_name: null, status: "waiting", game_state: initialState
      }).select().single();
      if (dbError) throw dbError;
      setRoom(data as RoomRow); setRoomCode(newCode); setRole("host");
      window.history.replaceState({}, "", `/?room=${newCode}`);
    } catch (e: any) { setError(e.message || "Could not create room."); }
    finally { setBusy(false); }
  }

  async function joinRoom() {
    if (!supabase) { setError("Connect Supabase first. Follow the SETUP.md instructions in the project download."); return; }
    if (!name.trim() || !roomCode.trim()) { setError("Enter your chef name and room code."); return; }
    setBusy(true); setError("");
    try {
      const { data, error: readError } = await supabase.from("kc_rooms").select("*").eq("code", roomCode.trim().toUpperCase()).single();
      if (readError) throw new Error("Room not found. Check the invitation code.");
      const row = data as RoomRow;
      if (row.guest_name && row.guest_name !== name.trim()) throw new Error("This room already has two players.");
      const { error: updateError } = await supabase.from("kc_rooms").update({ guest_name: name.trim(), status: "ready" }).eq("code", row.code);
      if (updateError) throw updateError;
      setRoom({ ...row, guest_name: name.trim() }); setRoomCode(row.code); setRole("guest"); setState(row.game_state || initialState);
      window.history.replaceState({}, "", `/?room=${row.code}`);
    } catch (e: any) { setError(e.message || "Could not join room."); }
    finally { setBusy(false); }
  }

  async function startRound() {
    if (role !== "host") { setToast("The room host starts the competition."); return; }
    const next = { ...initialState, started: true, notes: ["THE CHALLENGE IS LIVE. Work together and watch the clock."] };
    setState(next);
    await supabase?.from("kc_rooms").update({ status: "playing", game_state: next }).eq("code", room!.code);
    broadcastState(next);
  }

  function act(label: string, change: (s: GameState) => GameState) {
    setState(prev => {
      const next = change({ ...prev, inventory: [...prev.inventory], tasks: [...prev.tasks], notes: [...prev.notes] });
      next.notes = [`${name || "Chef"}: ${label}`, ...next.notes].slice(0,5);
      next.score = Math.min(100, next.tasks.length * 16 + (next.dishSubmitted ? 20 : 0));
      broadcastState(next);
      return next;
    });
  }

  function collect(id: string) {
    if (state.inventory.includes(id)) return;
    act(`collected ${ingredients.find(i=>i.id===id)?.label}`, s => ({ ...s, inventory: [...s.inventory, id] }));
  }
  function completeStep(index: number) {
    const step = recipeSteps[index];
    const needed = index === 0 ? ["shallot","asparagus"] : index === 1 ? ["arborio","stock","saffron","shallot"] : index === 2 ? ["salmon"] : index === 3 ? ["asparagus","butter"] : ingredients.map(i=>i.id);
    const missing = needed.filter(x => !state.inventory.includes(x));
    if (missing.length) { setToast("Collect the required ingredients first."); return; }
    act(`completed: ${step.title}`, s => ({ ...s, tasks: s.tasks.includes(step.title) ? s.tasks : [...s.tasks, step.title], step: Math.min(4, Math.max(s.step, index + 1)) }));
  }
  function surprise() {
    const twists = ["Mystery twist: the judges request a citrus note. Adapt your sauce!", "Kitchen twist: one station is temporarily unavailable. Re-plan your workflow!", "Mystery basket: add a fresh herb garnish to your final plate!"];
    const twist = twists[Math.floor(Math.random()*twists.length)];
    act("responded to a surprise challenge", s => ({ ...s, twist, score: s.score + 5 }));
  }
  async function submitDish() {
    const done = state.tasks.length;
    const score = Math.min(100, Math.round(done / 5 * 80 + (state.inventory.length / 7) * 20));
    const next = { ...state, finished: true, started: false, dishSubmitted: true, score, notes: [`Dish submitted. Judges awarded ${score}/100.`, ...state.notes].slice(0,5) };
    setState(next); broadcastState(next);
    await supabase?.from("kc_rooms").update({ status: "finished", game_state: next }).eq("code", room!.code);
  }
  async function copyInvite() {
    const url = `${window.location.origin}/?room=${room?.code || roomCode}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(()=>setCopied(false),1800); }
    catch { setToast(url); }
  }

  if (!room) return (
    <main className="shell">
      <header className="hero">
        <div className="eyebrow">A TWO-PLAYER CULINARY SHOWDOWN</div>
        <h1>KITCHEN <em>CLASH</em></h1>
        <p>Two chefs. One kitchen. A plate worth fighting for.</p>
        <div className="hero-art"><span>👩🏻‍🍳</span><b>×</b><span>👨🏽‍🍳</span><i>✦</i></div>
      </header>
      <section className="join-card">
        <div className="section-kicker">ENTER THE ARENA</div>
        <label>Your chef name</label>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Chef Pri" maxLength={18}/>
        <button className="button primary full" onClick={createRoom} disabled={busy}>＋ Create private kitchen</button>
        <div className="or"><span>OR JOIN YOUR PARTNER</span></div>
        <label>Invitation code</label>
        <input value={roomCode} onChange={e=>setRoomCode(e.target.value.toUpperCase())} placeholder="Enter 6-character code" maxLength={6}/>
        <button className="button secondary full" onClick={joinRoom} disabled={busy}>Join kitchen →</button>
        {error && <p className="error">{error}</p>}
        {!supabase && <p className="hint">Website setup required: add your Supabase project URL and anon key to enable online rooms.</p>}
        <div className="fineprint">Private two-player rooms · Browser-based · PC and mobile friendly</div>
      </section>
      <section className="feature-row">
        <div><b>01</b><span>Get your recipe</span></div><div><b>02</b><span>Divide the kitchen</span></div><div><b>03</b><span>Beat the clock</span></div>
      </section>
      <footer>THE CULINARY DUO CHAMPIONSHIP · DEMO BUILD 0.2</footer>
    </main>
  );

  const current = recipeSteps[Math.min(state.step,4)];
  const invite = `${typeof window !== "undefined" ? window.location.origin : ""}/?room=${room.code}`;
  return (
    <main className="game-shell">
      <header className="game-header">
        <div><div className="eyebrow">PRIVATE CULINARY ARENA</div><h1>KITCHEN <em>CLASH</em></h1></div>
        <div className="room-badge"><small>ROOM CODE</small><b>{room.code}</b></div>
      </header>
      <section className="match-banner">
        <div><span className="live-dot"/>{state.started ? "LIVE COMPETITION" : state.finished ? "ROUND COMPLETE" : "WAITING ROOM"}</div>
        <h2>The Royal Dinner Challenge</h2>
        <p>Pan-seared salmon · saffron risotto · asparagus · lemon butter sauce</p>
        <div className="timer">{fmt(state.seconds)}</div>
        <small>TIME REMAINING</small>
      </section>
      <section className="duo-grid">
        <div className="duo-card"><span className="avatar">👩🏻‍🍳</span><div><b>{room.host_name}</b><small>LEAD / SOUS CHEF</small></div><span className="online-tag">HOST</span></div>
        <div className="duo-card"><span className="avatar">👨🏽‍🍳</span><div><b>{room.guest_name || "Waiting for partner"}</b><small>{room.guest_name ? "READY TO COOK" : "INVITATION SENT?"}</small></div><span className={room.guest_name ? "online-tag" : "waiting-tag"}>{room.guest_name ? "JOINED" : "WAITING"}</span></div>
      </section>
      <section className="invite-panel">
        <div><b>Bring your partner into the kitchen</b><small>Send this private room link or share the code.</small></div>
        <div className="invite-actions"><button className="button primary" onClick={copyInvite}>{copied ? "Copied!" : "Copy invite link"}</button><button className="button secondary" onClick={copyInvite}>Code: {room.code}</button></div>
      </section>
      <div className="content-grid">
        <section className="main-column">
          <div className="panel kitchen-panel">
            <div className="panel-heading"><div><span className="section-kicker">YOUR SHARED WORKSPACE</span><h3>The competition kitchen</h3></div><span className="live-label">✦ LIVE STATIONS</span></div>
            <div className="kitchen-scene">
              <div className="station station-prep"><span>🔪</span><b>Prep station</b><small>Chop · trim · season</small></div>
              <div className="station station-hot"><span>🔥</span><b>Hot line</b><small>Sear · sauté · simmer</small></div>
              <div className="station station-sauce"><span>🥣</span><b>Sauce & risotto</b><small>Whisk · stir · reduce</small></div>
              <div className="station station-pass"><span>🍽️</span><b>Plating pass</b><small>Compose · garnish · submit</small></div>
              <div className="chef-fig">👩🏻‍🍳<small>{room.host_name}</small></div><div className="chef-fig second">👨🏽‍🍳<small>{room.guest_name || "Partner"}</small></div>
            </div>
            <div className="station-note">Move freely between stations. The room is shared, so both chefs see the same progress.</div>
          </div>
          <div className="panel">
            <div className="panel-heading"><div><span className="section-kicker">RECIPE BOOK</span><h3>Today's signature dish</h3></div><span className="difficulty">ADVANCED · 7 MIN</span></div>
            <div className="dish-card"><div className="dish-photo">🐟<span>✦</span></div><div><h4>Pan-seared salmon</h4><p>with saffron risotto, asparagus & lemon butter sauce</p></div></div>
            <div className="ingredients"><b>Ingredient checklist</b><div className="ingredient-grid">{ingredients.map(i=><button key={i.id} className={`ingredient ${state.inventory.includes(i.id)?"collected":""}`} onClick={()=>collect(i.id)} disabled={!state.started || state.finished}><span>{i.icon}</span><span>{i.label}</span><small>{state.inventory.includes(i.id)?"✓ COLLECTED":"＋ COLLECT"}</small></button>)}</div></div>
            <div className="steps-heading"><b>Preparation method</b><small>{state.tasks.length}/5 steps completed</small></div>
            <div className="recipe-steps">{recipeSteps.map((s,i)=><div className={`recipe-step ${state.tasks.includes(s.title)?"done":""}`} key={s.title}><div className="step-number">{state.tasks.includes(s.title)?"✓":i+1}</div><div className="step-copy"><b>{s.title}</b><p>{s.detail}</p><small>{s.station} · {s.role}</small></div><button onClick={()=>completeStep(i)} disabled={!state.started || state.finished || state.tasks.includes(s.title)}>Complete</button></div>)}</div>
          </div>
        </section>
        <aside className="side-column">
          <div className="panel role-panel"><span className="section-kicker">TEAM STRATEGY</span><h3>Choose your role</h3><p>Guide the recipe or take charge of the stations. Switch whenever you need.</p><div className="role-choice"><button className="role-option selected"><b>♛ Lead Chef</b><small>Guide · Plan · Plate</small></button><button className="role-option"><b>✦ Sous Chef</b><small>Prep · Cook · Assist</small></button></div><div className="tip"><b>Chef's tip</b><br/>Call out the next step before your partner finishes the current one. Great teams stay one move ahead.</div></div>
          <div className="panel"><span className="section-kicker">MYSTERY TWIST</span><h3>Expect the unexpected</h3><p className="muted-copy">{state.twist || "A surprise challenge may arrive during the round. Stay ready."}</p><button className="button secondary full" onClick={surprise} disabled={!state.started || state.finished}>Trigger demo twist</button></div>
          <div className="panel"><span className="section-kicker">KITCHEN COMMS</span><h3>Team callouts</h3><div className="callouts">{["I've got the prep!","Start the risotto!","Watch the salmon!","Need a hand here!","Plating in 30 seconds!"].map(x=><button key={x} onClick={()=>act(`called out: “${x}”`,s=>({...s}))} disabled={!state.started || state.finished}>{x}</button>)}</div><div className="activity"><b>Competition feed</b>{state.notes.slice(0,5).map((n,i)=><p key={i}>• {n}</p>)}</div></div>
          <div className="panel score-panel"><span className="section-kicker">TEAM PERFORMANCE</span><div className="score-number">{state.score}<small>/100</small></div><div className="score-track"><span style={{width:`${state.score}%`}}/></div><p>Recipe execution and preparation progress.</p><button className="button primary full" disabled={!state.started || state.finished} onClick={submitDish}>Submit final plate ↗</button></div>
        </aside>
      </div>
      <section className="bottom-bar"><div><b>{role === "host" ? "You are the host chef" : "You joined the kitchen"}</b><small>{room.guest_name ? "Both chefs are in the room. Coordinate your service." : "Share the invitation link and wait for your partner."}</small></div>{!state.started && !state.finished && <button className="button primary" onClick={startRound} disabled={role!=="host" || !room.guest_name}>Start competition</button>}{state.finished && <button className="button primary" onClick={()=>{setState(initialState);broadcastState(initialState);}}>New round</button>}</section>
      {toast && <div className="toast" onClick={()=>setToast("")}>{toast}</div>}
      {error && <div className="toast error-toast">{error}</div>}
      <footer>Kitchen Clash · Private duo prototype · Recipe guidance is a game mechanic, not professional food-safety instruction.</footer>
    </main>
  );
}

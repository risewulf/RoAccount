import { useState } from "react";
import { useStore } from "../store";
import { newId } from "../lib/launcher";
import type { Schedule } from "../lib/types";
import { Toggle } from "./Controls";
import { IconCalendar, IconPlus, IconX } from "./icons";

const DAYS = [{ d: 1, l: "L" }, { d: 2, l: "M" }, { d: 3, l: "M" }, { d: 4, l: "J" }, { d: 5, l: "V" }, { d: 6, l: "S" }, { d: 0, l: "D" }];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function whenText(s: Schedule): string {
  const days = s.days.length === 0 || s.days.length === 7 ? "Every day" : [...s.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d]).join(" ");
  return `${days} at ${s.time}`;
}

/** Démarre ou arrête un profil à une heure donnée. */
export function Schedules() {
  const store = useStore();
  const { settings } = store;
  const profiles = settings.profiles ?? [];
  const list = settings.schedules ?? [];
  const [adding, setAdding] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [time, setTime] = useState("02:00");
  const [action, setAction] = useState<"start" | "stop">("start");
  const [days, setDays] = useState<number[]>([]);

  const set = (schedules: Schedule[]) => store.updateSettings({ schedules });

  function add() {
    const pid = profileId || profiles[0]?.id;
    if (!pid) return;
    set([...list, { id: newId(), profileId: pid, time, days, action, enabled: true }]);
    setAdding(false);
    store.toast("Schedule added.");
  }

  return (
    <div className="card pad" style={{ marginTop: 14 }}>
      <div className="inline" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}><IconCalendar style={{ width: 17, height: 17 }} />Schedule</h3>
        {profiles.length > 0 && !adding && <button className="btn sm" onClick={() => { setProfileId(profiles[0].id); setAdding(true); }}><IconPlus />Add</button>}
      </div>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        Starts or stops a profile at the chosen time, for example to farm overnight. RoAccount must stay open (it can be minimized to the notification area).
      </div>

      {profiles.length === 0 && <div className="placeholder">Save a profile first (at the top of the page) so you can schedule it.</div>}

      {list.map((s) => {
        const p = profiles.find((x) => x.id === s.profileId);
        return (
          <div className="sched" key={s.id}>
            <Toggle on={s.enabled} label="Turn on" onChange={(v) => set(list.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)))} />
            <div className="t">
              <b>{s.action === "start" ? "Start" : "Stop"} « {p?.name ?? "profile deleted"} »</b>
              <span>{whenText(s)}{s.last ? ` · last run ${s.last}` : ""}</span>
            </div>
            <button className="icon-btn" onClick={() => set(list.filter((x) => x.id !== s.id))} aria-label="Delete"><IconX /></button>
          </div>
        );
      })}

      {adding && (
        <div className="sched-form">
          <select className="sort-select" value={action} onChange={(e) => setAction(e.target.value as "start" | "stop")} aria-label="Action">
            <option value="start">Start</option>
            <option value="stop">Stop</option>
          </select>
          <select className="sort-select" value={profileId} onChange={(e) => setProfileId(e.target.value)} aria-label="Profile">
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="sub" style={{ margin: 0 }}>at</span>
          <input className="txt" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 110 }} aria-label="Time" />
          <span className="days">
            {DAYS.map((x) => (
              <button key={x.d} className={"chip" + (days.includes(x.d) ? " on" : "")} onClick={() => setDays((d) => (d.includes(x.d) ? d.filter((y) => y !== x.d) : [...d, x.d]))} aria-label={DAY_NAMES[x.d]}>{x.l}</button>
            ))}
          </span>
          <span className="sub" style={{ margin: 0 }}>{days.length ? "" : "no day ticked = every day"}</span>
          <button className="btn primary sm" onClick={add}>Add</button>
          <button className="btn sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

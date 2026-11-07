import { useStore } from "../store";
import type { RotationConfig } from "../lib/types";
import { NumInput, Toggle } from "./Controls";
import { IconRefresh } from "./icons";

/** Keeps N accounts of a profile running and swaps them on a timer, to farm with more accounts than the PC can hold at once. */
export function Rotation() {
  const store = useStore();
  const { settings } = store;
  const profiles = settings.profiles ?? [];
  const r: RotationConfig = settings.rotation ?? { enabled: false, profileId: "", keep: 2, everyMin: 30 };
  const set = (p: Partial<RotationConfig>) => store.updateSettings({ rotation: { ...r, ...p } });
  const prof = profiles.find((p) => p.id === r.profileId);

  return (
    <div className="card pad" style={{ marginTop: 14 }}>
      <div className="inline" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}><IconRefresh style={{ width: 17, height: 17 }} />Rotation</h3>
        <Toggle on={r.enabled && !!prof} label="Turn on rotation" disabled={profiles.length === 0} onChange={(v) => set({ enabled: v, profileId: r.profileId || profiles[0]?.id || "" })} />
      </div>
      <div className="sub" style={{ margin: "6px 0 12px" }}>
        Keeps a few accounts of a profile in game and swaps them regularly, so you can farm with more accounts than your PC can run at once. RoAccount must stay open.
      </div>
      {profiles.length === 0 ? (
        <div className="placeholder">Save a profile first (at the top of the page) to use it as the rotation pool.</div>
      ) : (
        <div className="sched-form">
          <span className="sub" style={{ margin: 0 }}>Pool</span>
          <select className="sort-select" value={r.profileId || profiles[0].id} onChange={(e) => set({ profileId: e.target.value })} aria-label="Rotation profile">
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.accountIds.length})</option>)}
          </select>
          <span className="sub" style={{ margin: 0 }}>keep</span>
          <NumInput value={r.keep} onChange={(n) => set({ keep: n })} min={1} max={20} width={64} />
          <span className="sub" style={{ margin: 0 }}>running, swap one every</span>
          <NumInput value={r.everyMin} onChange={(n) => set({ everyMin: n })} min={5} max={720} width={72} />
          <span className="sub" style={{ margin: 0 }}>min</span>
        </div>
      )}
    </div>
  );
}

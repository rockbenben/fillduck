import { Button, Checkbox } from 'antd';

// 语言选择器：勾选哪些语言本次生效（只有勾选的会被填充），支持一键全选/全不选。
// 每行右侧用三枚点示意这门语言会写进哪些商店：实心=将写入、空心=Edge 因不足 250 字会跳过、横杠=该商店未选。
// 这既能操作又保留了「语言 × 商店」的一览，取代了原先只能看不能点的分发矩阵。
export type StoreKey = 'chrome' | 'edge' | 'firefox';

export interface LocaleStore {
  key: StoreKey;
  label: string;
  badge: string; // C / E / F
  inScope: boolean; // 该商店的描述单元被勾选且条件齐备
  minChars?: number; // Edge = 250
}

export interface LocaleItem {
  locale: string;
  native: string;
  len: number;
  hasDesc: boolean; // 该语言是否有描述文案（仅有搜索词的语言 = false）
}

type Cell = 'ready' | 'skip' | 'na';
function cellState(item: LocaleItem, store: LocaleStore): Cell {
  if (!store.inScope || !item.hasDesc) return 'na'; // 商店未选，或该语言无描述可写 → 该格无内容
  if (store.minChars && item.len < store.minChars) return 'skip';
  return 'ready';
}

interface Props {
  items: LocaleItem[];
  stores: LocaleStore[];
  selected: Set<string>;
  disabled: boolean;
  onToggle: (locale: string) => void;
  onAll: () => void;
  onNone: () => void;
  emptyText: string;
  labels: { on: (n: number, m: number) => string; all: string; none: string; short: string; note: string };
}

export default function LocaleSelect({ items, stores, selected, disabled, onToggle, onAll, onNone, emptyText, labels }: Props) {
  if (!items.length) return <div className="fd-matrix-empty">{emptyText}</div>;

  return (
    <>
      <div className="fd-loc-head">
        <span className="n">{labels.on(selected.size, items.length)}</span>
        <span className="fd-loc-actions">
          <Button size="small" variant="text" color="default" onClick={onAll} disabled={disabled}>{labels.all}</Button>
          <Button size="small" variant="text" color="default" onClick={onNone} disabled={disabled}>{labels.none}</Button>
        </span>
      </div>
      <div className="fd-loc-cols">
        <span className="dots">
          {stores.map((s) => <i key={s.key} className="lab" title={s.label}>{s.badge}</i>)}
        </span>
      </div>
      <div className="fd-loclist">
        {items.map((it) => {
          const on = selected.has(it.locale);
          const skips = stores.some((s) => cellState(it, s) === 'skip');
          return (
            <label key={it.locale} className={`fd-loc${on ? '' : ' off'}`}>
              <Checkbox checked={on} disabled={disabled} onChange={() => onToggle(it.locale)} />
              <span className="name">{it.native}</span>
              <span className="code">{it.locale}</span>
              {skips && <span className="short">{labels.short}</span>}
              <span className="dots">
                {stores.map((s) => (
                  <i key={s.key} className={`fd-cell ${cellState(it, s)}`} title={`${s.label} · ${s.badge}`}><i /></i>
                ))}
              </span>
            </label>
          );
        })}
      </div>
      <span className="fd-hint" style={{ marginTop: 12 }}>{labels.note}</span>
    </>
  );
}

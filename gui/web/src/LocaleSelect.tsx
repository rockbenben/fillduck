import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
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
  labels: {
    on: (n: number, m: number) => string; all: string; none: string; short: string;
    ready: string; skipped: string; notSelected: string; hidden: (shown: number, total: number) => string;
  };
}

export default function LocaleSelect({ items, stores, selected, disabled, onToggle, onAll, onNone, emptyText, labels }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  // 24 行复选框以前占掉 24 个 Tab 站点（实测主操作键排在第 47 站之后）。
  // 现在整块列表是一个站点，上下键在行间移动、空格切换——和原生 listbox 一样。
  const [activeRow, setActiveRow] = useState(0);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLInputElement>('input[type=checkbox]') || [])];
    if (!rows.length) return;
    const at = rows.findIndex((x) => x === document.activeElement);
    const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, (at < 0 ? activeRow : at) + 1)
      : e.key === 'ArrowUp' ? Math.max(0, (at < 0 ? activeRow : at) - 1)
      : e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setActiveRow(next);
    rows[next].focus();
    rows[next].closest('.fd-loc')?.scrollIntoView({ block: 'nearest' });
  };
  // 列表框内滚 + 「藏了多少」读数：24 语言时可视区只装得下一半，以前没有任何提示，
  // 用户以为列表就到这儿为止（实测可视 434px / 内容 868px）。
  const [hidden, setHidden] = useState(0);
  const [shown, setShown] = useState(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) { setHidden(0); setShown(0); return undefined; }
    const measure = () => {
      const row = el.querySelector<HTMLElement>('.fd-loc');
      const rowH = row ? row.offsetHeight : 0;
      setHidden(Math.max(0, el.scrollHeight - el.clientHeight));
      setShown(rowH ? Math.min(items.length, Math.floor(el.clientHeight / rowH)) : items.length);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [items.length]);

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
        {/* 图例直接画在表头旁边：以前这三档靠屏上一句 55 字说明书解释，读的人得先记住句子再看点 */}
        <span className="fd-legend">
          <span><i className="k ready" />{labels.ready}</span>
          <span><i className="k skip" />{labels.skipped}</span>
          <span><i className="k na" />{labels.notSelected}</span>
        </span>
        <span className="dots">
          {stores.map((s) => <i key={s.key} className="lab" title={s.label}>{s.badge}</i>)}
        </span>
      </div>
      <div className="fd-loclist-wrap">
        <div
          className="fd-loclist" ref={listRef} role="group" onKeyDown={onKeyDown} tabIndex={disabled ? -1 : 0}
        >
          {items.map((it) => {
            const on = selected.has(it.locale);
            const skips = stores.some((s) => cellState(it, s) === 'skip');
            return (
              <label key={it.locale} className={`fd-loc${on ? '' : ' off'}`}>
                <Checkbox checked={on} disabled={disabled} tabIndex={-1} aria-label={`${it.native} (${it.locale})`} onChange={() => onToggle(it.locale)} />
                <span className="name">{it.native}</span>
                <span className="code">{it.locale}</span>
                {skips && <span className="short">{labels.short}</span>}
                {/* 三点区承载的是「会写进哪些商店」，不是开关：整行 label 会把它变成误触代价很高的按钮 */}
                <span className="dots" aria-hidden="true">
                  {stores.map((s) => (
                    <i key={s.key} className={`fd-cell ${cellState(it, s)}`} title={`${s.label} · ${s.badge}`}><i /></i>
                  ))}
                </span>
              </label>
            );
          })}
        </div>
        {hidden > 0 && <div className="fd-loc-fade" aria-hidden="true" />}
      </div>
      {hidden > 0 && <div className="fd-loc-more">{labels.hidden(shown, items.length)}</div>}
    </>
  );
}

import { Children, isValidElement, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import * as Select from "@radix-ui/react-select";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { ru } from "react-day-picker/locale";

function choices(children: ReactNode): { value: string; label: ReactNode; disabled?: boolean }[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return [];
    return child.type === "option" ? [{ value: String(child.props.value ?? ""), label: child.props.children, disabled: child.props.disabled }] : choices(child.props.children);
  });
}
export function AppSelect({ children, value, defaultValue, onChange, className, style, id, name, disabled, required, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const items = choices(children); const [local, setLocal] = useState(String(defaultValue ?? items[0]?.value ?? ""));
  const current = value === undefined ? local : String(value);
  const empty = "__ritm_empty_option__";
  return <><input type="hidden" name={name} value={current} /><Select.Root value={current || empty} onValueChange={next => { const v = next === empty ? "" : next; setLocal(v); onChange?.({ target: { value: v }, currentTarget: { value: v } } as ChangeEvent<HTMLSelectElement>); }} disabled={disabled} required={required}><Select.Trigger id={id} className={`ritm-select ${className ?? "select"}`} style={style} aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]}><Select.Value placeholder="Выберите" /><Select.Icon><ChevronDown size={16} /></Select.Icon></Select.Trigger><Select.Portal><Select.Content data-ritm-popup="select" className="ritm-select-menu" position="popper" sideOffset={6} collisionPadding={12}><Select.ScrollUpButton className="ritm-select-scroll">↑</Select.ScrollUpButton><Select.Viewport>{items.map(item => <Select.Item className="ritm-select-option" value={item.value || empty} key={item.value} disabled={item.disabled}><Select.ItemText>{item.label}</Select.ItemText><Select.ItemIndicator><Check size={16} /></Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="ritm-select-scroll">↓</Select.ScrollDownButton></Select.Content></Select.Portal></Select.Root></>;
}

export function DateField({ value, defaultValue, onChange, className = "input", style, id, name, min, max, disabled, required, withTime = false, ...props }: InputHTMLAttributes<HTMLInputElement> & { withTime?: boolean }) {
  const [local, setLocal] = useState(String(defaultValue ?? "")); const [open, setOpen] = useState(false);
  const current = String(value === undefined ? local : value ?? "");
  const day = current.slice(0, 10); const time = current.slice(11, 16) || "09:00";
  const asDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : undefined;
  const change = (v: string) => { setLocal(v); onChange?.({ target: { value: v }, currentTarget: { value: v } } as ChangeEvent<HTMLInputElement>); };
  const selected = asDate(day);
  return <><input type="hidden" name={name} value={current} /><Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger asChild><button type="button" id={id} className={`ritm-date-trigger ${className}`} style={style} disabled={disabled} aria-label={props["aria-label"]} aria-required={required}><span className={current ? "" : "muted"}>{selected ? `${selected.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}${withTime ? ` · ${time}` : ""}` : "Выберите дату"}</span><CalendarDays size={18} /></button></Popover.Trigger><Popover.Portal><Popover.Content data-ritm-popup="calendar" className="ritm-calendar-popup" sideOffset={8} collisionPadding={12} align="start"><DayPicker mode="single" locale={ru} selected={selected} defaultMonth={selected} showOutsideDays weekStartsOn={1} disabled={[...(min ? [{ before: asDate(String(min).slice(0, 10))! }] : []), ...(max ? [{ after: asDate(String(max).slice(0, 10))! }] : [])]} onSelect={date => { if (!date) return; const v = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; change(withTime ? `${v}T${time}` : v); if (!withTime) setOpen(false); }} components={{ Chevron: ({ orientation }) => orientation === "left" ? <ChevronLeft size={18} /> : <ChevronRight size={18} /> }} />{withTime && <label className="ritm-calendar-time">Время<input className="input" type="time" value={time} onChange={e => { if (day) change(`${day}T${e.target.value}`); }} /></label>}<div className="ritm-calendar-footer"><button type="button" className="text-button" onClick={() => { const now = new Date(); const v = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; if ((!min || v >= String(min).slice(0,10)) && (!max || v <= String(max).slice(0,10))) { change(withTime ? `${v}T${time}` : v); setOpen(false); } }}>Сегодня</button>{!required && <button type="button" className="text-button" onClick={() => { change(""); setOpen(false); }}>Очистить</button>}<Popover.Close className="text-button">Готово</Popover.Close></div></Popover.Content></Popover.Portal></Popover.Root></>;
}

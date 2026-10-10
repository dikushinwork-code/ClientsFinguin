"use client";

import { Info, LoaderCircle, MessageSquare } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CONTROL_ITEMS,
  CONTROL_MEETING_RULES,
  CONTROL_QUESTIONS,
  badWeeks,
  controlWeeks,
  emptyWeek,
  nextMark,
  setMark,
  weekScore,
} from "@/lib/control";
import type { ControlData, ControlItem, ControlMark, ControlWeek } from "@/lib/control";
import { formatDayShortMonth } from "@/lib/dates";
import { formatWeekRange } from "@/lib/week-report";

type Phase = "loading" | "locked" | "ready" | "error";

const JSON_HEADERS = { "Content-Type": "application/json" };

// null — нужен пароль.
async function fetchControl(signal?: AbortSignal): Promise<ControlData | null> {
  const response = await fetch("/api/control", { cache: "no-store", signal });
  if (response.status === 401) return null;
  const payload = (await response.json().catch(() => ({}))) as { data?: ControlData; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error || "Не удалось загрузить отметки");
  return payload.data;
}

// Подсказка ⓘ: наведение или фокус показывают, нажатие закрепляет; Escape и клик мимо закрывают.
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const open = hover || pinned;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHover(false);
        setPinned(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ctl-tip-wrap" ref={ref} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className="ctl-info"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setPinned((current) => !current)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <Info size={14} />
      </button>
      {open && <div className="ctl-tip" role="tooltip">{children}</div>}
    </div>
  );
}

function ItemTip({ item }: { item: ControlItem }) {
  return (
    <>
      <p>Где смотреть: {item.where}</p>
      <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
      {item.extra && (
        <>
          <p className="ctl-tip-h">{item.extraTitle}</p>
          <ul>{item.extra.map((point) => <li key={point}>{point}</li>)}</ul>
        </>
      )}
    </>
  );
}

function markLabel(mark: ControlMark | undefined) {
  if (mark === "ok") return "в порядке";
  if (mark === "bad") return "есть проблема";
  return "не проверено";
}

export default function ControlBoard({ today }: { today: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<ControlData>({ weeks: {} });
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const panelRef = useRef<HTMLElement>(null);

  const weeks = useMemo(() => controlWeeks(today), [today]);
  const latest = weeks[weeks.length - 1];
  const current = selected && weeks.includes(selected) ? selected : latest;

  useEffect(() => {
    const controller = new AbortController();
    fetchControl(controller.signal)
      .then((loaded) => {
        if (!loaded) {
          setPhase("locked");
          return;
        }
        setData(loaded);
        setPhase("ready");
      })
      .catch((reason: Error) => {
        if (reason.name === "AbortError") return;
        setMessage(reason.message);
        setPhase("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/control/login", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ password }) });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось войти");
      const loaded = await fetchControl();
      if (!loaded) throw new Error("Не удалось войти");
      setData(loaded);
      setPassword("");
      setPhase("ready");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  function saveWeek(weekStart: string, week: ControlWeek) {
    const pending = timers.current;
    clearTimeout(pending.get(weekStart));
    pending.set(weekStart, setTimeout(async () => {
      pending.delete(weekStart);
      try {
        const response = await fetch("/api/control", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ weekStart, week }) });
        if (response.status === 401) {
          setPhase("locked");
          return;
        }
        if (!response.ok) throw new Error();
        setSaveError("");
      } catch {
        setSaveError("Не удалось сохранить отметки. Проверьте подключение и повторите.");
      }
    }, 450));
  }

  function updateWeek(weekStart: string, change: (week: ControlWeek) => ControlWeek) {
    const next = change(data.weeks[weekStart] ?? emptyWeek());
    setData((state) => ({ weeks: { ...state.weeks, [weekStart]: next } }));
    saveWeek(weekStart, next);
  }

  if (phase === "loading") {
    return <div className="ctl-state"><LoaderCircle size={16} className="spin" />Загрузка</div>;
  }
  if (phase === "error") {
    return <div className="ctl-state ctl-error">{message}</div>;
  }
  if (phase === "locked") {
    return (
      <form className="ctl-card ctl-lock" onSubmit={login}>
        <h2>Руководителю</h2>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Пароль"
          aria-label="Пароль"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        <button type="submit" disabled={busy || !password}>Войти</button>
        {message && <p className="ctl-error">{message}</p>}
      </form>
    );
  }

  const week = data.weeks[current] ?? emptyWeek();
  const badItems = CONTROL_ITEMS.filter((item) => week.marks[item.id] === "bad");
  const colClass = (weekStart: string) => "ctl-col" + (weekStart === current ? " is-selected" : "");

  return (
    <div className="ctl">
      <section className="ctl-card">
        <div className="ctl-head">
          <h2>Чек-лист по неделям</h2>
          {saveError && <span className="ctl-error">{saveError}</span>}
        </div>
        <table className="ctl-grid">
          <thead>
            <tr>
              <th className="ctl-name" />
              {weeks.map((weekStart) => {
                const [day, month] = formatDayShortMonth(weekStart).split(" ");
                return (
                  <th key={weekStart} className={colClass(weekStart)}>
                    <button
                      type="button"
                      className={"ctl-week" + (weekStart === latest ? " is-due" : "")}
                      title={formatWeekRange(weekStart)}
                      aria-pressed={weekStart === current}
                      onClick={() => setSelected(weekStart)}
                    >
                      <b>{day}</b>
                      <small>{weekStart === latest ? "к проверке" : month}</small>
                    </button>
                  </th>
                );
              })}
              <th className="ctl-total">✗ за {weeks.length} нед.</th>
            </tr>
          </thead>
          <tbody>
            {CONTROL_ITEMS.map((item) => {
              const bad = badWeeks(data, item.id, weeks);
              return (
                <tr key={item.id}>
                  <th scope="row" className="ctl-name">
                    <span className="ctl-row-title">
                      {item.title}
                      <InfoTip label={"Что проверить: " + item.title}><ItemTip item={item} /></InfoTip>
                    </span>
                  </th>
                  {weeks.map((weekStart) => {
                    const mark = data.weeks[weekStart]?.marks[item.id];
                    const note = mark === "bad" ? data.weeks[weekStart]?.notes[item.id]?.trim() : "";
                    return (
                      <td key={weekStart} className={colClass(weekStart)}>
                        <button
                          type="button"
                          className={"ctl-cell" + (mark ? " is-" + mark : "") + (note ? " has-note" : "")}
                          title={note || undefined}
                          aria-label={item.title + ", " + formatWeekRange(weekStart) + ": " + markLabel(mark)}
                          onClick={() => {
                            setSelected(weekStart);
                            updateWeek(weekStart, (value) => setMark(value, item.id, nextMark(mark)));
                          }}
                        >
                          {mark === "ok" ? "✓" : mark === "bad" ? "✗" : ""}
                        </button>
                      </td>
                    );
                  })}
                  <td className="ctl-total">{bad ? <b>{bad}</b> : "—"}</td>
                </tr>
              );
            })}
            <tr className="ctl-sep">
              <th scope="row" className="ctl-name ctl-muted">Итог недели</th>
              {weeks.map((weekStart) => {
                const score = weekScore(data.weeks[weekStart]);
                const tone = !score.checked ? "" : score.bad ? " is-bad" : " is-ok";
                return (
                  <td key={weekStart} className={colClass(weekStart)}>
                    <span className={"ctl-score" + tone}>{score.checked ? score.ok + "/" + CONTROL_ITEMS.length : "—"}</span>
                  </td>
                );
              })}
              <td className="ctl-total" />
            </tr>
            <tr>
              <th scope="row" className="ctl-name ctl-muted">Комментарии</th>
              {weeks.map((weekStart) => {
                const filledCount = CONTROL_QUESTIONS.filter((question) => data.weeks[weekStart]?.answers[question.id]?.trim()).length;
                const filled = filledCount > 0;
                return (
                  <td key={weekStart} className={colClass(weekStart)}>
                    <button
                      type="button"
                      className={"ctl-comment" + (filled ? " is-filled" : "")}
                      aria-label={"Комментарии за " + formatWeekRange(weekStart) + (filledCount ? ", заполнено " + filledCount : "")}
                      onClick={() => {
                        setSelected(weekStart);
                        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                    >
                      <MessageSquare size={15} />
                    </button>
                  </td>
                );
              })}
              <td className="ctl-total" />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="ctl-card ctl-panel" ref={panelRef}>
        <div className="ctl-panel-head">
          <h2>Неделя {formatWeekRange(current)}</h2>
          <span>{current === latest ? "к проверке" : (weeks.length - weeks.indexOf(current)) + " нед. назад"}</span>
        </div>
        <div className="ctl-cols">
          <div className="ctl-block">
            <div className="ctl-block-title">Что делаем по ✗</div>
            {badItems.length === 0 && <p className="ctl-empty">Пунктов с ✗ нет.</p>}
            {badItems.map((item) => (
              <label key={item.id} className="ctl-field">
                <span className="is-bad">✗ {item.title}</span>
                <textarea
                  rows={2}
                  value={week.notes[item.id] ?? ""}
                  placeholder="Что не так и что делаем"
                  onChange={(event) => {
                    const value = event.target.value;
                    updateWeek(current, (state) => ({ ...state, notes: { ...state.notes, [item.id]: value } }));
                  }}
                />
              </label>
            ))}
          </div>
          <div className="ctl-block">
            <div className="ctl-block-title">
              Вопросы к финдиру
              <InfoTip label="Как проводить встречу">
                <ul>{CONTROL_MEETING_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
              </InfoTip>
            </div>
            {CONTROL_QUESTIONS.map((question) => (
              <label key={question.id} className="ctl-field">
                <span>{question.label}</span>
                <textarea
                  rows={2}
                  value={week.answers[question.id] ?? ""}
                  placeholder="Если карта не отвечает — запишите ответ"
                  onChange={(event) => {
                    const value = event.target.value;
                    updateWeek(current, (state) => ({ ...state, answers: { ...state.answers, [question.id]: value } }));
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

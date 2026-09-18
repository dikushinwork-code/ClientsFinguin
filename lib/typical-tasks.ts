export interface TemplateCheckpoint {
  code: string;
  title: string;
  aside: string;
  gate: boolean;
  noteTitle: string;
  note: string;
}

export interface TemplateGroup {
  title: string;
  result: string;
  items: TemplateCheckpoint[];
}

export interface TemplateSubtask {
  code: string;
  title: string;
  groups: TemplateGroup[];
}

export interface TypicalTaskTemplate {
  code: string;
  title: string;
  weeks: number;
  premise: string;
  subtasks: TemplateSubtask[];
}

export class TypicalTasksFormatError extends Error {
  line: number;

  constructor(line: number, message: string) {
    super("typical-tasks.md, строка " + line + ": " + message);
    this.name = "TypicalTasksFormatError";
    this.line = line;
  }
}

// Формат описан в самом docs/typical-tasks.md (раздел «Соглашения»).
const TEMPLATE_HEADING = /^# (\S+)\. (.+)$/;
const SUBTASK_HEADING = /^## (\S+)\. (.+)$/;
const GROUP_HEADING = /^### (.+)$/;
const NOTES_HEADING = /^## Заметки к задаче (\S+)$/;
const DURATION = /^\*\*Длительность:\*\* (\d+)/;
const RESULT = /^\*\*Проверочный результат:\*\* (.+)$/;
const META = /^\*\*([^*:]+):\*\* (.+)$/;
const ITEM = /^- \[[ xX]\] `([^`]+)` (.+)$/;
const NOTE_HEADING = /^\*\*`([^`]+)` (.+)\*\*$/;
const NOTE_MARKER = /\s*`\(i\)`\s*$/;
const ASIDE = /\s*\*\(([^)]+)\)\*\s*$/;
const GATE = /^\*\*(.+)\*\*$/;

type Continuation =
  | { kind: "item"; item: TemplateCheckpoint }
  | { kind: "premise" }
  | { kind: "note"; code: string }
  | null;

export function parseTypicalTasks(markdown: string): TypicalTaskTemplate[] {
  const lines = markdown.split(/\r?\n/);
  const templates: TypicalTaskTemplate[] = [];
  const itemLines = new Map<string, number>();
  const pending: Array<{ item: TemplateCheckpoint; line: number }> = [];
  const notes = new Map<string, { title: string; text: string[]; line: number }>();

  let template: TypicalTaskTemplate | null = null;
  let subtask: TemplateSubtask | null = null;
  let group: TemplateGroup | null = null;
  let inNotes = false;
  let inFence = false;
  let continuation: Continuation = null;

  const currentGroup = (lineNumber: number) => {
    if (!subtask) throw new TypicalTasksFormatError(lineNumber, "пункт вне подзадачи");
    if (!group) {
      group = { title: "", result: "", items: [] };
      subtask.groups.push(group);
    }
    return group;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.startsWith("```")) { inFence = !inFence; return; }
    if (inFence) return;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed === "---") { continuation = null; return; }

    let match = TEMPLATE_HEADING.exec(line);
    if (match) {
      template = { code: match[1], title: match[2].trim(), weeks: 0, premise: "", subtasks: [] };
      templates.push(template);
      subtask = null; group = null; inNotes = false; continuation = null;
      return;
    }
    if (line.startsWith("# ")) { template = null; subtask = null; group = null; inNotes = false; continuation = null; return; }
    if (!template) return;

    match = NOTES_HEADING.exec(line);
    if (match) {
      if (match[1] !== template.code) throw new TypicalTasksFormatError(lineNumber, "заметки к задаче " + match[1] + " внутри задачи " + template.code);
      inNotes = true; subtask = null; group = null; continuation = null;
      return;
    }
    if (inNotes) {
      match = NOTE_HEADING.exec(line);
      if (match) {
        if (notes.has(match[1])) throw new TypicalTasksFormatError(lineNumber, "повторная заметка к пункту " + match[1]);
        notes.set(match[1], { title: match[2].trim(), text: [], line: lineNumber });
        continuation = { kind: "note", code: match[1] };
        return;
      }
      if (continuation?.kind === "note") { notes.get(continuation.code)!.text.push(trimmed); return; }
      throw new TypicalTasksFormatError(lineNumber, "в разделе заметок ожидался заголовок вида **`КОД-1.2` Заголовок**");
    }

    match = SUBTASK_HEADING.exec(line);
    if (match) {
      subtask = { code: match[1], title: match[2].trim(), groups: [] };
      template.subtasks.push(subtask);
      group = null; continuation = null;
      return;
    }
    match = GROUP_HEADING.exec(line);
    if (match) {
      if (!subtask) throw new TypicalTasksFormatError(lineNumber, "группа пунктов вне подзадачи");
      group = { title: match[1].trim(), result: "", items: [] };
      subtask.groups.push(group);
      continuation = null;
      return;
    }
    match = DURATION.exec(line);
    if (match) { template.weeks = Number(match[1]); continuation = null; return; }
    match = RESULT.exec(line);
    if (match) { currentGroup(lineNumber).result = match[1].trim(); continuation = null; return; }
    match = ITEM.exec(line);
    if (match) {
      if (itemLines.has(match[1])) throw new TypicalTasksFormatError(lineNumber, "повторный код пункта " + match[1]);
      const item: TemplateCheckpoint = { code: match[1], title: match[2].trim(), aside: "", gate: false, noteTitle: "", note: "" };
      currentGroup(lineNumber).items.push(item);
      itemLines.set(item.code, lineNumber);
      pending.push({ item, line: lineNumber });
      continuation = { kind: "item", item };
      return;
    }
    match = META.exec(line);
    if (match) {
      // Внутри подзадачи строки вроде «**Спринт:** неделя 1» интерфейсу не нужны.
      if (subtask) { continuation = null; return; }
      const text = match[1].trim() + ": " + match[2].trim();
      template.premise = template.premise ? template.premise + "\n" + text : text;
      continuation = { kind: "premise" };
      return;
    }
    if (line.startsWith("- ")) throw new TypicalTasksFormatError(lineNumber, "пункт без кода: ожидалось «- [ ] `КОД-1.2` Текст»");
    if (continuation?.kind === "item") { continuation.item.title += " " + trimmed; return; }
    if (continuation?.kind === "premise") { template.premise += " " + trimmed; return; }
    // Прочий описательный текст в интерфейс не попадает.
  });

  for (const { item, line } of pending) {
    let title = item.title;
    const hasNoteMarker = NOTE_MARKER.test(title);
    title = title.replace(NOTE_MARKER, "");
    const aside = ASIDE.exec(title);
    if (aside) { item.aside = aside[1].trim(); title = title.replace(ASIDE, ""); }
    const gate = GATE.exec(title.trim());
    if (gate) { item.gate = true; title = gate[1]; }
    item.title = title.trim();

    const note = notes.get(item.code);
    if (hasNoteMarker && !note) throw new TypicalTasksFormatError(line, "пункт " + item.code + " помечен (i), но заметки к нему нет");
    if (note && !hasNoteMarker) throw new TypicalTasksFormatError(note.line, "заметка к пункту " + item.code + ", который не помечен (i)");
    if (note) { item.noteTitle = note.title; item.note = note.text.join(" "); }
  }
  for (const [code, note] of notes) {
    if (!itemLines.has(code)) throw new TypicalTasksFormatError(note.line, "заметка к несуществующему пункту " + code);
  }
  for (const item of templates) {
    if (item.subtasks.length === 0) throw new TypicalTasksFormatError(1, "у задачи " + item.code + " нет подзадач");
    if (item.weeks !== item.subtasks.length) throw new TypicalTasksFormatError(1, "у задачи " + item.code + " " + item.weeks + " недель, а подзадач " + item.subtasks.length + ": подзадача занимает ровно одну неделю");
  }
  return templates;
}

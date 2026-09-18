import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTypicalTasks, TypicalTasksFormatError } from "./typical-tasks";

const markdown = readFileSync(new URL("../docs/typical-tasks.md", import.meta.url), "utf8");
const templates = parseTypicalTasks(markdown);
const byCode = (code: string) => templates.find((template) => template.code === code)!;

describe("parseTypicalTasks: реальный справочник", () => {
  it("находит обе задачи с длительностью и предпосылкой", () => {
    expect(templates.map((template) => template.code)).toEqual(["ДДС", "ФМ"]);
    expect(byCode("ДДС")).toMatchObject({ title: "Отчёт о движении денежных средств", weeks: 3 });
    expect(byCode("ДДС").premise).toBe("Предпосылка: используется сервис с интеграцией банковских выписок");
    expect(byCode("ФМ").premise.startsWith("Ритм встреч: интервью — одна встреча;")).toBe(true);
    expect(byCode("ФМ").premise.endsWith("точка Б — на следующей неделе.")).toBe(true);
  });

  it("разбирает подзадачи без групп в одну безымянную группу", () => {
    const [first, second, third] = byCode("ДДС").subtasks;
    expect(first).toMatchObject({ code: "ДДС-1", title: "Настройка сервиса и разнесение прошлого периода" });
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0].title).toBe("");
    expect(first.groups[0].items).toHaveLength(9);
    expect(second.groups[0].items).toHaveLength(5);
    expect(third.groups[0].items).toHaveLength(2);
  });

  it("разбирает группы с проверочным результатом", () => {
    const [first, second] = byCode("ФМ").subtasks;
    expect(first.groups.map((group) => group.title)).toEqual([
      "ФМ-1а. Сбор данных для построения финансовой модели",
      "ФМ-1б. Формирование точки А",
    ]);
    expect(first.groups[0].result).toBe("заполненная вкладка «Интервью»");
    expect(first.groups[1].result).toBe("");
    expect(first.groups[0].items).toHaveLength(10);
    expect(first.groups[1].items).toHaveLength(12);
    expect(second.groups[0].items).toHaveLength(5);
    expect(second.groups[1].items).toHaveLength(5);
  });

  it("склеивает многострочные пункты", () => {
    const item = byCode("ФМ").subtasks[0].groups[0].items[1];
    expect(item.code).toBe("ФМ-1.2");
    expect(item.title).toBe("Согласовано, как расходы привязываются к направлениям — где привязка корректна, где нет (переменные и прямые расходы)");
  });

  it("выделяет ремарку, ворота и пояснение", () => {
    const aside = byCode("ДДС").subtasks[0].groups[0].items[3];
    expect(aside).toMatchObject({ code: "ДДС-1.4", title: "Создан справочник статей", aside: "параллельно с интеграцией" });

    const gate = byCode("ФМ").subtasks[0].groups[1].items[11];
    expect(gate).toMatchObject({ code: "ФМ-1.22", title: "Клиент согласился с текущей точкой А", gate: true, noteTitle: "Согласие клиента с точкой А" });
    expect(gate.note.startsWith("Контрольные ворота спринта.")).toBe(true);

    const plain = byCode("ДДС").subtasks[0].groups[0].items[0];
    expect(plain).toMatchObject({ code: "ДДС-1.1", title: "Выбран сервис", aside: "", gate: false, noteTitle: "", note: "" });
  });

  it("привязывает все заметки", () => {
    const withNotes = (code: string) => byCode(code).subtasks.flatMap((subtask) => subtask.groups.flatMap((group) => group.items)).filter((item) => item.note).length;
    expect(withNotes("ДДС")).toBe(7);
    expect(withNotes("ФМ")).toBe(9);
  });
});

describe("parseTypicalTasks: ошибки формата", () => {
  const head = "# ТЕСТ. Тестовая задача\n\n**Длительность:** 1 неделя\n\n## ТЕСТ-1. Спринт\n\n";

  it("пункт с (i) без заметки", () => {
    expect(() => parseTypicalTasks(head + "- [ ] `ТЕСТ-1.1` Пункт `(i)`\n")).toThrow(TypicalTasksFormatError);
    expect(() => parseTypicalTasks(head + "- [ ] `ТЕСТ-1.1` Пункт `(i)`\n")).toThrow(/строка 7/);
  });

  it("заметка к несуществующему пункту", () => {
    const text = head + "- [ ] `ТЕСТ-1.1` Пункт\n\n## Заметки к задаче ТЕСТ\n\n**`ТЕСТ-1.9` Заголовок**\nТекст.\n";
    expect(() => parseTypicalTasks(text)).toThrow(/ТЕСТ-1\.9/);
  });

  it("пункт без кода", () => {
    expect(() => parseTypicalTasks(head + "- [ ] Пункт без кода\n")).toThrow(/без кода/);
  });

  it("число недель не совпадает с числом подзадач", () => {
    expect(() => parseTypicalTasks(head + "- [ ] `ТЕСТ-1.1` Пункт\n\n## ТЕСТ-2. Второй спринт\n\n- [ ] `ТЕСТ-2.1` Пункт\n")).toThrow(/недел/);
  });

  it("игнорирует шаблон в блоке кода и вводную часть", () => {
    expect(parseTypicalTasks("# Заголовок\n\n| Код | Название |\n|---|---|\n\n```\n# КОД. Название\n- [ ] `КОД-1.1` Пункт\n```\n")).toEqual([]);
  });
});

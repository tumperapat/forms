import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { FieldType, FormDetail } from "../lib/types";
import { Button, Card, inputClass } from "../components/ui";

interface EditField {
  key: string;
  id?: number;
  type: FieldType;
  label: string;
  required: boolean;
  options: string[];
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

const FIELD_TYPES: { type: FieldType; label: string; w: number; h: number }[] = [
  { type: "TEXT", label: "Text", w: 260, h: 70 },
  { type: "LONG_TEXT", label: "Long text", w: 320, h: 120 },
  { type: "NUMBER", label: "Number", w: 180, h: 70 },
  { type: "CHECKBOX", label: "Checkbox", w: 260, h: 50 },
  { type: "DROPDOWN", label: "Dropdown", w: 220, h: 70 },
  { type: "DATE", label: "Date", w: 200, h: 70 },
  { type: "SECTION", label: "Section label", w: 420, h: 40 },
];

// A4 at 96 CSS px/inch — each page is one printable sheet.
const CANVAS_WIDTH = 794;
const CANVAS_HEIGHT = 1123;

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `new-${keyCounter}`;
}

function fromServerField(f: FormDetail["fields"][number]): EditField {
  return {
    key: `id-${f.id}`,
    id: f.id,
    type: f.type,
    label: f.label,
    required: f.required,
    options: f.options ? (JSON.parse(f.options) as string[]) : [],
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    zIndex: f.zIndex,
  };
}

function parsePageTitles(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length ? parsed : ["Page 1"];
  } catch {
    return ["Page 1"];
  }
}

export default function FormBuilder() {
  const { id } = useParams();
  const formId = Number(id);

  const [form, setForm] = useState<FormDetail | null>(null);
  const [fields, setFields] = useState<EditField[]>([]);
  const [pageTitles, setPageTitles] = useState<string[]>(["Page 1"]);
  const [activePage, setActivePage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: string;
    mode: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
  } | null>(null);

  useEffect(() => {
    api
      .get<FormDetail>(`/forms/${formId}`)
      .then((f) => {
        setForm(f);
        setFields(f.fields.map(fromServerField));
        setPageTitles(parsePageTitles(f.pageTitles));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load form"));
  }, [formId]);

  const visibleFields = fields.filter((f) => f.page === activePage);
  const selected = fields.find((f) => f.key === selectedKey) ?? null;

  function switchPage(index: number) {
    setActivePage(index);
    setSelectedKey(null);
  }

  function updateField(key: string, patch: Partial<EditField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    setDirty(true);
  }

  function addField(type: FieldType) {
    const meta = FIELD_TYPES.find((t) => t.type === type)!;
    const key = newKey();
    const onPage = visibleFields.length;
    const offset = (onPage % 6) * 16;
    setFields((prev) => [
      ...prev,
      {
        key,
        type,
        label: type === "SECTION" ? "Section title" : meta.label,
        required: false,
        options: type === "DROPDOWN" ? ["Option 1", "Option 2"] : [],
        page: activePage,
        x: 40 + offset,
        y: 40 + offset,
        width: meta.w,
        height: meta.h,
        zIndex: onPage,
      },
    ]);
    setSelectedKey(key);
    setDirty(true);
  }

  function deleteSelected() {
    if (!selectedKey) return;
    setFields((prev) => prev.filter((f) => f.key !== selectedKey));
    setSelectedKey(null);
    setDirty(true);
  }

  const onPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;
    if (drag.mode === "move") {
      const x = Math.max(0, drag.startX + dx);
      const y = Math.max(0, drag.startY + dy);
      setFields((prev) => prev.map((f) => (f.key === drag.key ? { ...f, x, y } : f)));
    } else {
      const width = Math.max(60, drag.startW + dx);
      const height = Math.max(30, drag.startH + dy);
      setFields((prev) => prev.map((f) => (f.key === drag.key ? { ...f, width, height } : f)));
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragRef.current) setDirty(true);
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  function startDrag(e: React.PointerEvent, key: string, mode: "move" | "resize") {
    e.stopPropagation();
    const field = fields.find((f) => f.key === key);
    if (!field) return;
    setSelectedKey(key);
    dragRef.current = {
      key,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: field.x,
      startY: field.y,
      startW: field.width,
      startH: field.height,
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  async function saveLayout() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        fields: fields.map((f) => ({
          id: f.id,
          type: f.type,
          label: f.label,
          required: f.required,
          options: f.type === "DROPDOWN" ? f.options : undefined,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          zIndex: f.zIndex,
        })),
      };
      const updated = await api.put<FormDetail>(`/forms/${formId}/fields`, payload);
      setForm(updated);
      setFields(updated.fields.map(fromServerField));
      setDirty(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save layout");
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails(patch: { title?: string; description?: string; published?: boolean; pageTitles?: string[] }) {
    setError(null);
    try {
      const updated = await api.patch<FormDetail>(`/forms/${formId}`, patch);
      setForm((prev) => (prev ? { ...prev, ...updated } : prev));
      if (patch.pageTitles) setPageTitles(patch.pageTitles);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
    }
  }

  function addPage() {
    const next = [...pageTitles, `Page ${pageTitles.length + 1}`];
    saveDetails({ pageTitles: next });
    setActivePage(next.length - 1);
    setSelectedKey(null);
  }

  function renamePage(index: number, title: string) {
    if (!title.trim()) return;
    const next = pageTitles.map((t, i) => (i === index ? title.trim() : t));
    saveDetails({ pageTitles: next });
  }

  async function deletePage(index: number) {
    setError(null);
    try {
      const updated = await api.delete<FormDetail>(`/forms/${formId}/pages/${index}`);
      setForm(updated);
      setFields(updated.fields.map(fromServerField));
      setPageTitles(parsePageTitles(updated.pageTitles));
      setActivePage((prev) => Math.min(prev, parsePageTitles(updated.pageTitles).length - 1));
      setSelectedKey(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to delete page");
    }
  }

  if (!form) {
    return <p className="text-sm text-slate-400">{error || "Loading..."}</p>;
  }

  const contentHeight = visibleFields.length ? Math.max(...visibleFields.map((f) => f.y + f.height)) + 40 : 0;
  const overflowsPage = contentHeight > CANVAS_HEIGHT;
  const canvasHeight = Math.max(CANVAS_HEIGHT, contentHeight);
  const canDeletePage = pageTitles.length > 1 && visibleFields.length === 0;

  return (
    <div>
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="flex-1">
          <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
            ← Back to forms
          </Link>
          <input
            className="block w-full text-xl font-semibold text-slate-900 dark:text-slate-100 bg-transparent border-none focus:outline-none focus:ring-0 mt-1 px-0"
            defaultValue={form.title}
            onBlur={(e) => e.target.value.trim() && saveDetails({ title: e.target.value.trim() })}
          />
          <input
            className="block w-full text-sm text-slate-500 bg-transparent border-none focus:outline-none focus:ring-0 px-0"
            placeholder="Add a description..."
            defaultValue={form.description ?? ""}
            onBlur={(e) => saveDetails({ description: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={() => saveDetails({ published: !form.published })}>
            {form.published ? "Unpublish" : "Publish"}
          </Button>
          <Link to={`/forms/${formId}/responses`}>
            <Button variant="secondary">Responses</Button>
          </Link>
          <Button onClick={saveLayout} disabled={saving || !dirty}>
            {saving ? "Saving..." : dirty ? "Save layout" : "Saved"}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {pageTitles.map((title, i) => (
          <PageTab
            key={i}
            title={title}
            active={i === activePage}
            onSelect={() => switchPage(i)}
            onRename={(t) => renamePage(i, t)}
          />
        ))}
        <button
          onClick={addPage}
          className="text-sm font-medium px-3 py-1.5 rounded-md text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
        >
          + Add page
        </button>
        {pageTitles.length > 1 && (
          <button
            onClick={() => deletePage(activePage)}
            disabled={!canDeletePage}
            title={canDeletePage ? "Delete this page" : "Remove this page's fields first"}
            className="text-sm font-medium px-3 py-1.5 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Delete page
          </button>
        )}
      </div>

      <div className="flex gap-4 items-start">
        <Card className="p-3 w-40 shrink-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2 px-1">Add field</p>
          <div className="flex flex-col gap-1.5">
            {FIELD_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => addField(t.type)}
                className="text-left text-sm px-2.5 py-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                + {t.label}
              </button>
            ))}
          </div>
        </Card>

        <div
          ref={canvasRef}
          onPointerDown={() => setSelectedKey(null)}
          className="relative bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-sm shadow-sm shrink-0"
          style={{
            width: CANVAS_WIDTH,
            height: canvasHeight,
            backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.35) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          {overflowsPage && (
            <div
              className="absolute left-0 right-0 border-t border-dashed border-red-400"
              style={{ top: CANVAS_HEIGHT }}
              title="Content below this line won't fit on a printed A4 page"
            />
          )}
          {visibleFields.map((f) => (
            <div
              key={f.key}
              onPointerDown={(e) => startDrag(e, f.key, "move")}
              className={`absolute rounded-lg border p-2.5 cursor-move select-none ${
                selectedKey === f.key
                  ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-500/30"
                  : "border-slate-200 dark:border-slate-700"
              } ${f.type === "SECTION" ? "bg-slate-50 dark:bg-slate-800/60" : "bg-white dark:bg-slate-900"}`}
              style={{ left: f.x, top: f.y, width: f.width, height: f.height, zIndex: f.zIndex }}
            >
              <FieldPreview field={f} />
              {selectedKey === f.key && (
                <div
                  onPointerDown={(e) => startDrag(e, f.key, "resize")}
                  className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-sm bg-indigo-500 cursor-nwse-resize"
                />
              )}
            </div>
          ))}
        </div>

        <Card className="p-4 w-72 shrink-0">
          {!selected ? (
            <p className="text-sm text-slate-400">Select a field to edit its properties, or add a new one from the left.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {FIELD_TYPES.find((t) => t.type === selected.type)?.label}
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Label</label>
                <input
                  className={inputClass}
                  value={selected.label}
                  onChange={(e) => updateField(selected.key, { label: e.target.value })}
                />
              </div>
              {selected.type !== "SECTION" && (
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={selected.required}
                    onChange={(e) => updateField(selected.key, { required: e.target.checked })}
                  />
                  Required
                </label>
              )}
              {selected.type === "DROPDOWN" && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Options (one per line)</label>
                  <textarea
                    className={`${inputClass} h-28`}
                    value={selected.options.join("\n")}
                    onChange={(e) => updateField(selected.key, { options: e.target.value.split("\n") })}
                    onBlur={(e) =>
                      updateField(selected.key, {
                        options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>
              )}
              <Button variant="danger" onClick={deleteSelected} className="w-full">
                Delete field
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PageTab({
  title,
  active,
  onSelect,
  onRename,
}: {
  title: string;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
}) {
  if (active) {
    return (
      <input
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-indigo-600 text-white w-32 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        defaultValue={title}
        key={title}
        onBlur={(e) => onRename(e.target.value)}
      />
    );
  }
  return (
    <button
      onClick={onSelect}
      className="text-sm font-medium px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      {title}
    </button>
  );
}

function FieldPreview({ field }: { field: EditField }) {
  if (field.type === "SECTION") {
    return <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{field.label}</p>;
  }
  return (
    <div className="h-full flex flex-col">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </p>
      <div className="mt-1 flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex items-center px-2">
        <span className="text-[11px] text-slate-400 truncate">
          {field.type === "CHECKBOX"
            ? "☐ checkbox"
            : field.type === "DROPDOWN"
            ? field.options.join(" / ") || "dropdown"
            : field.type === "DATE"
            ? "date picker"
            : field.type === "NUMBER"
            ? "0"
            : "text input"}
        </span>
      </div>
    </div>
  );
}

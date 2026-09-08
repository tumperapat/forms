import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { FormDetail } from "../lib/types";
import { Button, Card, inputClass } from "../components/ui";

// A4 at 96 CSS px/inch — matches the builder's page size.
const CANVAS_WIDTH = 794;
const CANVAS_HEIGHT = 1123;

function parsePageTitles(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length ? parsed : ["Page 1"];
  } catch {
    return ["Page 1"];
  }
}

export default function FormFill() {
  const { id } = useParams();
  const formId = Number(id);

  const [form, setForm] = useState<FormDetail | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function load() {
    setSubmitted(false);
    setValues({});
    setCurrentPage(0);
    api
      .get<FormDetail>(`/forms/${formId}`)
      .then(setForm)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load form"));
  }

  useEffect(load, [formId]);

  function setValue(fieldId: number, value: string) {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit() {
    if (!form) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/forms/${formId}/responses`, {
        values: form.fields
          .filter((f) => f.type !== "SECTION")
          .map((f) => ({ fieldId: f.id, value: values[f.id] ?? (f.type === "CHECKBOX" ? "false" : "") })),
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (!form) {
    return <p className="text-sm text-slate-400">{error || "Loading..."}</p>;
  }

  const pageTitles = parsePageTitles(form.pageTitles);
  const pageFields = form.fields.filter((f) => f.page === currentPage);
  const height = Math.max(CANVAS_HEIGHT, ...pageFields.map((f) => f.y + f.height + 40));
  const isLastPage = currentPage === pageTitles.length - 1;

  return (
    <div>
      <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
        ← Back to forms
      </Link>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{form.title}</h1>
      {form.description && <p className="text-sm text-slate-500 mt-1">{form.description}</p>}

      {submitted ? (
        <Card className="p-8 text-center mt-4">
          <p className="text-emerald-600 font-medium mb-4">Response submitted. Thank you!</p>
          <Button variant="secondary" onClick={load}>
            Submit another response
          </Button>
        </Card>
      ) : (
        <>
          {error && <p className="text-sm text-red-600 my-3">{error}</p>}

          {pageTitles.length > 1 && (
            <div className="flex items-center gap-2 mt-4 mb-1">
              <p className="text-xs font-medium text-slate-400">
                Page {currentPage + 1} of {pageTitles.length}
              </p>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">— {pageTitles[currentPage]}</p>
            </div>
          )}

          <div
            className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-sm shadow-sm mt-2"
            style={{ width: CANVAS_WIDTH, height }}
          >
            {pageFields.map((f) => (
              <div key={f.id} className="absolute p-2.5" style={{ left: f.x, top: f.y, width: f.width, height: f.height }}>
                <FieldInput field={f} value={values[f.id] ?? ""} onChange={(v) => setValue(f.id, v)} />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-4">
            {currentPage > 0 && (
              <Button variant="secondary" onClick={() => setCurrentPage((p) => p - 1)}>
                Back
              </Button>
            )}
            {isLastPage ? (
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            ) : (
              <Button onClick={() => setCurrentPage((p) => p + 1)}>Next</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormDetail["fields"][number];
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "SECTION") {
    return <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{field.label}</p>;
  }

  const label = (
    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </label>
  );

  if (field.type === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 h-full">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
    );
  }

  if (field.type === "DROPDOWN") {
    const options: string[] = field.options ? JSON.parse(field.options) : [];
    return (
      <div>
        {label}
        <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select...</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "LONG_TEXT") {
    return (
      <div className="h-full flex flex-col">
        {label}
        <textarea className={`${inputClass} flex-1 resize-none`} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

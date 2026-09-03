import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError, downloadFile } from "../lib/api";
import type { FormDetail, FormResponseRecord, SheetStatus } from "../lib/types";
import { Button, Card, PageHeader } from "../components/ui";

export default function FormResponses() {
  const { id } = useParams();
  const formId = Number(id);
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState<FormDetail | null>(null);
  const [responses, setResponses] = useState<FormResponseRecord[]>([]);
  const [sheet, setSheet] = useState<SheetStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("sheetConnected") ? "Google Sheet connected." : null
  );
  const [exporting, setExporting] = useState(false);

  function load() {
    Promise.all([
      api.get<FormDetail>(`/forms/${formId}`),
      api.get<FormResponseRecord[]>(`/forms/${formId}/responses`),
      api.get<SheetStatus>(`/forms/${formId}/sheet`),
    ])
      .then(([f, r, s]) => {
        setForm(f);
        setResponses(r);
        setSheet(s);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }

  useEffect(load, [formId]);

  async function handleExport() {
    if (!form) return;
    setExporting(true);
    setError(null);
    try {
      await downloadFile(`/forms/${formId}/responses/export.xlsx`, `${form.title}-responses.xlsx`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function connectSheet() {
    setError(null);
    try {
      const { authUrl } = await api.get<{ authUrl: string }>(`/forms/${formId}/sheet/connect`);
      window.location.href = authUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start Google connection");
    }
  }

  async function toggleSync() {
    if (!sheet) return;
    try {
      await api.patch(`/forms/${formId}/sheet`, { syncOnSubmit: !sheet.syncOnSubmit });
      setNotice(null);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update");
    }
  }

  async function syncNow() {
    setError(null);
    setNotice(null);
    try {
      await api.post(`/forms/${formId}/sheet/sync-now`);
      setNotice("Sheet re-synced.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Sync failed");
    }
  }

  async function disconnectSheet() {
    try {
      await api.delete(`/forms/${formId}/sheet`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to disconnect");
    }
  }

  if (!form) {
    return <p className="text-sm text-slate-400">{error || "Loading..."}</p>;
  }

  const fields = form.fields.filter((f) => f.type !== "SECTION");

  return (
    <div>
      <Link to="/" className="text-xs text-slate-400 hover:text-slate-600">
        ← Back to forms
      </Link>
      <PageHeader
        title={`${form.title} — Responses`}
        subtitle={`${responses.length} response${responses.length === 1 ? "" : "s"}`}
        action={
          <Button onClick={handleExport} disabled={exporting || responses.length === 0}>
            {exporting ? "Exporting..." : "Export to Excel"}
          </Button>
        }
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {notice && <p className="text-sm text-emerald-600 mb-4">{notice}</p>}

      <Card className="p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Google Sheets sync</h2>
        {!sheet?.googleConfigured ? (
          <p className="text-sm text-slate-500">
            Not configured on this server yet. An admin needs to set <code>GOOGLE_CLIENT_ID</code>,{" "}
            <code>GOOGLE_CLIENT_SECRET</code> and <code>GOOGLE_REDIRECT_URI</code>. Excel export above works regardless.
          </p>
        ) : !sheet.connected ? (
          <Button variant="secondary" onClick={connectSheet}>
            Connect Google Sheets
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              className="text-indigo-600 hover:underline"
              href={`https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`}
              target="_blank"
              rel="noreferrer"
            >
              Open connected sheet ↗
            </a>
            <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={sheet.syncOnSubmit} onChange={toggleSync} />
              Sync new responses automatically
            </label>
            <Button variant="secondary" onClick={syncNow}>
              Sync now
            </Button>
            <Button variant="danger" onClick={disconnectSheet}>
              Disconnect
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500">
              <th className="px-4 py-3 font-medium whitespace-nowrap">Submitted</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">By</th>
              {fields.map((f) => (
                <th key={f.id} className="px-4 py-3 font-medium whitespace-nowrap">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {responses.map((r) => {
              const byField = new Map(r.values.map((v) => [v.fieldId, v.value]));
              return (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(r.submittedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-100 whitespace-nowrap">{r.submittedBy?.name ?? "—"}</td>
                  {fields.map((f) => (
                    <td key={f.id} className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {byField.get(f.id) || "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
            {responses.length === 0 && (
              <tr>
                <td colSpan={2 + fields.length} className="px-4 py-6 text-center text-slate-400">
                  No responses yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

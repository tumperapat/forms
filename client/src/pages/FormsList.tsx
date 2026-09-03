import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { FormSummary } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { Badge, Button, Card, PageHeader } from "../components/ui";

export default function FormsList() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    api
      .get<FormSummary[]>("/forms")
      .then(setForms)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function createForm() {
    setCreating(true);
    setError(null);
    try {
      const form = await api.post<{ id: number }>("/forms", { title: "Untitled form" });
      window.location.href = `/forms/${form.id}/edit`;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create form");
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Forms"
        subtitle={isAdmin ? "Build forms and review responses" : "Forms you can fill out"}
        action={isAdmin && (
          <Button onClick={createForm} disabled={creating}>
            {creating ? "Creating..." : "+ New form"}
          </Button>
        )}
      />

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {forms.map((f) => (
          <Card key={f.id} className="p-5 flex flex-col">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-medium text-slate-900 dark:text-slate-100">{f.title}</h3>
              <Badge status={f.published ? "Published" : "Draft"} />
            </div>
            {f.description && <p className="text-sm text-slate-500 mb-3 line-clamp-2">{f.description}</p>}
            <p className="text-xs text-slate-400 mb-4">
              {f._count.fields} field{f._count.fields === 1 ? "" : "s"}
              {isAdmin && <> · {f._count.responses} response{f._count.responses === 1 ? "" : "s"}</>}
            </p>
            <div className="mt-auto flex gap-2">
              {isAdmin ? (
                <>
                  <Link to={`/forms/${f.id}/edit`}>
                    <Button variant="secondary">Edit</Button>
                  </Link>
                  <Link to={`/forms/${f.id}/responses`}>
                    <Button variant="secondary">Responses</Button>
                  </Link>
                  {f.published && (
                    <Link to={`/forms/${f.id}/fill`}>
                      <Button>Fill out</Button>
                    </Link>
                  )}
                </>
              ) : (
                <Link to={`/forms/${f.id}/fill`}>
                  <Button>Fill out</Button>
                </Link>
              )}
            </div>
          </Card>
        ))}
        {forms.length === 0 && (
          <p className="text-sm text-slate-400 col-span-full text-center py-10">
            {isAdmin ? "No forms yet — create one to get started." : "No forms available to fill out yet."}
          </p>
        )}
      </div>
    </div>
  );
}

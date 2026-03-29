import { Navigate, useParams } from "react-router"

// /templates/:id was the old forge catalog detail route.
// All agent/template detail views now live at /agents/:id.
export default function TemplateDetailRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/agents/${id}`} replace />
}

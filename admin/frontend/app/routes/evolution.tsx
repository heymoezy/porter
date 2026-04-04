import { Navigate } from "react-router"

// Evolution is now part of the Skills page (Proposals + History tabs)
export default function EvolutionRedirect() {
  return <Navigate to="/skills" replace />
}

import { AppSelect } from "./FormControls";
import type { PlannerData } from "@/lib/planner";

export function SharedAccess({ data, value, onChange, projectId, id }: { data: PlannerData; value: string; onChange: (value: string) => void; projectId?: string; id: string }) {
  const inherited = data.projects.find(project => project.id === projectId)?.workspaceId;
  return <div className="field"><label htmlFor={id}>Доступ</label><AppSelect id={id} className="select" value={inherited ?? value} disabled={!!inherited} onChange={event => onChange(event.target.value)}><option value="">Только мне</option>{data.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>Общее · {workspace.name}</option>)}</AppSelect><span className="micro muted">{inherited ? "Доступ наследуется от общего проекта." : "Общие задачи и проекты доступны участникам пространства."}</span></div>;
}

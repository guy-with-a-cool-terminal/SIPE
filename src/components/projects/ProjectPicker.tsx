import { useMyProjects } from "@/hooks/useProjects";
import { canCheckIn } from "@/lib/projects";
import { field } from "@/lib/forms";

/**
 * "Which project is this for?" on money forms. Lists projects you work on (not
 * ones you only view). Renders nothing for people without projects.
 */
export const ProjectPicker = ({ value, onChange, label = "Project (optional)" }: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) => {
  const { rows } = useMyProjects();
  const options = rows.filter((r) => !r.project.killed_at && canCheckIn(r.me.role));
  if (options.length === 0) return null;
  return (
    <label className="block">
      <span className="text-sm text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={field}>
        <option value="">Not for a project</option>
        {options.map((r) => <option key={r.project.id} value={r.project.id}>{r.project.name}</option>)}
      </select>
    </label>
  );
};

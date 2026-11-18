import { Link } from "react-router-dom";
import { useMyProjects, useProfileSettings } from "@/hooks/useProjects";
import { moduleEnabled } from "@/lib/projects";
import { cn } from "@/lib/utils";

/** Dashboard: what your projects need this week, most urgent first. Renders nothing when all is well. */
export const ProjectsCard = () => {
  const { data: profile } = useProfileSettings();
  const { attention } = useMyProjects();
  if (!moduleEnabled(profile?.enabled_modules, "projects") || attention.length === 0) return null;

  return (
    <section className="glass mb-5 overflow-hidden rounded-xl">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
        <h2 className="text-sm font-semibold">Projects this week</h2>
        <Link to="/projects" className="text-xs font-medium text-primary hover:text-primary/80">
          {attention.length > 4 ? `All ${attention.length} →` : "Open projects →"}
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {attention.slice(0, 4).map((a) => (
          <li key={`${a.projectId}-${a.kind}`}>
            <Link to={`/projects/${a.projectId}`} className="flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-secondary/20">
              <span className={cn("mt-1.5 size-2 flex-shrink-0 rounded-full", a.tone === "risk" ? "bg-destructive" : "bg-warning")} />
              <span className="text-sm leading-snug">{a.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
};

type ScriptaLogoProps = {
  className?: string;
  compact?: boolean;
};

/**
 * The Scripta brand lockup, shared by every visible product surface.
 *
 * The artwork is served from `public/` rather than Lovable's asset host. The
 * hosted `/__l5e/...` URL only resolves inside Lovable's own deployment, so
 * the mark was a broken image everywhere else — including local development,
 * where it appeared on the sign-in screen before anyone could reach the app.
 */
export default function ScriptaLogo({ className, compact = false }: ScriptaLogoProps) {
  return (
    <img
      className={className ? `scripta-logo ${className}` : "scripta-logo"}
      src="/scripta-logo.png"
      alt="Scripta"
      width={1146}
      height={391}
      draggable={false}
      {...(compact ? { "data-compact": "true" } : {})}
    />
  );
}

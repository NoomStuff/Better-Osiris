import "./StatusBanner.css";

interface StatusBannerProps {
   children: string;
   tone?: "default" | "subtle" | "error";
}

export function StatusBanner({ children, tone = "default" }: StatusBannerProps) {
   const className = tone === "error" ? "status-banner status-banner--error" : tone === "subtle" ? "status-banner status-banner--subtle" : "status-banner";

   return <div className={className}>{children}</div>;
}

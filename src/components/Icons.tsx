interface IconProps {
   className?: string;
}

function IconBase({
   children,
   className,
   viewBox = "0 0 24 24",
}: IconProps & {
   children: React.ReactNode;
   viewBox?: string;
}) {
   return (
      <svg
         aria-hidden="true"
         className={className}
         fill="none"
         stroke="currentColor"
         strokeLinecap="round"
         strokeLinejoin="round"
         strokeWidth="2"
         viewBox={viewBox}
      >
         {children}
      </svg>
   );
}

export function ArrowLeftIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <path d="M19 12H5" />
         <path d="m12 19-7-7 7-7" />
      </IconBase>
   );
}

export function ArrowRightIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <path d="M5 12h14" />
         <path d="m12 5 7 7-7 7" />
      </IconBase>
   );
}

export function ChevronDownIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <path d="m6 9 6 6 6-6" />
      </IconBase>
   );
}

export function ChevronRightIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <path d="m9 6 6 6-6 6" />
      </IconBase>
   );
}

export function CloseIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <path d="M18 6 6 18" />
         <path d="m6 6 12 12" />
      </IconBase>
   );
}

export function GridIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <rect height="7" rx="1" width="7" x="3" y="3" />
         <rect height="7" rx="1" width="7" x="14" y="3" />
         <rect height="7" rx="1" width="7" x="3" y="14" />
         <rect height="7" rx="1" width="7" x="14" y="14" />
      </IconBase>
   );
}

export function ListIcon({ className }: IconProps) {
   return (
      <IconBase className={className}>
         <path d="M9 6h11" />
         <path d="M9 12h11" />
         <path d="M9 18h11" />
         <path d="M4 6h.01" />
         <path d="M4 12h.01" />
         <path d="M4 18h.01" />
      </IconBase>
   );
}

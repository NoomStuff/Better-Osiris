interface ImportMetaEnv {
   readonly VITE_SCHOOL_NAME: string;
   /** True on the dev server and on Vercel preview builds. */
   readonly VITE_DEV_TOOLS: boolean;
}

interface ImportMeta {
   readonly env: ImportMetaEnv;
}

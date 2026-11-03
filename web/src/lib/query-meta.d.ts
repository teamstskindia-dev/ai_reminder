import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** The caller shows its own error UI (inline message / form field errors); skip the global toast. */
      silent?: boolean;
    };
  }
}

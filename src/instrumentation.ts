export async function register() {
  // Only run node-cron outside of serverless environments (Vercel uses its own cron).
  // VERCEL is set when running on Vercel. Skip in-process cron there.
  // Also skip in `next dev`: .env.local points at the production Turso DB, so a
  // local cron would execute real workflows alongside the Vercel cron.
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    !process.env.VERCEL &&
    process.env.NODE_ENV === "production"
  ) {
    const { default: cron } = await import("node-cron");

    cron.schedule("* * * * *", async () => {
      try {
        const { executeWorkflows } = await import("@/lib/workflows");
        await executeWorkflows();
      } catch (error) {
        console.error("[Cron] Workflow execution failed:", error);
      }
    });

    console.log("[Calendar.io] Workflow cron job started (every minute)");
  }
}

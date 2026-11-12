export function audit(action: string, fields: Record<string, string | number | boolean | null>) {
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), action, ...fields })}\n`);
}

/**
 * Turns what the user typed (an email address or a bare domain) into the
 * Domain. Everything up to and including the `@` is dropped here and never
 * reaches the network (ADR-0001).
 */
export function toDomain(input: string): string {
  const afterAt = input.slice(input.lastIndexOf("@") + 1);
  return afterAt.trim().toLowerCase();
}

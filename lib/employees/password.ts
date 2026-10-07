// Password policy (settings key 'password_policy') — pure, usable on client and server

export interface PasswordPolicy {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_digit: boolean;
  require_special: boolean;
  expire_days?: number;
}

export const DEFAULT_POLICY: PasswordPolicy = { min_length: 8, require_upper: true, require_lower: true, require_digit: true, require_special: true };

export function normalizePolicy(v: unknown): PasswordPolicy {
  return { ...DEFAULT_POLICY, ...((v as Partial<PasswordPolicy>) ?? {}) };
}

/** list of unmet rules (Thai). Empty = OK */
export function checkPassword(pw: string, p: PasswordPolicy): string[] {
  const out: string[] = [];
  if (pw.length < (p.min_length || 0)) out.push(`ยาวอย่างน้อย ${p.min_length} ตัวอักษร`);
  if (p.require_upper && !/[A-Z]/.test(pw)) out.push("มีตัวพิมพ์ใหญ่ (A-Z)");
  if (p.require_lower && !/[a-z]/.test(pw)) out.push("มีตัวพิมพ์เล็ก (a-z)");
  if (p.require_digit && !/\d/.test(pw)) out.push("มีตัวเลข (0-9)");
  if (p.require_special && !/[^A-Za-z0-9]/.test(pw)) out.push("มีอักขระพิเศษ เช่น @ # $ !");
  return out;
}

/** human description of the policy, e.g. for hints */
export function policyRules(p: PasswordPolicy): string[] {
  return checkPassword("", { ...p, min_length: Math.max(1, p.min_length) });
}

export function passwordError(pw: string, p: PasswordPolicy): string | null {
  const miss = checkPassword(pw, p);
  return miss.length ? `รหัสผ่านต้อง${miss.join(", ")}` : null;
}

/** generate a random password that satisfies the policy */
export function randomPassword(p: PasswordPolicy = DEFAULT_POLICY): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", L = "abcdefghijkmnpqrstuvwxyz", D = "23456789", S = "@#$%&*!";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [pick(U), pick(L), pick(D), pick(S)];
  const all = U + L + D;
  while (chars.length < Math.max(10, p.min_length)) chars.push(pick(all));
  return chars.sort(() => Math.random() - 0.5).join("");
}

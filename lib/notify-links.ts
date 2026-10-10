// Notification deep links. The database and the jobs store back-office links (/approvals?id=, /employees/N …);
// a person reading the notification on the employee app (/m) or in LINE on a phone needs the mobile page instead.

/** Map a stored notification link to the right page for the surface it is opened on */
export function appLink(link: string | null | undefined, mobile: boolean): string | null {
  if (!link) return null;
  if (!mobile) return link;
  let m = /^\/approvals\?id=(\d+)$/.exec(link);
  if (m) return `/m/approvals/${m[1]}`;
  m = /^\/me\/requests\?id=(\d+)$/.exec(link);
  if (m) return `/m/requests/${m[1]}`;
  m = /^\/requests\/(\d+)$/.exec(link);
  if (m) return `/m/requests/${m[1]}`;
  if (/^\/employees\/\d+/.test(link)) return "/m/team";
  if (link === "/approvals") return "/m/approvals";
  if (link === "/me/requests") return "/m/requests";
  return link;
}

"use client";

// News Feed — used by /feed (back office) and /m/feed (employee app)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award, Cake, EyeOff, Eye, ImagePlus, Megaphone, MessageCircle, Paperclip, Pin, PartyPopper, Send, Sparkles, Trash2, UserPlus, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useCan, useMe } from "@/components/app/me-context";
import { Avatar } from "@/components/employees/avatar";
import { Badge, Button, Modal, Spinner, Textarea, clsx, errorText, toast, useConfirm } from "@/components/ui";
import { resizeImage, uploadFile } from "@/lib/storage";
import { thDateTime } from "@/lib/format";
import { RichText } from "./rich-text";
import { timeAgo, useDirectory, usePeople, type DirRow } from "./use-people";

type Post = { id: number; author_id: string; content: string | null; images: string[] | null; post_type: string; kudos_to: number[] | null; is_hidden: boolean; created_at: string };
type Comment = { id: number; post_id: number; author_id: string; content: string; created_at: string };
type Reaction = { post_id: number; user_id: string; reaction: string };
type Ann = { id: number; title: string; content: string | null; image_url: string | null; attachments: { name: string; url: string }[]; is_pinned: boolean; publish_at: string; author_name: string | null; read_at: string | null };

const PAGE = 10;
export const REACTIONS: { key: string; emoji: string; label: string }[] = [
  { key: "like", emoji: "👍", label: "ถูกใจ" },
  { key: "love", emoji: "❤️", label: "รัก" },
  { key: "clap", emoji: "👏", label: "ปรบมือ" },
];
const TYPE_META: Record<string, { label: string; icon: typeof Award; tone: string }> = {
  kudos: { label: "ชื่นชม", icon: Award, tone: "bg-amber-50 text-amber-ink border-amber-200" },
  birthday: { label: "วันเกิด", icon: Cake, tone: "bg-rose-50 text-rose-800 border-rose-200" },
  anniversary: { label: "ครบรอบทำงาน", icon: PartyPopper, tone: "bg-violet-50 text-violet-800 border-violet-200" },
  welcome: { label: "พนักงานใหม่", icon: UserPlus, tone: "bg-sky-50 text-sky-800 border-sky-200" },
  system: { label: "ประกาศอัตโนมัติ", icon: Sparkles, tone: "bg-jade-50 text-jade-800 border-jade-200" },
};

export function Feed({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const sb = supabaseBrowser();
  const me = useMe();
  const can = useCan();
  const isHr = can("tools", "edit");
  const people = usePeople();
  const dir = useDirectory();
  const { confirm, dialog } = useConfirm();

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Map<number, Comment[]>>(new Map());
  const [reactions, setReactions] = useState<Map<number, Reaction[]>>(new Map());
  const [anns, setAnns] = useState<Ann[] | null>(null);
  const [openAnn, setOpenAnn] = useState<Ann | null>(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const empById = useMemo(() => new Map((dir.rows ?? []).map((e) => [e.id, e])), [dir.rows]);

  const loadExtras = useCallback(
    async (list: Post[]) => {
      if (!list.length) return;
      const ids = list.map((p) => p.id);
      const [c, r] = await Promise.all([
        sb.from("feed_comments").select("id, post_id, author_id, content, created_at").in("post_id", ids).order("id"),
        sb.from("feed_reactions").select("post_id, user_id, reaction").in("post_id", ids),
      ]);
      setComments((m) => {
        const n = new Map(m);
        for (const id of ids) n.set(id, []);
        for (const x of (c.data ?? []) as Comment[]) n.get(x.post_id)!.push(x);
        return n;
      });
      setReactions((m) => {
        const n = new Map(m);
        for (const id of ids) n.set(id, []);
        for (const x of (r.data ?? []) as Reaction[]) n.get(x.post_id)!.push(x);
        return n;
      });
      await people.load([...list.map((p) => p.author_id), ...((c.data ?? []) as Comment[]).map((x) => x.author_id)]);
      if (list.some((p) => p.kudos_to?.length)) await dir.ensure();
    },
    [sb, people, dir],
  );

  const loadMore = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      let q = sb.from("feed_posts").select("id, author_id, content, images, post_type, kudos_to, is_hidden, created_at").order("id", { ascending: false }).limit(PAGE);
      const last = reset ? null : posts[posts.length - 1];
      if (last) q = q.lt("id", last.id);
      const { data, error } = await q;
      if (error) toast.error(error.message);
      const list = (data ?? []) as Post[];
      setPosts((p) => (reset ? list : [...p, ...list]));
      setDone(list.length < PAGE);
      await loadExtras(list);
      setLoading(false);
      loadingRef.current = false;
    },
    [sb, posts, loadExtras],
  );

  const loadAnns = useCallback(async () => {
    const { data, error } = await sb.rpc("my_announcements", { p_limit: 10 });
    if (error) toast.error(error.message);
    setAnns((data ?? []) as Ann[]);
  }, [sb]);

  useEffect(() => {
    loadMore(true);
    loadAnns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !loadingRef.current && loadMore(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done, posts.length]);

  const markRead = async (a: Ann) => {
    setOpenAnn(a);
    if (a.read_at) return;
    const { error } = await sb.from("announcement_reads").upsert({ announcement_id: a.id, user_id: me.userId }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
    if (!error) setAnns((l) => l?.map((x) => (x.id === a.id ? { ...x, read_at: new Date().toISOString() } : x)) ?? null);
  };

  const react = async (post: Post, key: string) => {
    const mine = reactions.get(post.id)?.find((r) => r.user_id === me.userId);
    const next = (reactions.get(post.id) ?? []).filter((r) => r.user_id !== me.userId);
    if (mine?.reaction === key) {
      setReactions((m) => new Map(m).set(post.id, next));
      const { error } = await sb.from("feed_reactions").delete().eq("post_id", post.id).eq("user_id", me.userId);
      if (error) toast.error(error.message);
    } else {
      setReactions((m) => new Map(m).set(post.id, [...next, { post_id: post.id, user_id: me.userId, reaction: key }]));
      const { error } = await sb.from("feed_reactions").upsert({ post_id: post.id, user_id: me.userId, reaction: key });
      if (error) toast.error(error.message);
    }
  };

  const addComment = async (post: Post, text: string) => {
    const { data, error } = await sb.from("feed_comments").insert({ post_id: post.id, author_id: me.userId, content: text }).select("id, post_id, author_id, content, created_at").single();
    if (error) return toast.error(error.message), false;
    await people.load([me.userId]);
    setComments((m) => new Map(m).set(post.id, [...(m.get(post.id) ?? []), data as Comment]));
    toast.ok("แสดงความคิดเห็นแล้ว");
    return true;
  };

  const deleteComment = async (c: Comment) => {
    if (!(await confirm("ลบความคิดเห็นนี้?", { danger: true, confirmText: "ลบ" }))) return;
    const { error } = await sb.from("feed_comments").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    setComments((m) => new Map(m).set(c.post_id, (m.get(c.post_id) ?? []).filter((x) => x.id !== c.id)));
    toast.ok("ลบความคิดเห็นแล้ว");
  };

  const setHidden = async (post: Post, hidden: boolean) => {
    const { error } = await sb.from("feed_posts").update({ is_hidden: hidden }).eq("id", post.id);
    if (error) return toast.error(error.message);
    setPosts((l) => l.map((p) => (p.id === post.id ? { ...p, is_hidden: hidden } : p)));
    toast.ok(hidden ? "ซ่อนโพสต์แล้ว พนักงานจะไม่เห็นโพสต์นี้" : "แสดงโพสต์แล้ว");
  };

  const deletePost = async (post: Post) => {
    if (!(await confirm("ลบโพสต์นี้พร้อมความคิดเห็นทั้งหมด?", { danger: true, confirmText: "ลบโพสต์" }))) return;
    const { error } = await sb.from("feed_posts").delete().eq("id", post.id);
    if (error) return toast.error(error.message);
    setPosts((l) => l.filter((p) => p.id !== post.id));
    toast.ok("ลบโพสต์แล้ว");
  };

  const unread = (anns ?? []).filter((a) => !a.read_at).length;

  return (
    <div className={clsx("flex flex-col gap-4", variant === "desktop" && "mx-auto w-full max-w-2xl")}>
      {/* announcements */}
      {anns && anns.length > 0 && (
        <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-white">
          <header className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Megaphone className="size-4 text-jade-600" /> ประกาศจากบริษัท</h2>
            {unread > 0 && <Badge color="amber">ยังไม่อ่าน {unread}</Badge>}
          </header>
          <ul>
            {anns.slice(0, 5).map((a) => (
              <li key={a.id} className="border-b border-line-soft last:border-0">
                <button type="button" onClick={() => markRead(a)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-jade-50/60 active:bg-jade-50">
                  <span className={clsx("mt-1.5 size-2 shrink-0 rounded-full", a.read_at ? "bg-transparent" : "bg-amber-500")} aria-label={a.read_at ? "อ่านแล้ว" : "ยังไม่อ่าน"} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {a.is_pinned && <Pin className="size-3.5 shrink-0 text-jade-600" aria-label="ปักหมุด" />}
                      <span className={clsx("truncate", !a.read_at && "font-semibold")}>{a.title}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-sm text-ink-soft">{a.content}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-mute">{timeAgo(a.publish_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Composer variant={variant} onPosted={(p) => (setPosts((l) => [p, ...l]), loadExtras([p]))} dir={dir} />

      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          author={people.get(p.author_id)}
          people={people}
          kudos={(p.kudos_to ?? []).map((id) => empById.get(id)).filter(Boolean) as DirRow[]}
          comments={comments.get(p.id) ?? []}
          reactions={reactions.get(p.id) ?? []}
          myId={me.userId}
          isHr={isHr}
          canDelete={p.author_id === me.userId || can("tools", "delete")}
          onReact={(k) => react(p, k)}
          onComment={(t) => addComment(p, t)}
          onDeleteComment={deleteComment}
          onHide={(h) => setHidden(p, h)}
          onDelete={() => deletePost(p)}
          compact={variant === "mobile"}
        />
      ))}

      <div ref={sentinel} className="flex justify-center py-4 text-sm text-ink-mute">
        {loading ? <Spinner /> : done ? (posts.length ? "แสดงครบทุกโพสต์แล้ว" : "ยังไม่มีโพสต์ — เริ่มแชร์เรื่องราวดี ๆ ในทีมได้เลย") : null}
      </div>

      <Modal open={!!openAnn} onClose={() => setOpenAnn(null)} title={openAnn?.title ?? ""} size="lg">
        {openAnn && (
          <div className="flex flex-col gap-3">
            <div className="text-sm text-ink-mute">{thDateTime(openAnn.publish_at)}{openAnn.author_name ? ` · ${openAnn.author_name}` : ""}</div>
            {openAnn.image_url && (
               
              <img src={openAnn.image_url} alt="" className="max-h-96 w-full rounded-[var(--radius-ctl)] object-contain bg-paper" />
            )}
            <RichText text={openAnn.content} className="text-[15px] leading-relaxed" />
            {openAnn.attachments?.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {openAnn.attachments.map((f) => (
                  <li key={f.url}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-jade-700 underline">
                      <Paperclip className="size-4" /> {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}

// ------------------------------------------------------------------ composer
function Composer({ variant, onPosted, dir }: { variant: string; onPosted: (p: Post) => void; dir: ReturnType<typeof useDirectory> }) {
  const sb = supabaseBrowser();
  const me = useMe();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [kudos, setKudos] = useState<DirRow[]>([]);
  const [mode, setMode] = useState<"post" | "kudos">("post");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    const imgs = [...(list ?? [])].filter((f) => f.type.startsWith("image/"));
    if (files.length + imgs.length > 4) toast.info("แนบรูปได้สูงสุด 4 รูปต่อโพสต์");
    setFiles((f) => [...f, ...imgs.slice(0, 4 - f.length).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  const submit = async () => {
    const content = text.trim();
    if (!content && !files.length) return toast.error("พิมพ์ข้อความหรือแนบรูปก่อนโพสต์");
    if (mode === "kudos" && !kudos.length) return toast.error("เลือกเพื่อนร่วมงานที่ต้องการชื่นชมอย่างน้อย 1 คน");
    setBusy(true);
    try {
      const images: string[] = [];
      for (const f of files) {
        const blob = await resizeImage(f.file, 1280, 0.82);
        const up = await uploadFile("public", blob, { folder: "feed", name: "photo.jpg" });
        images.push(up.url);
      }
      const { data, error } = await sb
        .from("feed_posts")
        .insert({ author_id: me.userId, content: content || null, images: images.length ? images : null, post_type: mode, kudos_to: mode === "kudos" ? kudos.map((k) => k.id) : null })
        .select("id, author_id, content, images, post_type, kudos_to, is_hidden, created_at")
        .single();
      if (error) throw error;
      onPosted(data as Post);
      setText("");
      setFiles([]);
      setKudos([]);
      setMode("post");
      toast.ok(mode === "kudos" ? "ส่งคำชื่นชมแล้ว" : "โพสต์แล้ว");
    } catch (e) {
      toast.error(`โพสต์ไม่สำเร็จ: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-white p-3">
      <div className="mb-2 flex gap-1.5">
        {(["post", "kudos"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => (setMode(m), m === "kudos" && dir.ensure())}
            className={clsx("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm", mode === m ? "border-jade-600 bg-jade-50 font-medium text-jade-800" : "border-line text-ink-soft")}
          >
            {m === "post" ? <MessageCircle className="size-4" /> : <Award className="size-4" />}
            {m === "post" ? "โพสต์" : "ชื่นชมเพื่อน"}
          </button>
        ))}
      </div>
      {mode === "kudos" && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-[var(--radius-ctl)] border border-amber-200 bg-amber-50 px-2.5 py-2">
          <span className="text-sm text-amber-ink">ชื่นชม:</span>
          {kudos.map((k) => (
            <span key={k.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-sm ring-1 ring-amber-200">
              {k.first_name} {k.nickname ? `(${k.nickname})` : ""}
              <button type="button" aria-label={`เอา ${k.first_name} ออก`} onClick={() => setKudos((l) => l.filter((x) => x.id !== k.id))}><X className="size-3.5 text-ink-mute" /></button>
            </span>
          ))}
          <button type="button" onClick={() => setPick(true)} className="h-7 rounded-full px-2 text-sm font-medium text-amber-ink underline underline-offset-2">+ เลือกเพื่อนร่วมงาน</button>
        </div>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={mode === "kudos" ? "บอกเหตุผลที่อยากชื่นชม เช่น ช่วยแก้ปัญหาเครื่องจักรจนงานส่งทันเวลา" : `${me.employee?.nickname || me.employee?.first_name || "คุณ"} มีอะไรอยากแชร์กับเพื่อน ๆ`}
        className={clsx("border-0 px-1 focus:ring-0", variant === "mobile" ? "min-h-20" : "min-h-16")}
        maxLength={3000}
      />
      {files.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={f.preview} className="relative aspect-square overflow-hidden rounded-md bg-paper">
              { }
              <img src={f.preview} alt="" className="size-full object-cover" />
              <button type="button" aria-label="ลบรูป" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"><X className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        <Button variant="ghost" size="sm" icon={<ImagePlus className="size-4" />} onClick={() => fileRef.current?.click()} disabled={files.length >= 4}>
          รูปภาพ {files.length ? `(${files.length}/4)` : ""}
        </Button>
        <Button size={variant === "mobile" ? "md" : "sm"} icon={<Send className="size-4" />} loading={busy} onClick={submit}>
          โพสต์
        </Button>
      </div>
      <KudosPicker open={pick} onClose={() => setPick(false)} rows={dir.rows} selected={kudos} onChange={setKudos} myEmpId={me.employeeId} />
    </section>
  );
}

function KudosPicker({ open, onClose, rows, selected, onChange, myEmpId }: { open: boolean; onClose: () => void; rows: DirRow[] | null; selected: DirRow[]; onChange: (r: DirRow[]) => void; myEmpId: number | null }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => r.id !== myEmpId && (!t || `${r.first_name} ${r.last_name} ${r.nickname ?? ""} ${r.code}`.toLowerCase().includes(t))).slice(0, 60);
  }, [rows, q, myEmpId]);
  const sel = new Set(selected.map((s) => s.id));
  return (
    <Modal open={open} onClose={onClose} title="เลือกเพื่อนร่วมงานที่ต้องการชื่นชม" size="sm" footer={<Button onClick={onClose}>เสร็จ ({selected.length})</Button>}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ ชื่อเล่น หรือรหัส" className="mb-2 h-10 w-full rounded-[var(--radius-ctl)] border border-line px-3 text-[15px] focus:border-jade-500 focus:outline-none" />
      {!rows ? <Spinner /> : (
        <ul className="max-h-80 overflow-y-auto">
          {list.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onChange(sel.has(r.id) ? selected.filter((s) => s.id !== r.id) : [...selected, r])} className={clsx("flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-jade-50", sel.has(r.id) && "bg-jade-50")}>
                <Avatar src={r.photo_url} name={`${r.first_name} ${r.last_name}`} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{r.first_name} {r.last_name} {r.nickname ? `(${r.nickname})` : ""}</span>
                  <span className="block truncate text-xs text-ink-mute">{r.position_name ?? r.org_unit_name ?? r.code}</span>
                </span>
                <input type="checkbox" readOnly checked={sel.has(r.id)} className="size-4 accent-jade-600" tabIndex={-1} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ post card
function PostCard(props: {
  post: Post; author: ReturnType<ReturnType<typeof usePeople>["get"]>; people: ReturnType<typeof usePeople>; kudos: DirRow[]; comments: Comment[]; reactions: Reaction[];
  myId: string; isHr: boolean; canDelete: boolean; compact: boolean;
  onReact: (k: string) => void; onComment: (t: string) => Promise<boolean>; onDeleteComment: (c: Comment) => void; onHide: (h: boolean) => void; onDelete: () => void;
}) {
  const { post: p, author, kudos, comments, reactions, myId } = props;
  const [showComments, setShowComments] = useState(comments.length > 0 && comments.length <= 2);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const meta = TYPE_META[p.post_type];
  const mine = reactions.find((r) => r.user_id === myId)?.reaction;
  const counts = REACTIONS.map((r) => ({ ...r, n: reactions.filter((x) => x.reaction === r.key).length })).filter((r) => r.n > 0);
  const auto = ["birthday", "anniversary", "welcome", "system"].includes(p.post_type);

  return (
    <article className={clsx("rounded-[var(--radius-panel)] border bg-white", p.is_hidden ? "border-dashed border-rust/40 opacity-75" : "border-line")}>
      <header className="flex items-start gap-3 px-4 pt-3">
        {auto ? (
          <span className={clsx("grid size-10 shrink-0 place-items-center rounded-full border", meta?.tone)}>{meta && <meta.icon className="size-5" />}</span>
        ) : (
          <Avatar src={author.photo} name={author.name} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium">{auto ? meta?.label : author.name}</span>
            {meta && !auto && <Badge color="amber">{meta.label}</Badge>}
            {p.is_hidden && <Badge color="red">ซ่อนอยู่</Badge>}
          </div>
          <div className="text-xs text-ink-mute" title={thDateTime(p.created_at)}>{timeAgo(p.created_at)}{!auto && author.position ? ` · ${author.position}` : ""}</div>
        </div>
        <div className="flex shrink-0 items-center">
          {props.isHr && (
            <button type="button" onClick={() => props.onHide(!p.is_hidden)} className="rounded p-2 text-ink-mute hover:bg-paper hover:text-ink" aria-label={p.is_hidden ? "แสดงโพสต์" : "ซ่อนโพสต์"} title={p.is_hidden ? "แสดงโพสต์" : "ซ่อนโพสต์"}>
              {p.is_hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
          )}
          {props.canDelete && (
            <button type="button" onClick={props.onDelete} className="rounded p-2 text-ink-mute hover:bg-paper hover:text-rust" aria-label="ลบโพสต์" title="ลบโพสต์">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </header>

      {(p.post_type === "kudos" || auto) && kudos.length > 0 && (
        <div className={clsx("mx-4 mt-3 rounded-[var(--radius-ctl)] border px-3 py-3", meta?.tone ?? "border-line")}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {meta && <meta.icon className="size-4" />}
            {p.post_type === "kudos" ? "ส่งคำชื่นชมถึง" : p.post_type === "birthday" ? "สุขสันต์วันเกิด" : p.post_type === "welcome" ? "ยินดีต้อนรับ" : "ขอแสดงความยินดีกับ"}
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {kudos.map((k) => (
              <span key={k.id} className="flex items-center gap-2">
                <Avatar src={k.photo_url} name={`${k.first_name} ${k.last_name}`} size={32} />
                <span className="text-sm leading-tight">
                  <span className="block font-medium">{k.first_name} {k.nickname ? `(${k.nickname})` : ""}</span>
                  <span className="block text-xs opacity-80">{k.position_name ?? ""}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {p.content && <RichText text={p.content} className="px-4 pt-3 text-[15px] leading-relaxed" />}

      {p.images && p.images.length > 0 && (
        <div className={clsx("mt-3 grid gap-0.5", p.images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {p.images.map((src, i) => (
            <button key={src} type="button" onClick={() => setZoom(src)} className={clsx("overflow-hidden bg-paper", p.images!.length === 3 && i === 0 && "col-span-2")}>
              { }
              <img src={src} alt="" loading="lazy" className={clsx("w-full object-cover", p.images!.length === 1 ? "max-h-[28rem]" : "aspect-[4/3]")} />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between px-4 pt-2 text-xs text-ink-mute">
        <span className="flex items-center gap-1">{counts.map((c) => <span key={c.key}>{c.emoji} {c.n}</span>)}</span>
        {comments.length > 0 && <button type="button" onClick={() => setShowComments((v) => !v)} className="hover:underline">ความคิดเห็น {comments.length}</button>}
      </div>

      <div className="mx-2 mt-1 flex border-t border-line-soft py-1">
        {REACTIONS.map((r) => (
          <button key={r.key} type="button" onClick={() => props.onReact(r.key)} aria-pressed={mine === r.key}
            className={clsx("flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-sm hover:bg-paper", mine === r.key ? "font-semibold text-jade-700" : "text-ink-soft")}>
            <span className="text-base leading-none">{r.emoji}</span> {r.label}
          </button>
        ))}
        <button type="button" onClick={() => setShowComments(true)} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-sm text-ink-soft hover:bg-paper">
          <MessageCircle className="size-4" /> {props.compact ? "" : "แสดงความคิดเห็น"}
        </button>
      </div>

      {showComments && (
        <div className="border-t border-line-soft px-4 py-3">
          <ul className="flex flex-col gap-2.5">
            {comments.map((c) => {
              const a = props.people.get(c.author_id);
              return (
                <li key={c.id} className="flex gap-2">
                  <Avatar src={a.photo} name={a.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="inline-block max-w-full rounded-2xl bg-paper px-3 py-1.5">
                      <div className="text-sm font-medium">{a.name}</div>
                      <RichText text={c.content} className="text-sm break-words" />
                    </div>
                    <div className="mt-0.5 flex gap-3 px-2 text-xs text-ink-mute">
                      <span>{timeAgo(c.created_at)}</span>
                      {(c.author_id === myId || props.isHr) && <button type="button" className="hover:text-rust" onClick={() => props.onDeleteComment(c)}>ลบ</button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              setSending(true);
              if (await props.onComment(text.trim())) setText("");
              setSending(false);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="เขียนความคิดเห็น" maxLength={1000}
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-paper px-4 text-[15px] focus:border-jade-500 focus:bg-white focus:outline-none" />
            <Button type="submit" size="md" variant="subtle" loading={sending} aria-label="ส่งความคิดเห็น" icon={<Send className="size-4" />} />
          </form>
        </div>
      )}
      {zoom && (
        <Modal open onClose={() => setZoom(null)} title="รูปภาพ" size="xl">
          { }
          <img src={zoom} alt="" className="mx-auto max-h-[75vh] object-contain" />
        </Modal>
      )}
    </article>
  );
}

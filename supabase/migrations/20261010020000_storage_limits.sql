-- =====================================================================
-- GO HR — Storage hardening: size and MIME limits per bucket                 (idempotent)
--
--   Until now every bucket accepted any file type and size. Public buckets (public, avatars) serve files
--   without authentication, so an uploaded SVG / HTML file would run as a script on the HR domain.
--   Limits are enforced by the Storage API itself (storage.buckets.file_size_limit / allowed_mime_types);
--   lib/upload-rules.ts mirrors them on the client for friendlier error messages.
-- =====================================================================
do $$
declare
  img  text[] := array['image/jpeg','image/png','image/webp'];
  docs text[] := array['image/jpeg','image/png','image/webp','application/pdf',
                       'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                       'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                       'text/csv','text/plain'];
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets')
     and exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    -- โลโก้ รูปข่าว ปกคอร์ส และสื่อการสอน (PDF / วิดีโอ / สไลด์) — เปิดอ่านได้ทุกคน จึงห้าม SVG / HTML เด็ดขาด
    update storage.buckets set file_size_limit = 200 * 1024 * 1024,
           allowed_mime_types = img || array['application/pdf','video/mp4','video/webm','video/quicktime',
                                             'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation']
     where id = 'public';
    update storage.buckets set file_size_limit = 5 * 1024 * 1024,  allowed_mime_types = img  where id = 'avatars';
    update storage.buckets set file_size_limit = 3 * 1024 * 1024,  allowed_mime_types = img  where id = 'checkins';
    update storage.buckets set file_size_limit = 20 * 1024 * 1024, allowed_mime_types = docs where id in ('documents','attachments');
    update storage.buckets set file_size_limit = 5 * 1024 * 1024,
           allowed_mime_types = array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'] || img
     where id = 'resumes';
  end if;
end $$;

-- GO HR — demo data for Recruitment / Probation / Learning / Performance / Warning letters.
-- Safe to run more than once (each block checks whether its demo rows already exist).
-- psql -h 127.0.0.1 -p 54322 -U postgres -d hr -f scripts/seed-talent-demo.sql

-- ------------------------------------------------------------ job postings + applicants
do $$
declare j1 bigint; j2 bigint; a bigint;
begin
  if exists (select 1 from job_postings where slug in ('prod-op-bsd','qc-insp-ry')) then return; end if;
  insert into job_postings(slug, title, position_id, org_unit_id, branch_id, headcount, employment_type, salary_min, salary_max, show_salary, location_text, description, qualifications, benefits, questions, status, open_date, close_date, hiring_manager_id)
  values ('prod-op-bsd', 'พนักงานฝ่ายผลิต (ทำงานเป็นกะ)', 8, 6, 1, 5, 'daily', 400, 450, true, 'บางเสาธง สมุทรปราการ',
    E'ควบคุมเครื่องจักรในไลน์ผลิตชิ้นส่วนพลาสติก\nตรวจสอบคุณภาพชิ้นงานเบื้องต้นตามมาตรฐาน\nบันทึกยอดผลิตประจำกะ\nดูแลความสะอาดพื้นที่ทำงานตามหลัก 5ส',
    E'เพศชาย/หญิง อายุ 18–40 ปี\nวุฒิ ม.3 ขึ้นไป\nทำงานเป็นกะได้ (เช้า/ดึก)\nมีประสบการณ์โรงงานจะพิจารณาเป็นพิเศษ',
    E'ค่าแรง 400–450 บาท/วัน + OT\nเบี้ยขยัน 500–700 บาท/เดือน\nรถรับส่งพนักงาน\nอาหารกลางวันฟรี\nประกันสังคม + ประกันอุบัติเหตุกลุ่ม\nโบนัสประจำปี',
    '[{"key":"shift","label":"สามารถทำงานเป็นกะ (เช้า/ดึก) ได้หรือไม่","type":"yesno","required":true},{"key":"transport","label":"เดินทางมาทำงานอย่างไร","type":"select","required":false,"options":["รถรับส่งบริษัท","รถส่วนตัว","รถสาธารณะ"]},{"key":"factory_exp","label":"เคยทำงานโรงงานประเภทใดบ้าง","type":"textarea","required":false}]',
    'open', current_date - 20, current_date + 40, 7)
  returning id into j1;
  insert into job_postings(slug, title, position_id, org_unit_id, branch_id, headcount, employment_type, salary_min, salary_max, show_salary, location_text, description, qualifications, benefits, questions, status, open_date, close_date, hiring_manager_id)
  values ('qc-insp-ry', 'เจ้าหน้าที่ควบคุมคุณภาพ (QC Inspector)', 9, 8, 2, 2, 'monthly', 15000, 18000, true, 'โรงงาน 2 ระยอง',
    E'ตรวจสอบคุณภาพวัตถุดิบ ระหว่างผลิต และสินค้าสำเร็จรูป\nใช้เครื่องมือวัด (เวอร์เนีย ไมโครมิเตอร์)\nจัดทำรายงาน NCR และติดตามการแก้ไข',
    E'วุฒิ ปวส. ขึ้นไป สาขาอุตสาหการ / เครื่องกล หรือที่เกี่ยวข้อง\nมีประสบการณ์งาน QC อย่างน้อย 1 ปี\nมีความรู้ ISO 9001 / IATF 16949 จะพิจารณาเป็นพิเศษ',
    E'เงินเดือน 15,000–18,000 บาท\nค่าครองชีพ 1,000 บาท\nกองทุนสำรองเลี้ยงชีพ\nตรวจสุขภาพประจำปี\nวันหยุดพักร้อน 6–10 วัน',
    '[{"key":"iso","label":"มีความรู้ระบบ ISO 9001 หรือ IATF 16949 หรือไม่","type":"yesno","required":true},{"key":"tools","label":"เครื่องมือวัดที่ใช้งานเป็น","type":"text","required":false}]',
    'open', current_date - 10, current_date + 30, 8)
  returning id into j2;

  insert into applicants(posting_id, prefix, first_name, last_name, nickname, phone, email, birth_date, gender, education_level, institution, major, experience_years, last_company, last_position, expected_salary, available_date, answers, source, stage, rating, tags, consent_pdpa, created_at)
  values
   (j1,'นาย','อภิสิทธิ์','แสงทอง','บอย','0812345601','apisit.s@example.com','1998-04-12','M','ม.6','โรงเรียนบางพลีราษฎร์บำรุง',null,3,'บจก. ไทยพลาสติกอินดัสทรี','พนักงานคุมเครื่องฉีด',13500,current_date + 7,'{"shift":true,"transport":"รถรับส่งบริษัท","factory_exp":"โรงงานฉีดพลาสติก 3 ปี"}','careers','interview',4,'{ฉีดพลาสติก,ทำกะได้}',true, now() - interval '12 days'),
   (j1,'นางสาว','สุนิสา','ใจดี','นิด','0812345602',null,'2001-09-03','F','ปวช.','วิทยาลัยเทคนิคสมุทรปราการ','ช่างกลโรงงาน',1.5,'บจก. สยามออโต้พาร์ท','พนักงานประกอบ',12500,current_date + 14,'{"shift":true,"transport":"รถส่วนตัว"}','careers','screening',3,null,true, now() - interval '6 days'),
   (j1,'นาย','ธนวัฒน์','ศรีสวัสดิ์','เอก','0812345603','thanawat@example.com','1995-01-22','M','ม.3',null,null,6,'บจก. เอเชียแพ็คเกจจิ้ง','หัวหน้ากะ',15000,current_date + 30,'{"shift":true,"transport":"รถรับส่งบริษัท","factory_exp":"บรรจุภัณฑ์ 6 ปี เคยคุมทีม 8 คน"}','referral','offer',5,'{มีประสบการณ์คุมทีม}',true, now() - interval '15 days'),
   (j1,'นาง','มาลัย','บุญประเสริฐ',null,'0812345604',null,'1990-07-30','F','ม.3',null,null,8,'บจก. ไทยการ์เมนต์','พนักงานเย็บ',12000,current_date + 3,'{"shift":false,"transport":"รถสาธารณะ"}','walk-in','rejected',2,null,true, now() - interval '18 days'),
   (j1,'นาย','กฤษดา','พรมวงศ์','ต้น','0812345605',null,'2003-11-11','M','ม.6',null,null,0,null,null,11000,current_date + 1,'{"shift":true,"transport":"รถรับส่งบริษัท"}','facebook','applied',null,null,true, now() - interval '1 day'),
   (j2,'นางสาว','ปิยะนุช','รัตนพันธ์','แพร','0812345606','piyanut.r@example.com','1997-02-14','F','ปริญญาตรี','มหาวิทยาลัยบูรพา','วิศวกรรมอุตสาหการ',3,'บจก. อีสเทิร์นออโต้','QC Inspector',18000,current_date + 30,'{"iso":true,"tools":"เวอร์เนีย ไมโครมิเตอร์ CMM เบื้องต้น"}','jobthai','assessment',4,'{IATF 16949}',true, now() - interval '8 days'),
   (j2,'นาย','วีรยุทธ','คงมั่น','บอส','0812345607','weerayut@example.com','1999-06-05','M','ปวส.','วิทยาลัยเทคนิคระยอง','เทคนิคการผลิต',1,'บจก. ระยองเมทัลเวิร์ค','พนักงาน QC',15500,current_date + 15,'{"iso":false,"tools":"เวอร์เนีย"}','careers','applied',3,null,true, now() - interval '2 days'),
   (null,'นางสาว','จิราพร','ทองสุข','จิ๊บ','0812345608','jiraporn@example.com','1996-12-01','F','ปริญญาตรี','มหาวิทยาลัยราชภัฏราชนครินทร์','บริหารธุรกิจ',2,'บจก. ซีพีเอฟ','ธุรการฝ่ายผลิต',16000,null,'{}','walk-in','talent_pool',4,'{ธุรการ}',true, now() - interval '30 days');

  -- history
  for a in select id from applicants where posting_id in (j1, j2) or (posting_id is null and phone = '0812345608') loop
    insert into applicant_activities(applicant_id, activity_type, to_stage, note, created_at)
    select a, 'stage_change', stage, case stage when 'rejected' then 'ไม่สามารถทำงานกะดึกได้' when 'offer' then 'เสนอเงินเดือน 450 บาท/วัน รอตอบรับภายใน 3 วัน' else null end, created_at + interval '2 days'
      from applicants where id = a and stage <> 'applied';
  end loop;
  insert into interviews(applicant_id, round, scheduled_at, duration_min, mode, location, interviewer_ids, scores, result, comment)
  select id, 1, date_trunc('day', now()) + interval '2 days 10 hours', 45, 'onsite', 'ห้องประชุมเล็ก อาคารสำนักงาน', '{7,2}', '{}', null, null from applicants where phone = '0812345601';
  insert into interviews(applicant_id, round, scheduled_at, duration_min, mode, location, interviewer_ids, scores, result, comment)
  select id, 1, now() - interval '5 days', 60, 'onsite', 'ห้องประชุม 1', '{7,6}', '{"7":{"score":5,"comment":"มีประสบการณ์คุมทีมจริง ตอบคำถามเรื่องความปลอดภัยได้ดี"},"6":{"score":4,"comment":"เหมาะเป็นหัวหน้ากะในอนาคต"}}', 'pass', 'ผ่าน เสนอจ้าง' from applicants where phone = '0812345603';
  insert into interviews(applicant_id, round, scheduled_at, duration_min, mode, meeting_url, interviewer_ids, scores, result)
  select id, 1, now() - interval '3 days', 45, 'online', 'https://meet.google.com/abc-defg-hij', '{8,2}', '{"8":{"score":4,"comment":"ความรู้ IATF ดี"}}', 'pass' from applicants where phone = '0812345606';
end $$;

-- ------------------------------------------------------------ e-library, courses, classroom training
do $$
declare l1 bigint; l2 bigint; l3 bigint; l4 bigint; c1 bigint; c2 bigint; s1 bigint;
begin
  if exists (select 1 from courses where code in ('SAF-101','QA-201')) then return; end if;
  insert into library_items(title, item_type, url, category, duration_min) values ('ความปลอดภัยในการทำงานกับเครื่องจักร', 'youtube', 'https://www.youtube.com/watch?v=9G0dNpGI8qk', 'ความปลอดภัย', 8) returning id into l1;
  insert into library_items(title, item_type, url, category, duration_min) values ('การใช้อุปกรณ์ป้องกันอันตรายส่วนบุคคล (PPE)', 'youtube', 'https://www.youtube.com/watch?v=Hb5BjUeeKvw', 'ความปลอดภัย', 6) returning id into l2;
  insert into library_items(title, item_type, content, category, duration_min) values ('ขั้นตอนเมื่อเกิดเหตุฉุกเฉินในโรงงาน', 'article',
    E'1. หยุดเครื่องจักรด้วยปุ่ม Emergency Stop สีแดง\n2. แจ้งหัวหน้างานและเจ้าหน้าที่ความปลอดภัย (จป.) ทันที โทรภายใน 199\n3. หากเกิดไฟไหม้ ใช้ถังดับเพลิงตามหลัก ดึง-ปลด-กด-ส่าย และอพยพทางออกฉุกเฉินที่ใกล้ที่สุด\n4. ไปรวมตัวที่จุดรวมพล (ลานจอดรถด้านหน้าอาคาร) เพื่อตรวจนับจำนวน\n5. ห้ามกลับเข้าพื้นที่จนกว่าจะได้รับอนุญาต', 'ความปลอดภัย', 5) returning id into l3;
  insert into library_items(title, item_type, content, category, duration_min) values ('หลัก 5ส ในพื้นที่ผลิต', 'article',
    E'สะสาง — แยกของที่จำเป็นออกจากของที่ไม่จำเป็น\nสะดวก — จัดวางของให้หยิบใช้ง่าย มีป้ายบอกตำแหน่ง\nสะอาด — ทำความสะอาดเครื่องจักรและพื้นที่ก่อนและหลังเลิกงาน\nสุขลักษณะ — รักษามาตรฐาน 3ส แรกอย่างสม่ำเสมอ\nสร้างนิสัย — ทำจนเป็นนิสัย ตรวจติดตามทุกสัปดาห์', 'คุณภาพ / ISO', 4) returning id into l4;
  insert into library_items(title, item_type, url, category, duration_min) values ('คู่มือพนักงาน 2569', 'link', 'https://example.com/handbook-2569.pdf', 'ระเบียบบริษัท', 20);

  insert into courses(code, title, description, category, hours, pass_score, quiz, audience, is_mandatory, due_days, is_published)
  values ('SAF-101', 'ความปลอดภัยในโรงงานสำหรับพนักงานใหม่', 'หลักสูตรบังคับตามกฎหมายความปลอดภัย อาชีวอนามัย และสภาพแวดล้อมในการทำงาน สำหรับพนักงานใหม่ทุกคน', 'ความปลอดภัย', 3, 70,
    '[{"q":"เมื่อเครื่องจักรทำงานผิดปกติ สิ่งแรกที่ต้องทำคืออะไร","choices":["ซ่อมเองทันที","กดปุ่มหยุดฉุกเฉินแล้วแจ้งหัวหน้า","ทำงานต่อจนจบกะ","ถอดปลั๊กแล้วกลับบ้าน"],"answer":1},
      {"q":"อุปกรณ์ใดเป็น PPE ที่ต้องใช้ในไลน์ผลิต","choices":["หูฟังเพลง","แว่นตานิรภัยและรองเท้าเซฟตี้","นาฬิกาข้อมือ","ถุงมือผ้าขาด ๆ"],"answer":1},
      {"q":"หลักการใช้ถังดับเพลิงคือข้อใด","choices":["ดึง-ปลด-กด-ส่าย","กด-ดึง-ส่าย-ปลด","ส่าย-กด-ดึง-ปลด","ปลด-ส่าย-ดึง-กด"],"answer":0},
      {"q":"จุดรวมพลของบริษัทอยู่ที่ใด","choices":["โรงอาหาร","ลานจอดรถด้านหน้าอาคาร","ห้องน้ำ","ในไลน์ผลิต"],"answer":1}]',
    '{"all":true}', true, 30, true) returning id into c1;
  insert into course_lessons(course_id, library_item_id, title, sort_order, min_minutes) values
    (c1, l1, 'ความปลอดภัยในการทำงานกับเครื่องจักร', 1, 1),
    (c1, l2, 'อุปกรณ์ป้องกันอันตรายส่วนบุคคล (PPE)', 2, 1),
    (c1, l3, 'เมื่อเกิดเหตุฉุกเฉิน', 3, 0);

  insert into courses(code, title, description, category, hours, pass_score, quiz, audience, is_mandatory, due_days, is_published)
  values ('QA-201', 'พื้นฐานระบบคุณภาพและ 5ส', 'ทำความเข้าใจหลัก 5ส และบทบาทของพนักงานในระบบ ISO 9001', 'คุณภาพ / ISO', 2, 60,
    '[{"q":"ส ที่หมายถึงการแยกของที่ไม่จำเป็นออกคือข้อใด","choices":["สะสาง","สะดวก","สะอาด","สร้างนิสัย"],"answer":0},
      {"q":"ใครมีหน้าที่รักษามาตรฐาน 5ส ในพื้นที่ทำงาน","choices":["เฉพาะหัวหน้างาน","เฉพาะแม่บ้าน","พนักงานทุกคน","ผู้ตรวจ ISO"],"answer":2}]',
    '{"all":false,"org_unit_ids":[5,6,7,8,9],"position_ids":[]}', false, null, true) returning id into c2;
  insert into course_lessons(course_id, library_item_id, title, content, sort_order, min_minutes) values
    (c2, l4, 'หลัก 5ส ในพื้นที่ผลิต', null, 1, 0),
    (c2, null, 'ระบบคุณภาพ ISO 9001 กับงานของเรา', E'ISO 9001 คือมาตรฐานระบบบริหารงานคุณภาพ ลูกค้าเชื่อมั่นว่าสินค้าของเราได้คุณภาพสม่ำเสมอ\n\nสิ่งที่พนักงานทำได้:\n• ทำงานตามวิธีปฏิบัติงาน (WI) ที่ติดอยู่หน้าเครื่อง\n• บันทึกข้อมูลการผลิตให้ครบถ้วนและถูกต้อง\n• พบของเสียให้แยกและติดป้ายทันที แจ้ง QC\n• เสนอแนะการปรับปรุง (Kaizen) ได้ทุกเมื่อ', 2, 0);

  -- assign SAF-101 to recent hires (and E0011 for the demo), some progress
  insert into course_enrollments(course_id, employee_id, due_date, status, progress, completed_lessons, started_at)
  select c1, e.id, current_date + 30, 'enrolled', 0, '{}', null from employees e where e.hire_date >= current_date - 400 and e.status <> 'resigned'
  on conflict do nothing;
  update course_enrollments set status = 'completed', progress = 100, quiz_score = 100, attempts = 1, completed_lessons = (select array_agg(id) from course_lessons where course_id = c1), started_at = now() - interval '5 days', completed_at = now() - interval '4 days'
   where course_id = c1 and employee_id in (select id from employees where code in ('E0021','E0043'));
  update course_enrollments set status = 'in_progress', progress = 25, completed_lessons = (select array_agg(id) from (select id from course_lessons where course_id = c1 order by sort_order limit 1) x), started_at = now() - interval '1 day'
   where course_id = c1 and employee_id in (select id from employees where code in ('E0018','E0029'));
  insert into employee_trainings(employee_id, course_name, provider, start_date, end_date, hours, result, source, source_id)
  select employee_id, 'ความปลอดภัยในโรงงานสำหรับพนักงานใหม่', 'E-Learning', (started_at at time zone 'Asia/Bangkok')::date, (completed_at at time zone 'Asia/Bangkok')::date, 3, 'ผ่าน คะแนนแบบทดสอบ 100%', 'elearning', c1
    from course_enrollments where course_id = c1 and status = 'completed';

  insert into training_sessions(title, training_type, provider, trainer, location, start_at, end_at, hours, cost_total, capacity, is_dsd, status, description)
  values ('การขับรถยก (Forklift) อย่างปลอดภัย', 'external', 'สถาบันพัฒนาฝีมือแรงงาน ภาค 1', 'อ.สมศักดิ์ วงศ์ใหญ่', 'ห้องอบรม อาคาร 2 + ลานฝึกหลังคลังสินค้า',
          (current_date + 9 + time '08:30') at time zone 'Asia/Bangkok', (current_date + 9 + time '16:30') at time zone 'Asia/Bangkok', 7, 24000, 12, true, 'open',
          'ภาคทฤษฎีกฎหมายความปลอดภัยรถยก การตรวจเช็คก่อนใช้งาน และภาคปฏิบัติการยก-วางสินค้า มีใบรับรองหลังผ่านการทดสอบ') returning id into s1;
  insert into training_attendees(session_id, employee_id, status) select s1, id, 'registered' from employees where org_unit_id = 9 and status <> 'resigned';
  insert into training_attendees(session_id, employee_id, status) select s1, id, 'registered' from employees where code in ('E0010','E0023') on conflict do nothing;
  insert into training_sessions(title, training_type, provider, trainer, location, start_at, end_at, hours, cost_total, capacity, is_dsd, status)
  values ('ปฐมพยาบาลเบื้องต้นและ CPR', 'internal', null, 'พยาบาลประจำโรงงาน', 'ห้องประชุมใหญ่',
          (current_date - 20 + time '13:00') at time zone 'Asia/Bangkok', (current_date - 20 + time '16:00') at time zone 'Asia/Bangkok', 3, 3000, 30, false, 'done') returning id into s1;
  insert into training_attendees(session_id, employee_id, status, pre_score, post_score)
  select s1, id, case when id % 7 = 0 then 'absent' else 'attended' end, 40 + (id % 5) * 5, 75 + (id % 4) * 5 from employees where org_unit_id = 6 and status <> 'resigned';
end $$;

-- ------------------------------------------------------------ KPI profiles, annual cycle 2569, warning letter, probation evaluation
do $$
declare p bigint; c bigint; hr uuid;
begin
  if exists (select 1 from eval_cycles where name = 'ประเมินผลงานประจำปี 2569') then return; end if;
  select id into hr from profiles where username = 'hr';
  -- RPCs check app.has_perm(): act as the HR user inside this block
  perform set_config('request.jwt.claims', json_build_object('sub', hr, 'role', 'authenticated')::text, true);

  insert into kpi_profiles(name, position_id, description) values ('KPI พนักงานฝ่ายผลิต', 8, 'ใช้กับพนักงานฝ่ายผลิตทุกไลน์') returning id into p;
  insert into kpi_items(profile_id, name, unit, target, weight, direction, source, external_key, attendance_metric, scoring, sort_order) values
    (p, 'ยอดผลิตเฉลี่ยต่อกะ', 'ชิ้น', 1200, 40, 'higher', 'external', 'PROD_OUTPUT', null, '[{"min":110,"score":5},{"min":100,"score":4},{"min":90,"score":3},{"min":80,"score":2},{"min":0,"score":1}]', 1),
    (p, 'อัตราของเสีย', '%', 2, 30, 'lower', 'external', 'DEFECT_RATE', null, null, 2),
    (p, 'จำนวนครั้งที่มาสาย', 'ครั้ง', 3, 30, 'lower', 'attendance', null, 'late_count', null, 3);
  insert into kpi_profiles(name, position_id, description) values ('KPI หัวหน้าไลน์ผลิต', 7, 'หัวหน้าไลน์ — ผลผลิตของไลน์และการพัฒนาทีม') returning id into p;
  insert into kpi_items(profile_id, name, unit, target, weight, direction, source, external_key, sort_order) values
    (p, 'OEE ของไลน์', '%', 85, 50, 'higher', 'external', 'LINE_OEE', 1),
    (p, 'อุบัติเหตุถึงขั้นหยุดงาน', 'ครั้ง', 0, 25, 'lower', 'manual', null, 2),
    (p, 'ชั่วโมงอบรมลูกทีมเฉลี่ย', 'ชม./คน', 12, 25, 'higher', 'manual', null, 3);
  insert into kpi_profiles(name, org_unit_id, description) values ('KPI แผนกควบคุมคุณภาพ', 8, null) returning id into p;
  insert into kpi_items(profile_id, name, unit, target, weight, direction, source, sort_order) values
    (p, 'ข้อร้องเรียนคุณภาพจากลูกค้า', 'ครั้ง', 2, 60, 'lower', 'manual', 1),
    (p, 'ปิด NCR ตรงเวลา', '%', 95, 40, 'higher', 'manual', 2);

  insert into eval_cycles(name, eval_year, form_id, upward_form_id, start_date, end_date, period_from, period_to, self_eval, supervisor_eval, supervisor_weight, upward_eval, status)
  values ('ประเมินผลงานประจำปี 2569', 2026, (select id from eval_forms where form_type = 'annual' order by id limit 1), (select id from eval_forms where form_type = 'supervisor' order by id limit 1),
          current_date - 7, current_date + 30, '2026-01-01', '2026-12-31', true, true, 70, true, 'draft') returning id into c;
  perform public.eval_cycle_generate(c);
  perform public.eval_cycle_attendance_kpis(c);

  -- a few submitted evaluations (line 1 team of E0007 + E0007 self) with realistic scores
  update eval_assignments a set status = 'submitted', submitted_at = now() - interval '2 days',
         scores = (select jsonb_object_agg(k, 3 + ((a.employee_id + ascii(right(k,1)) + case a.relation when 'self' then 1 else 0 end) % 3)) from unnest(array['c1','c2','c3','c4','f1','f2']) k),
         answers = jsonb_build_object('ผลงานที่โดดเด่นในปีนี้', 'รักษายอดผลิตได้ตามเป้าตลอดปี', 'เป้าหมายการพัฒนาปีหน้า', 'เรียนหลักสูตรหัวหน้างาน'),
         comment = 'ทำงานดี มีความรับผิดชอบ'
   where a.cycle_id = c and a.relation in ('self','supervisor')
     and a.employee_id in (select id from employees where code in ('E0015','E0016','E0018','E0019','E0022','E0024','E0007'));
  update eval_assignments a set competency_score = (
      select round(sum((s->>'weight')::numeric * (select sum((cr->>'weight')::numeric / 100 * (a.scores->>(cr->>'key'))::numeric / f.scale_max) from jsonb_array_elements(s->'criteria') cr)), 2)
        from eval_forms f, jsonb_array_elements(f.sections) s where f.id = (select form_id from eval_cycles where id = c))
   where a.cycle_id = c and a.status = 'submitted';
  update eval_assignments set status = 'draft', scores = '{"c1":4,"c2":4}' where cycle_id = c and relation = 'supervisor' and employee_id = (select id from employees where code = 'E0026');
  -- external KPI actuals for the evaluated team
  update employee_kpis k set actual = case k.name when 'ยอดผลิตเฉลี่ยต่อกะ' then 1050 + (k.employee_id % 5) * 60 when 'อัตราของเสีย' then 1.5 + (k.employee_id % 4) * 0.4 when 'OEE ของไลน์' then 82 else k.actual end
   where k.cycle_id = c and k.name in ('ยอดผลิตเฉลี่ยต่อกะ','อัตราของเสีย','OEE ของไลน์')
     and k.employee_id in (select id from employees where code in ('E0015','E0016','E0018','E0019','E0022','E0024','E0007'));
  update employee_kpis k set score = app.kpi_score(k.actual, k.target, k.direction, i.scoring) from kpi_items i where i.id = k.kpi_item_id and k.cycle_id = c and k.actual is not null;
  perform public.eval_cycle_compute(c);   -- needs a competency score, so only the evaluated employees get a result
  update eval_cycles set status = 'open' where id = c;   -- keep it open for the demo (results already computed for the submitted ones)

  -- warning letter
  insert into warning_letters(employee_id, issue_date, level, offense, detail, incident_date, rule_reference, penalty, witness, issued_by)
  select id, current_date - 3, 'written_1', 'มาทำงานสายเกินกำหนด', 'มาทำงานสาย 4 ครั้งในเดือนกันยายน 2569 (วันที่ 3, 9, 17 และ 24) โดยไม่มีเหตุอันสมควรและไม่แจ้งหัวหน้างานล่วงหน้า', current_date - 13, 'หมวด 7 ข้อ 3.2 (การมาทำงานตรงเวลา)', 'งดเบี้ยขยันประจำเดือนกันยายน', 'นายวิทยา ทองคำ (หัวหน้าไลน์ผลิต 1)', hr
    from employees where code = 'E0011';

  -- probation evaluation for E0045 (supervisor E0007), pending
  insert into probation_evaluations(employee_id, form_id, round, evaluator_employee_id, due_date, status)
  select e.id, (select id from eval_forms where form_type = 'probation' order by id limit 1), 1, e.supervisor_id, e.probation_end_date - 7, 'pending' from employees e where e.code = 'E0045';
  insert into probation_evaluations(employee_id, form_id, round, evaluator_employee_id, due_date, status, scores, total_score, result, comment, submitted_at)
  select e.id, (select id from eval_forms where form_type = 'probation' order by id limit 1), 1, e.supervisor_id, e.probation_end_date - 7, 'submitted',
         '{"p1":4,"p2":4,"p3":3,"b1":5,"b2":4,"b3":4,"b4":4}', 80.5, 'pass', 'ปรับตัวได้เร็ว ปิดการขายได้ตามเป้าตั้งแต่เดือนที่ 2', now() - interval '1 day'
    from employees e where e.code = 'E0044';
end $$;

-- =====================================================================
-- GO HR — Base master data (safe to run once on a fresh install)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Role groups (7 กลุ่มตามมาตรฐาน + HR + EXEC)
-- ---------------------------------------------------------------------
insert into public.role_groups (code, name, description, data_scope, is_system, permissions) values
('HR', 'ฝ่ายบุคคล (HR Manager)', 'ดูแลข้อมูลบุคคลทั้งหมด ยกเว้นตั้งค่าความปลอดภัย', 'all', true,
 '{"org":["view","create","edit","delete","export"],"employee":["view","create","edit","delete","export"],"employee_private":["view","edit","export"],
   "attendance":["view","create","edit","delete","export"],"request_admin":["view","create","edit","approve","export"],"payroll":["view"],
   "report":["view","export"],"recruit":["view","create","edit","delete","export"],"learning":["view","create","edit","delete","export"],
   "performance":["view","create","edit","delete","export"],"tools":["view","create","edit","delete"],"insight":["view"],"settings":["view","edit"],"audit":["view"]}'),
('AUDIT', 'ตรวจสอบเวลาการทำงาน', 'ดูและส่งออกข้อมูลเวลาทำงาน', 'all', true,
 '{"attendance":["view","export"],"employee":["view"],"report":["view","export"]}'),
('EMPLOYEE', 'พนักงานทั่วไป', 'ใช้งาน Self-service ของตนเอง', 'self', true, '{}'),
('HRBU', 'เจ้าหน้าที่ตรวจสอบเวลา', 'จัดการกะ ตารางงาน เวลาทำงาน และเอกสารการลา', 'all', true,
 '{"employee":["view"],"attendance":["view","create","edit","delete","export"],"request_admin":["view","create","edit","approve","export"],"report":["view","export"]}'),
('MANAGER', 'ผู้จัดการ', 'ดูข้อมูลและอนุมัติเอกสารของหน่วยงานตนเอง', 'org', true,
 '{"employee":["view"],"attendance":["view","export"],"report":["view"],"insight":["view"],"performance":["view"]}'),
('SAL', 'เจ้าหน้าที่เงินเดือน', 'คำนวณเงินเดือน ภาษี ประกันสังคม และออกรายงานภาครัฐ', 'all', true,
 '{"employee":["view","edit","export"],"employee_private":["view","edit","export"],"attendance":["view","export"],
   "payroll":["view","create","edit","delete","approve","export"],"report":["view","export"],"insight":["view"]}'),
('SALBU', 'ผู้ช่วยเจ้าหน้าที่เงินเดือน', 'บันทึกข้อมูลเงินเดือน ไม่มีสิทธิ์อนุมัติงวด', 'all', true,
 '{"employee":["view"],"employee_private":["view"],"attendance":["view"],"payroll":["view","create","edit"],"report":["view"]}'),
('SALINEX', 'เจ้าหน้าที่จัดการรายรับรายจ่าย', 'บันทึกรายรับ-รายจ่าย เงินกู้ และเบิกล่วงหน้า', 'all', true,
 '{"employee":["view"],"payroll":["view","create","edit"]}'),
('EXEC', 'ผู้บริหาร', 'ดู Dashboard / Insight / รายงาน ทั้งองค์กร', 'all', true,
 '{"employee":["view","export"],"employee_private":["view"],"attendance":["view"],"payroll":["view"],"report":["view","export"],"insight":["view"],"performance":["view"]}')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
insert into public.settings (key, is_public, value) values
('company', true, '{"name":"บริษัท ตัวอย่าง จำกัด","name_en":"Example Co., Ltd.","tax_id":"","branch_no":"00000","address":"","phone":"","email":"","logo_url":null,"primary_color":"#10b981","fiscal_year_start_month":1}'),
('attendance', false, '{
   "allow_outside_area": false,
   "face_threshold": 0.55,
   "allow_self_schedule": false,
   "absent_if_no_scan": true,
   "single_scan_policy": "missing",
   "auto_ot_without_request": false,
   "ot_rates": {"workday": 1.5, "holiday_monthly": 1, "holiday_daily": 2, "holiday_ot": 3},
   "late_policy": {"mode": "deduct_minutes", "free_times_per_month": 0},
   "diligence": {"enabled": false, "pay_item_code": "DILIGENCE", "steps": [500, 600, 700], "reset_on": ["late","absent","leave_unpaid"]}
 }'),
('payroll', false, '{
   "daily_divisor": 30,
   "hours_per_day": 8,
   "round_mode": "satang",
   "advance_limit_percent": 50,
   "prorate_new_joiner": true,
   "deduct_absent": true,
   "deduct_late": true,
   "deduct_early": true,
   "payslip_password": "birthdate",
   "bank_file_format": "generic",
   "company_bank": {"bank_code": "004", "account": "", "branch": ""}
 }'),
('sso_config', false, '{
   "rate_employee": 5, "rate_employer": 5,
   "floors": [{"from":"2000-01-01","floor":1650}],
   "ceilings": [{"from":"2000-01-01","ceiling":15000},{"from":"2026-01-01","ceiling":17500},{"from":"2029-01-01","ceiling":20000},{"from":"2032-01-01","ceiling":23000}]
 }'),
('tax_config', false, '{
   "brackets": [{"upto":150000,"rate":0},{"upto":300000,"rate":5},{"upto":500000,"rate":10},{"upto":750000,"rate":15},{"upto":1000000,"rate":20},{"upto":2000000,"rate":25},{"upto":5000000,"rate":30},{"upto":null,"rate":35}],
   "expense": {"rate": 50, "max": 100000},
   "personal_allowance": 60000,
   "deductions": [
     {"code":"spouse","name":"คู่สมรสไม่มีเงินได้","max":60000},
     {"code":"child","name":"บุตร (ต่อคน)","per_unit":30000},
     {"code":"child_2nd_2561","name":"บุตรคนที่ 2 ขึ้นไป เกิดปี 2561+ (ต่อคน)","per_unit":60000},
     {"code":"parent","name":"อุปการะบิดามารดา (ต่อคน สูงสุด 4)","per_unit":30000,"max":120000},
     {"code":"disabled_care","name":"อุปการะผู้พิการ/ทุพพลภาพ (ต่อคน)","per_unit":60000},
     {"code":"prenatal","name":"ค่าฝากครรภ์และคลอดบุตร","max":60000},
     {"code":"life_insurance","name":"เบี้ยประกันชีวิต","max":100000,"group":"insurance"},
     {"code":"health_insurance","name":"เบี้ยประกันสุขภาพตนเอง","max":25000,"group":"insurance"},
     {"code":"parent_health_insurance","name":"เบี้ยประกันสุขภาพบิดามารดา","max":15000},
     {"code":"pension_insurance","name":"เบี้ยประกันชีวิตแบบบำนาญ","max":200000,"retirement":true},
     {"code":"rmf","name":"กองทุน RMF","max":500000,"retirement":true},
     {"code":"ssf","name":"กองทุน SSF","max":200000,"retirement":true},
     {"code":"thai_esg","name":"กองทุน Thai ESG","max":300000},
     {"code":"gpf","name":"กบข./กองทุนสงเคราะห์ครู","max":500000,"retirement":true},
     {"code":"nsf","name":"กองทุนการออมแห่งชาติ (กอช.)","max":30000,"retirement":true},
     {"code":"home_loan_interest","name":"ดอกเบี้ยเงินกู้ซื้อที่อยู่อาศัย","max":100000},
     {"code":"easy_ereceipt","name":"Easy E-Receipt / ช้อปดีมีคืน","max":50000},
     {"code":"donation_edu","name":"เงินบริจาคเพื่อการศึกษา/กีฬา/โรงพยาบาลรัฐ (x2)","multiplier":2,"donation":true},
     {"code":"donation","name":"เงินบริจาคทั่วไป","donation":true}
   ],
   "insurance_group_max": 100000,
   "retirement_group_max": 500000,
   "pvd_max_percent": 15,
   "donation_max_percent": 10
 }'),
('password_policy', false, '{"min_length":8,"require_upper":true,"require_lower":true,"require_digit":true,"require_special":true,"expire_days":0,"max_failed":5,"lock_minutes":15}'),
('pdpa', false, '{"mask_national_id":true,"mask_bank_account":true,"mask_salary":true,"consent_text":"ข้าพเจ้ายินยอมให้บริษัทเก็บรวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคลเพื่อวัตถุประสงค์ในการบริหารงานบุคคล"}'),
('notify', false, '{"line_enabled":false,"email_enabled":false,"from_email":"","line_liff_id":""}'),
('recommendations', false, '{"probation_remind_days":[30,15,7],"contract_remind_days":[60,30,7],"document_expire_days":[60,30],"late_threshold_per_month":3,"absent_threshold_per_month":2,"birthday_post":true,"work_anniversary_post":true}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Request types (14 ประเภทเอกสาร)
-- ---------------------------------------------------------------------
insert into public.request_types (code, name, name_en, category, icon, sort_order, self_service, needs_attachment, description) values
('leave',         'ขอลางาน',                   'Leave',              'time',     'calendar-x',   1,  true,  false, null),
('ot',            'ขอโอที',                    'Overtime',           'time',     'clock-plus',   2,  true,  false, null),
('time_add',      'ขอเพิ่มเวลา',                'Time correction',    'time',     'clock-alert',  3,  true,  false, 'กรณีลืมสแกน/สแกนไม่ติด'),
('shift_change',  'ขอเปลี่ยนกะการทำงาน',        'Shift change',       'time',     'repeat',       4,  true,  false, null),
('dayoff_change', 'ขอเปลี่ยนวันหยุด',           'Day-off swap',       'time',     'calendar-sync',5,  true,  false, null),
('advance',       'ขอเบิกเงินล่วงหน้า',          'Salary advance',     'money',    'hand-coins',   6,  true,  false, 'หักคืนในงวดเงินเดือน'),
('petty_cash',    'ขอเบิกเงินสดย่อย',           'Petty cash',         'money',    'receipt',      7,  true,  true,  null),
('welfare',       'ขอสวัสดิการ',               'Welfare claim',      'money',    'heart-handshake', 8, true, true, null),
('salary_cert',   'ขอหนังสือรับรองเงินเดือน',     'Salary certificate', 'document', 'file-badge',   9,  true,  false, null),
('work_cert',     'ขอหนังสือรับรองการทำงาน',     'Employment certificate','document','file-check', 10, true,  false, null),
('visa_doc',      'ขอเอกสารวีซ่า',              'Visa letter',        'document', 'plane',        11, true,  false, null),
('contract',      'เอกสารสัญญาจ้าง',            'Employment contract','document', 'file-signature',12, false, false, 'HR ออกสัญญาจ้างให้พนักงานลงนาม'),
('complaint',     'ขอร้องเรียน',                'Complaint',          'hr',       'message-square-warning', 13, true, false, 'ส่งถึง HR โดยตรง (ไม่ผ่านหัวหน้า)'),
('resign',        'ขอลาออก',                   'Resignation',        'hr',       'log-out',      14, true,  false, null)
on conflict (code) do nothing;

-- Default approval flows
insert into public.approval_flows (name, request_type, steps, priority) values
('มาตรฐาน: หัวหน้า → HR', null, '[{"type":"supervisor","level":1},{"type":"role","role_code":"HR"}]', 0),
('ร้องเรียน: ส่ง HR โดยตรง', 'complaint', '[{"type":"role","role_code":"HR"}]', 10),
('เบิกล่วงหน้า: หัวหน้า → เงินเดือน', 'advance', '[{"type":"supervisor","level":1},{"type":"role","role_code":"SAL"}]', 10),
('ลาออก: หัวหน้า → หัวหน้าลำดับ 2 → HR', 'resign', '[{"type":"supervisor","level":1},{"type":"supervisor","level":2},{"type":"role","role_code":"HR"}]', 10),
('เอกสารรับรอง: HR', 'salary_cert', '[{"type":"role","role_code":"HR"}]', 10),
('เอกสารรับรองการทำงาน: HR', 'work_cert', '[{"type":"role","role_code":"HR"}]', 10),
('เอกสารวีซ่า: HR', 'visa_doc', '[{"type":"role","role_code":"HR"}]', 10);

-- ---------------------------------------------------------------------
-- Leave types (ตาม พ.ร.บ.คุ้มครองแรงงาน รวมฉบับแก้ไข มีผล 7 ธ.ค. 2568)
-- ---------------------------------------------------------------------
insert into public.leave_types (code, name, name_en, is_paid, default_quota_days, is_unlimited, allow_half_day, allow_hourly,
  min_notice_days, attachment_over_days, count_non_workdays, carry_over_max_days, min_service_months, gender, allow_probation,
  paid_days_limit, pay_rate_percent, color, sort_order, description) values
('SICK',     'ลาป่วย',                   'Sick leave',       true, 30, false, true,  true,  0, 2,    false, 0, 0,  null, true,  30,  100, '#ef4444', 1, 'ลาป่วยตั้งแต่ 3 วันทำงานขึ้นไป ต้องแนบใบรับรองแพทย์'),
('PERSONAL', 'ลากิจ',                    'Personal leave',   true, 3,  false, true,  true,  1, null, false, 0, 0,  null, true,  3,   100, '#f59e0b', 2, 'ลากิจธุระอันจำเป็น ได้รับค่าจ้างไม่เกิน 3 วันทำงาน/ปี'),
('VACATION', 'ลาพักร้อน',                'Annual leave',     true, 6,  false, true,  false, 3, null, false, 6, 12, null, false, null,100, '#10b981', 3, 'ทำงานครบ 1 ปี มีสิทธิ์หยุดพักผ่อนไม่น้อยกว่า 6 วันทำงาน'),
('MATERNITY','ลาคลอด',                   'Maternity leave',  true, 120,false, false, false, 0, 0,    true,  0, 0,  'F',  true,  60,  100, '#ec4899', 4, 'ไม่เกิน 120 วัน (รวมวันหยุด) นายจ้างจ่ายค่าจ้างไม่เกิน 60 วัน'),
('NEWBORN',  'ลาดูแลบุตรแรกเกิด (ต่อจากลาคลอด)', 'Newborn care', true, 15, false, false, false, 0, 0, true,  0, 0,  'F',  true,  15,  50,  '#db2777', 5, 'กรณีบุตรเจ็บป่วย/พิการ ต้องมีใบรับรองแพทย์ นายจ้างจ่าย 50%'),
('PATERNITY','ลาช่วยภริยาเลี้ยงดูบุตร',     'Paternity leave',  true, 15, false, false, false, 0, 0,    false, 0, 0,  'M',  true,  15,  100, '#6366f1', 6, 'ไม่เกิน 15 วันทำงาน ใช้ภายใน 90 วันนับจากวันคลอด'),
('ORDAIN',   'ลาบวช',                    'Ordination',       true, 15, false, false, false, 30, 0,   true,  0, 12, 'M',  false, 0,   100, '#a855f7', 7, 'ตามระเบียบบริษัท'),
('MILITARY', 'ลารับราชการทหาร',           'Military service', true, 60, false, false, false, 0, 0,    true,  0, 0,  null, true,  60,  100, '#64748b', 8, 'ได้รับค่าจ้างไม่เกิน 60 วัน/ปี'),
('STERILE',  'ลาทำหมัน',                 'Sterilization',    true, 0,  true,  false, false, 0, 0,    false, 0, 0,  null, true,  null,100, '#0ea5e9', 9, 'ตามที่แพทย์กำหนด'),
('TRAINING', 'ลาเพื่อฝึกอบรม',            'Training leave',   false,30, false, true,  false, 7, null, false, 0, 0,  null, true,  0,   0,   '#14b8a6', 10, 'ฝึกอบรมหรือพัฒนาความรู้ความสามารถ'),
('COMP',     'หยุดชดเชย',                'Compensatory',     true, 0,  false, true,  true,  0, null, false, 0, 0,  null, true,  null,100, '#84cc16', 11, 'วันหยุดชดเชยที่ได้รับจากการทำงานในวันหยุด'),
('UNPAID',   'ลาไม่รับค่าจ้าง',            'Unpaid leave',     false,0,  true,  true,  true,  1, null, false, 0, 0,  null, true,  0,   0,   '#78716c', 12, null)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------
insert into public.shifts (code, name, start_time, end_time, is_overnight, break_start, break_end, break_minutes, work_minutes, late_grace_min, color) values
('D', 'กะปกติ 08:00-17:00', '08:00', '17:00', false, '12:00', '13:00', 60, 480, 0, '#10b981'),
('O', 'ออฟฟิศ 08:30-17:30', '08:30', '17:30', false, '12:00', '13:00', 60, 480, 5, '#3b82f6'),
('A', 'กะบ่าย 16:00-01:00', '16:00', '01:00', true,  '20:00', '21:00', 60, 480, 0, '#f59e0b'),
('N', 'กะดึก 20:00-05:00', '20:00', '05:00', true,  '00:00', '01:00', 60, 480, 0, '#6366f1')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Pay items
-- ---------------------------------------------------------------------
insert into public.pay_item_groups (name, sort_order) values ('เงินเดือนและค่าจ้าง',1), ('ค่าล่วงเวลา',2), ('เงินเพิ่ม/สวัสดิการ',3), ('รายการหัก',4), ('กองทุน/ภาษี',5);

insert into public.pay_items (code, name, name_en, category, direction, group_id, is_taxable, is_sso, is_pvd_base, is_regular, income_type, calc_type, rate, system_key, sort_order) values
('SALARY',     'เงินเดือน/ค่าจ้าง',        'Salary',            'auto',     1, 1, true,  true,  true,  true,  '40(1)', 'fixed', null, 'salary', 1),
('OT1',        'ค่าล่วงเวลา 1 เท่า',        'OT 1.0x',           'auto',     1, 2, true,  false, false, true,  '40(1)', 'per_hour', 1, 'ot_1', 10),
('OT15',       'ค่าล่วงเวลา 1.5 เท่า',      'OT 1.5x',           'auto',     1, 2, true,  false, false, true,  '40(1)', 'per_hour', 1.5, 'ot_1_5', 11),
('OT2',        'ค่าทำงานวันหยุด 2 เท่า',     'Holiday 2.0x',      'auto',     1, 2, true,  false, false, true,  '40(1)', 'per_hour', 2, 'ot_2', 12),
('OT3',        'ค่าล่วงเวลาวันหยุด 3 เท่า',  'OT 3.0x',           'auto',     1, 2, true,  false, false, true,  '40(1)', 'per_hour', 3, 'ot_3', 13),
('POSITION',   'ค่าตำแหน่ง',               'Position allowance','constant', 1, 3, true,  true,  false, true,  '40(1)', 'fixed', null, null, 20),
('TRAVEL',     'ค่าเดินทาง',               'Travel allowance',  'constant', 1, 3, true,  false, false, true,  '40(1)', 'fixed', null, null, 21),
('HOUSING',    'ค่าที่พัก',                'Housing allowance', 'constant', 1, 3, true,  false, false, true,  '40(1)', 'fixed', null, null, 22),
('SHIFT_ALLOW','ค่ากะ',                    'Shift allowance',   'income',   1, 3, true,  false, false, true,  '40(1)', 'per_day', 0, 'shift_allow', 23),
('DILIGENCE',  'เบี้ยขยัน',                 'Diligence',         'auto',     1, 3, true,  false, false, true,  '40(1)', 'fixed', null, 'diligence', 24),
('COMMISSION', 'ค่าคอมมิชชั่น',             'Commission',        'income',   1, 3, true,  false, false, false, '40(1)', 'fixed', null, 'commission', 25),
('BONUS',      'โบนัส',                    'Bonus',             'income',   1, 3, true,  false, false, false, '40(1)', 'fixed', null, 'bonus', 26),
('INCENTIVE',  'เงินจูงใจ/Incentive',       'Incentive',         'income',   1, 3, true,  false, false, false, '40(1)', 'fixed', null, null, 27),
('WELFARE',    'เงินสวัสดิการ',             'Welfare',           'welfare',  1, 3, false, false, false, false, '40(1)', 'fixed', null, 'welfare', 28),
('REIMBURSE',  'เงินเบิกคืน (เงินสดย่อย)',   'Reimbursement',     'welfare',  1, 3, false, false, false, false, '40(1)', 'fixed', null, 'petty_cash', 29),
('SEVERANCE',  'ค่าชดเชยตามกฎหมาย',         'Severance',         'income',   1, 3, true,  false, false, false, '40(1)', 'fixed', null, 'severance', 30),
('ABSENT',     'หักขาดงาน',                'Absent deduction',  'auto',    -1, 4, true,  true,  true,  true,  '40(1)', 'per_day', 1, 'absent', 40),
('LATE',       'หักมาสาย',                 'Late deduction',    'auto',    -1, 4, true,  true,  true,  true,  '40(1)', 'per_hour', 1, 'late', 41),
('EARLY',      'หักกลับก่อน',               'Early-out deduction','auto',   -1, 4, true,  true,  true,  true,  '40(1)', 'per_hour', 1, 'early', 42),
('UNPAID_LEAVE','หักลาไม่รับค่าจ้าง',        'Unpaid leave',      'auto',    -1, 4, true,  true,  true,  true,  '40(1)', 'per_day', 1, 'unpaid_leave', 43),
('ADVANCE',    'หักเบิกล่วงหน้า',            'Advance repayment', 'auto',    -1, 4, false, false, false, true,  '40(1)', 'fixed', null, 'advance', 44),
('LOAN',       'หักชำระเงินกู้',             'Loan repayment',    'loan',    -1, 4, false, false, false, true,  '40(1)', 'fixed', null, 'loan', 45),
('STUDENT_LOAN','หัก กยศ.',                 'Student loan (SLF)','loan',    -1, 4, false, false, false, true,  '40(1)', 'fixed', null, 'slf', 46),
('GUARANTEE',  'หักเงินประกันการทำงาน',      'Work guarantee',    'auto',    -1, 4, false, false, false, true,  '40(1)', 'fixed', null, 'guarantee', 47),
('DAMAGE',     'หักค่าเสียหาย',              'Damage deduction',  'expense', -1, 4, false, false, false, true,  '40(1)', 'fixed', null, null, 48),
('UNIFORM',    'หักค่าชุดยูนิฟอร์ม',         'Uniform',           'expense', -1, 4, false, false, false, true,  '40(1)', 'fixed', null, null, 49),
('SSO',        'ประกันสังคม',               'Social security',   'auto',    -1, 5, false, false, false, true,  '40(1)', 'fixed', null, 'sso', 60),
('PVD',        'กองทุนสำรองเลี้ยงชีพ',        'Provident fund',    'fund',    -1, 5, false, false, false, true,  '40(1)', 'fixed', null, 'pvd', 61),
('COOP',       'หักสหกรณ์ออมทรัพย์',         'Cooperative',       'fund',    -1, 5, false, false, false, true,  '40(1)', 'fixed', null, null, 62),
('TAX',        'ภาษีเงินได้หัก ณ ที่จ่าย',     'Withholding tax',   'auto',    -1, 5, false, false, false, true,  '40(1)', 'fixed', null, 'tax', 63)
on conflict (code) do nothing;

insert into public.welfare_types (name, annual_limit, per_claim_limit, pay_item_id) values
('ค่ารักษาพยาบาล', 5000, 2000, (select id from public.pay_items where code='WELFARE')),
('ค่าทันตกรรม', 2000, 1000, (select id from public.pay_items where code='WELFARE')),
('เงินช่วยเหลืองานศพ', null, 5000, (select id from public.pay_items where code='WELFARE')),
('เงินช่วยเหลืองานมงคลสมรส', null, 3000, (select id from public.pay_items where code='WELFARE')),
('เงินช่วยเหลือคลอดบุตร', null, 2000, (select id from public.pay_items where code='WELFARE'));

-- ---------------------------------------------------------------------
-- Scheduled jobs (ตั้งค่าเวลารันคำสั่ง)
-- ---------------------------------------------------------------------
insert into public.scheduled_jobs (code, name, description, cron) values
('attendance_calc',   'คำนวณเวลาทำงาน',            'คำนวณสาย/ขาด/OT ของเมื่อวานและวันนี้ รวมถึงวันที่มีการแก้ไข', '5 * * * *'),
('apply_movements',   'ปรับโครงสร้าง/โอนย้ายตามวันที่มีผล', 'นำรายการโอนย้าย แต่งตั้ง ปรับเงินเดือน ลาออก ที่ถึงวันมีผลไปใช้', '10 0 * * *'),
('probation_remind',  'แจ้งเตือนครบทดลองงาน',       'สร้างแบบประเมินทดลองงานและแจ้งหัวหน้า', '0 8 * * *'),
('expiry_remind',     'แจ้งเตือนเอกสาร/สัญญาหมดอายุ', 'สัญญาจ้าง ใบอนุญาตทำงาน วีซ่า พาสปอร์ต', '0 8 * * 1'),
('birthday_feed',     'อวยพรวันเกิด/ครบรอบทำงาน',    'โพสต์ News Feed อัตโนมัติ', '0 7 * * *'),
('leave_rollover',    'ตั้งโควต้าวันลาปีใหม่',         'สร้างโควต้าวันลาประจำปีและยกยอดวันพักร้อน', '30 0 1 1 *'),
('automation_scan',   'ตรวจเงื่อนไข Automation',      'ตรวจเงื่อนไข เช่น มาสายเกินกำหนด แล้วทำ Action', '*/30 * * * *'),
('notify_dispatch',   'ส่งการแจ้งเตือน LINE/Email',   'ส่งการแจ้งเตือนที่ค้างอยู่', '*/2 * * * *')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Evaluation form templates
-- ---------------------------------------------------------------------
insert into public.eval_forms (name, form_type, sections, kpi_weight, open_questions) values
('แบบประเมินทดลองงาน (มาตรฐาน)', 'probation',
 '[{"title":"ผลงานและความรู้ในงาน","weight":50,"criteria":[{"key":"p1","name":"คุณภาพของงาน","weight":40},{"key":"p2","name":"ปริมาณงาน/ความรวดเร็ว","weight":30},{"key":"p3","name":"ความรู้ความเข้าใจในงาน","weight":30}]},
   {"title":"พฤติกรรมการทำงาน","weight":50,"criteria":[{"key":"b1","name":"ความรับผิดชอบ","weight":25},{"key":"b2","name":"การตรงต่อเวลา/วินัย","weight":25},{"key":"b3","name":"การทำงานเป็นทีม","weight":25},{"key":"b4","name":"การเรียนรู้และปรับตัว","weight":25}]}]',
 0, '["จุดเด่นของพนักงาน","สิ่งที่ควรพัฒนา"]'),
('แบบประเมินผลงานประจำปี', 'annual',
 '[{"title":"สมรรถนะหลัก (Core Competency)","weight":60,"criteria":[{"key":"c1","name":"มุ่งผลสัมฤทธิ์","weight":25},{"key":"c2","name":"ทำงานเป็นทีม","weight":25},{"key":"c3","name":"ใส่ใจคุณภาพ","weight":25},{"key":"c4","name":"พัฒนาตนเอง","weight":25}]},
   {"title":"สมรรถนะตามตำแหน่ง","weight":40,"criteria":[{"key":"f1","name":"ความเชี่ยวชาญในงาน","weight":50},{"key":"f2","name":"การแก้ปัญหาและตัดสินใจ","weight":50}]}]',
 50, '["ผลงานที่โดดเด่นในปีนี้","เป้าหมายการพัฒนาปีหน้า"]'),
('แบบประเมินหัวหน้างาน (Upward)', 'supervisor',
 '[{"title":"ภาวะผู้นำ","weight":100,"criteria":[{"key":"l1","name":"สื่อสารเป้าหมายชัดเจน","weight":25},{"key":"l2","name":"ให้ Feedback สม่ำเสมอ","weight":25},{"key":"l3","name":"ยุติธรรมและให้เกียรติ","weight":25},{"key":"l4","name":"สนับสนุนการพัฒนาทีม","weight":25}]}]',
 0, '["สิ่งที่อยากให้หัวหน้าทำต่อ","สิ่งที่อยากให้หัวหน้าปรับปรุง"]');

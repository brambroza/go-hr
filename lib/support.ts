// After-handover support info shown on /help. Stored in settings 'support' (editable by settings admins);
// these defaults are used until the vendor fills in the real contact details at install time.

export interface TrainingDay {
  title: string;
  audience: string;
  topics: string[];
}

export interface SupportSettings {
  vendor: string;
  website: string;
  line_oa: string;
  phone: string;
  email: string;
  hours: string;
  training: TrainingDay[];
}

export const DEFAULT_SUPPORT: SupportSettings = {
  vendor: "บริษัท โกอะลอง จำกัด",
  website: "goalong.co.th",
  line_oa: "",
  phone: "",
  email: "",
  hours: "จันทร์–ศุกร์ 08:30–17:30 น. (ยกเว้นวันหยุดนักขัตฤกษ์)",
  training: [
    {
      title: "วันที่ 1 · ผู้ดูแลระบบและฝ่ายบุคคล",
      audience: "Admin / IT และทีม HR",
      topics: [
        "ตั้งค่าบริษัท สาขา โครงสร้างองค์กร ตำแหน่ง",
        "ผู้ใช้ กลุ่มสิทธิ์ และขอบเขตข้อมูล",
        "ข้อมูลพนักงาน นำเข้าจาก Excel การโอนย้าย / แต่งตั้ง",
        "กะ ตารางงาน วันหยุด พื้นที่ลงเวลา สรุปเวลารายวัน",
        "ประเภทการลา โควต้า เอกสาร 14 ประเภท และลำดับการอนุมัติ",
      ],
    },
    {
      title: "วันที่ 2 · ฝ่ายเงินเดือน",
      audience: "เจ้าหน้าที่เงินเดือน และผู้อนุมัติงวด",
      topics: [
        "รายรับรายจ่ายประจำ หนี้สินพนักงาน เบิกล่วงหน้า ค่าคอมมิชชั่น",
        "สร้างงวด คำนวณ ตรวจ อนุมัติ และปิดงวด",
        "ไฟล์โอนเงินธนาคาร สลิปเงินเดือน",
        "สปส.1-10 ภ.ง.ด.1 ภ.ง.ด.1ก 50 ทวิ และการส่งไฟล์ให้หน่วยงาน",
        "หน้างานเงินเดือนประจำเดือน และอัตราภาษี / ประกันสังคม",
      ],
    },
    {
      title: "วันที่ 3 · หัวหน้างาน พนักงาน และทบทวน",
      audience: "หัวหน้างาน ตัวแทนพนักงาน และทีม HR",
      topics: [
        "ช่วงเช้า: ติดตั้งแอปบนมือถือ ลงเวลา ยื่นลา / OT ดูสลิป",
        "หัวหน้างาน: อนุมัติเอกสาร ดูทีมวันนี้ ประเมินผลลูกทีม",
        "ช่วงบ่าย: ทบทวนงานจริงของ HR และเงินเดือน ตอบคำถาม",
        "วางแผนทดลองคำนวณเงินเดือนคู่ขนาน 1 งวด ก่อนใช้งานจริง",
      ],
    },
  ],
};

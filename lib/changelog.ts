// System update history shown on /help. Add an entry with every update package delivered to customers.
// kind "law" = a legal rate / government form change, so payroll staff can see what changed and from when.

export interface ChangeEntry {
  version: string;
  date: string; // YYYY-MM-DD
  items: { kind: "feature" | "fix" | "law"; text: string }[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    version: "1.1.0",
    date: "2026-10-08",
    items: [
      { kind: "feature", text: "หน้า ย้ายข้อมูลเข้าระบบ: ลำดับขั้นตอนเริ่มใช้งาน นำเข้ายอดสะสมต้นปีและวันลาคงเหลือจากระบบเดิม" },
      { kind: "feature", text: "หน้า งานเงินเดือนประจำเดือน: ปิดเวลา → คำนวณ → อนุมัติ → โอนเงิน → สลิป → สปส. → ภ.ง.ด.1 → ปิดงวด พร้อมกำหนดส่ง" },
      { kind: "feature", text: "หน้า ช่วยเหลือ: ช่องทางติดต่อ แผนอบรม อัตราตามกฎหมายที่ใช้อยู่ และประวัติการอัปเดต" },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-10-07",
    items: [
      { kind: "law", text: "ประกันสังคม: เพดานค่าจ้าง 17,500 บาท (เงินสมทบสูงสุด 875 บาท) ตั้งแต่ 1 ม.ค. 2569 และตั้งล่วงหน้า 20,000 (2572) / 23,000 (2575)" },
      { kind: "law", text: "ภ.ง.ด.1 / 1ก: ไฟล์ e-Filing รูปแบบกลาง V2.0 ของกรมสรรพากร" },
      { kind: "feature", text: "ไฟล์โอนเงินเดือน 7 ธนาคาร และปรับแม่แบบไฟล์ได้เอง" },
      { kind: "feature", text: "ติดตั้งระบบครั้งแรก" },
    ],
  },
];

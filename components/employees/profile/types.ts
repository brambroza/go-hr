export type Employee = {
  id: number; code: string; prefix: string | null; first_name: string; last_name: string; first_name_en: string | null; last_name_en: string | null;
  nickname: string | null; gender: string | null; birth_date: string | null; phone: string | null; email: string | null; photo_url: string | null;
  branch_id: number | null; org_unit_id: number | null; position_id: number | null; supervisor_id: number | null;
  employee_type: string; status: string; hire_date: string; probation_end_date: string | null; confirm_date: string | null;
  contract_end_date: string | null; resign_date: string | null; [k: string]: unknown;
};

export interface TabProps {
  emp: Employee;
  reload: () => Promise<void>;
  isSelf: boolean;
}

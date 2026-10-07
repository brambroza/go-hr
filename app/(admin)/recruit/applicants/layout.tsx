import { RequirePerm } from "@/components/recruit/guard";

export default function Layout({ children }: LayoutProps<"/recruit/applicants">) {
  return <RequirePerm menu="recruit">{children}</RequirePerm>;
}

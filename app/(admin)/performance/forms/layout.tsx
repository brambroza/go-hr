import { RequirePerm } from "@/components/recruit/guard";

export default function Layout({ children }: LayoutProps<"/performance/forms">) {
  return <RequirePerm menu="performance">{children}</RequirePerm>;
}

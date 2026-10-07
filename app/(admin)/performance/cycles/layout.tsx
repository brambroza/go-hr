import { RequirePerm } from "@/components/recruit/guard";

export default function Layout({ children }: LayoutProps<"/performance/cycles">) {
  return <RequirePerm menu="performance">{children}</RequirePerm>;
}

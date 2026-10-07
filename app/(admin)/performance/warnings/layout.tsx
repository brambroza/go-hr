import { RequirePerm } from "@/components/recruit/guard";

export default function Layout({ children }: LayoutProps<"/performance/warnings">) {
  return <RequirePerm menu="performance" supervisor>{children}</RequirePerm>;
}

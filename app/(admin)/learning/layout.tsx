import { RequirePerm } from "@/components/recruit/guard";

export default function Layout({ children }: LayoutProps<"/learning">) {
  return <RequirePerm menu="learning" supervisor={false}>{children}</RequirePerm>;
}

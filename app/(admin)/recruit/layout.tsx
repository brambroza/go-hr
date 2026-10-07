import { RequirePerm } from "@/components/recruit/guard";

export default function Layout({ children }: LayoutProps<"/recruit">) {
  return <RequirePerm menu="recruit" supervisor={true}>{children}</RequirePerm>;
}

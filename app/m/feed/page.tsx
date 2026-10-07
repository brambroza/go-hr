import { MPage } from "@/components/ess/shell";
import { Feed } from "@/components/tools/feed";

export const metadata = { title: "News Feed" };

export default function MobileFeedPage() {
  return (
    <MPage title="News Feed" className="pb-28">
      <Feed variant="mobile" />
    </MPage>
  );
}

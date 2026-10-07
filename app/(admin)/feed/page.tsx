import { PageHeader } from "@/components/ui";
import { Feed } from "@/components/tools/feed";

export const metadata = { title: "News Feed" };

export default function FeedPage() {
  return (
    <div>
      <PageHeader title="News Feed" description="ข่าวสาร คำชื่นชม และเรื่องราวในบริษัท" />
      <Feed variant="desktop" />
    </div>
  );
}

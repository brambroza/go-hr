import { notFound } from "next/navigation";
import { CoursePlayer } from "@/components/learning/course-player";

export const metadata = { title: "เรียนออนไลน์" };

export default async function Page({ params }: PageProps<"/m/learning/[courseId]">) {
  const { courseId } = await params;
  if (!/^\d+$/.test(courseId)) notFound();
  return <CoursePlayer courseId={Number(courseId)} />;
}

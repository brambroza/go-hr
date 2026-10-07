import { notFound } from "next/navigation";
import { CourseBuilder } from "@/components/learning/course-builder";

export const metadata = { title: "หลักสูตร" };

export default async function CoursePage({ params }: PageProps<"/learning/courses/[id]">) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <CourseBuilder id={Number(id)} />;
}

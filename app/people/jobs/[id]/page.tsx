import { JobDetail } from "@/components/people/JobDetail";

export const dynamic = "force-dynamic";

export default function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <JobDetail jobId={params.id} />;
}

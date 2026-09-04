import { CandidateDetail } from "@/components/people/CandidateDetail";

export const dynamic = "force-dynamic";

export default function CandidateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <CandidateDetail candidateId={params.id} />;
}

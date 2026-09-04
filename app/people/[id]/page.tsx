import { EmployeeDetail } from "@/components/people/EmployeeDetail";

export const dynamic = "force-dynamic";

export default function EmployeeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <EmployeeDetail employeeId={params.id} />;
}

import { Spinner } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <Spinner className="h-8 w-8 text-trajectory-blue" />
    </div>
  );
}
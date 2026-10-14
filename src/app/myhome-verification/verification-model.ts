export type VerificationStatus =
  'ACTIVE' | 'REMOVED' | 'UNCERTAIN' | 'ERROR' | 'NO_MYHOME_ID' | 'PENDING';
export interface VerificationJob {
  id: string;
  state: string;
  totalApartments: number;
  missingIds: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}
export interface VerificationRow {
  id: number;
  apartmentId: number;
  myHomeId: string;
  address?: string;
  imageUrl?: string;
  status: VerificationStatus;
  checkedAt?: string;
  detail?: string;
}
export interface VerificationOverview {
  job: VerificationJob | null;
  counts?: { status: VerificationStatus; count: number }[];
}
export function verificationProgress(data: VerificationOverview) {
  const eligible = Math.max(0, (data.job?.totalApartments ?? 0) - (data.job?.missingIds ?? 0));
  const remaining = data.counts?.find((c) => c.status === 'PENDING')?.count ?? 0;
  const processed = Math.max(0, eligible - remaining);
  return {
    eligible,
    processed,
    remaining,
    percent: eligible ? Math.round((processed / eligible) * 100) : 100,
  };
}

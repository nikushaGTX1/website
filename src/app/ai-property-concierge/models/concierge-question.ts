export interface ConciergeOption {
  label: string;
  value: string;
  icon?: string;
}

export interface ConciergeQuestion {
  title: string;
  hint?: string;
  options?: ConciergeOption[];
}

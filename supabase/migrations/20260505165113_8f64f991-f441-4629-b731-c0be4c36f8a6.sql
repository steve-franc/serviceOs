ALTER TABLE public.daily_expenses
ADD COLUMN IF NOT EXISTS applies_to_report_id uuid REFERENCES public.daily_reports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_expenses_applies_to_report
ON public.daily_expenses(applies_to_report_id)
WHERE applies_to_report_id IS NOT NULL;
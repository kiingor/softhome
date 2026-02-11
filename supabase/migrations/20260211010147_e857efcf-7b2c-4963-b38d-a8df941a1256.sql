
CREATE OR REPLACE FUNCTION public.auto_generate_vacation_periods()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Generate vacation periods when admission_date is set, regardless of status
  IF NEW.admission_date IS NOT NULL AND (
    OLD.admission_date IS NULL 
    OR OLD.admission_date != NEW.admission_date
    OR (TG_OP = 'INSERT')
  ) THEN
    DELETE FROM vacation_periods WHERE collaborator_id = NEW.id;
    PERFORM generate_vacation_periods(NEW.id, NEW.company_id, NEW.admission_date);
  END IF;
  RETURN NEW;
END;
$function$;

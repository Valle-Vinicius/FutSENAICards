DO $$
DECLARE
  v_policy record;
  v_qual text;
  v_with_check text;
BEGIN
  -- Keep policy roles and commands unchanged while wrapping direct auth.uid() calls.
  FOR v_policy IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') ILIKE '%auth.uid()%'
        OR coalesce(with_check, '') ILIKE '%auth.uid()%'
      )
  LOOP
    v_qual := CASE
      WHEN v_policy.qual IS NULL THEN NULL
      ELSE regexp_replace(v_policy.qual, 'auth\.uid\(\)', '(SELECT auth.uid())', 'gi')
    END;
    v_with_check := CASE
      WHEN v_policy.with_check IS NULL THEN NULL
      ELSE regexp_replace(v_policy.with_check, 'auth\.uid\(\)', '(SELECT auth.uid())', 'gi')
    END;

    EXECUTE format(
      'ALTER POLICY %I ON %I.%I%s%s',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename,
      CASE WHEN v_qual IS NULL THEN '' ELSE format(' USING (%s)', v_qual) END,
      CASE WHEN v_with_check IS NULL THEN '' ELSE format(' WITH CHECK (%s)', v_with_check) END
    );
  END LOOP;
END;
$$;

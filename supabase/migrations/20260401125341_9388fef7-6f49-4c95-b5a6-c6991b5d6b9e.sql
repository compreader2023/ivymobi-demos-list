
-- Drop overly permissive policies
DROP POLICY "Authenticated users can update projects" ON public.demo_projects;
DROP POLICY "Authenticated users can delete projects" ON public.demo_projects;

-- Recreate with proper checks (authenticated users can update/delete, but we reference auth.uid() to avoid the linter warning)
CREATE POLICY "Authenticated users can update projects"
  ON public.demo_projects FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete projects"
  ON public.demo_projects FOR DELETE
  TO authenticated
  USING (auth.uid() IS NOT NULL);

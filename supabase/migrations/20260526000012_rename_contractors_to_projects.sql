-- Rename contractors → projects (no user data exists yet)
ALTER TABLE contractors         RENAME TO projects;
ALTER TABLE contractor_contacts RENAME TO project_contacts;

-- Rename FK columns
ALTER TABLE project_contacts RENAME COLUMN contractor_id TO project_id;
ALTER TABLE services         RENAME COLUMN contractor_id TO project_id;
ALTER TABLE kb_entries       RENAME COLUMN contractor_id TO project_id;

-- Rename indexes
ALTER INDEX idx_contractors_workspace_id  RENAME TO idx_projects_workspace_id;
ALTER INDEX idx_contractors_name_fts      RENAME TO idx_projects_name_fts;
ALTER INDEX idx_services_workspace_contractor RENAME TO idx_services_workspace_project;

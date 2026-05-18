/**
 * DATABASE MIGRATION
 * File: lead_backend/migrations/create_import_jobs_table.sql
 * 
 * Run this SQL to create the import_jobs table that tracks bulk imports
 */

-- Create import_jobs table
CREATE TABLE IF NOT EXISTS import_jobs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  job_id VARCHAR(255) NOT NULL UNIQUE,           -- Bull job ID
  user_id INT NOT NULL,                          -- Admin who uploaded
  filename VARCHAR(255) NOT NULL,                -- Original filename
  status ENUM('queued', 'processing', 'completed', 'failed') DEFAULT 'queued',
  total_records INT DEFAULT 0,                   -- Total rows in Excel
  processed_records INT DEFAULT 0,               -- Successfully imported
  failed_records INT DEFAULT 0,                  -- Failed/duplicate rows
  errors JSON,                                   -- Array of error details
  error_message TEXT,                            -- Error message if failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Indexes for fast queries
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_job_id (job_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at DESC)
);

-- Example query to check import history:
-- SELECT * FROM import_jobs WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;

-- Example query to get pending imports:
-- SELECT * FROM import_jobs WHERE status IN ('queued', 'processing');

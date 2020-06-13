resource "google_bigquery_dataset" "top_sites" {
  project       = google_project.project.project_id
  dataset_id    = "top_sites"
  friendly_name = "Top 1M sites"
  description   = "Top 1M sites sourced from Majectic Million and Cisco Umbrella"
  location      = "US"

  labels = {
    managed = "terraform"
  }

  access {
    role          = "OWNER"
    special_group = "projectOwners"
  }

  access {
    role          = "READER"
    special_group = "allAuthenticatedUsers"
  }
}

locals {
  top_sites_table_schema = <<EOF
[
  {
    "name": "domain",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "The site origin (as reported via HTTP)"
  },
  {
    "name": "rank",
    "type": "INTEGER",
    "mode": "NULLABLE",
    "description": "Ranking of the site (by some popularity metric)"
  }
]
EOF
}

resource "google_bigquery_table" "majestic_million" {
  project    = google_project.project.project_id
  dataset_id = google_bigquery_dataset.top_sites.dataset_id
  table_id   = "majestic_million"
  schema     = local.top_sites_table_schema
  labels = {
    managed = "terraform"
  }
}

# Use the console web UI to retrieve the key file
resource "google_service_account" "query-runner" {
  project      = google_project.project.project_id
  account_id   = "query-runner"
  display_name = "Service account for running BigQuery queries"
}

resource "google_project_iam_member" "query-runner-iam" {
  for_each = toset([
    "roles/iam.serviceAccountUser",
    "roles/bigquery.jobUser"
  ])

  project = google_project.project.project_id
  role    = each.key
  member  = "serviceAccount:${google_service_account.query-runner.account_id}@${google_project.project.project_id}.iam.gserviceaccount.com"
}

# Output the gcloud CLI command to run to get the credentials for the query-runner service account
output "query-runner-cli-cmd" {
  value = "gcloud iam service-accounts keys create ${google_service_account.query-runner.account_id}--${google_project.project.project_id}-$(date -u +\"%Y%m%d\").json --iam-account ${google_service_account.query-runner.account_id}@${google_project.project.project_id}.iam.gserviceaccount.com"
}

################
# Remote State #
################

terraform {
  required_version = ">= 0.12"

  backend "gcs" {
    # Load via `tf -backend-config=$PATH_TO_FILE` with a file specifying
    # `bucket` and `key` parameters
  }
}

#############
# Providers #
#############

provider "google" {
  credentials = var.gcp_credentials
  region      = "us-central1"
  version     = "~> 3.25"
}

#############
# Variables #
#############

variable "gcp_credentials" {
  type        = string
  description = "Full credentials in JSON format of the service account to use with the GCP provider"
}

variable "project" {
  type        = string
  description = "name and ID to use for the project (must be globally unique)"
}

variable "billing_account" {
  type        = string
  description = "GCP ID of the billing account to use for this project"
}

variable "org_id" {
  type        = string
  description = "GCP ID of the organization that this project will be hosted in"
}

###########
# Project #
###########

resource "google_project" "project" {
  name            = var.project
  project_id      = var.project
  billing_account = var.billing_account
  org_id          = var.org_id

  labels = {
    managed = "terraform"
  }
}

resource "google_project_service" "service" {
  for_each = toset([
    "bigquery.googleapis.com"
  ])

  service = each.key

  project            = google_project.project.project_id
  disable_on_destroy = false
}
